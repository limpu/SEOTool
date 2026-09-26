import { safeFetch, CrawlFetchError } from "./safe-fetch";
import { KNOWN_AI_CRAWLER_NAMES_BY_TOKEN } from "./ai-crawler-registry";

export interface Rule {
  path: string;
  allow: boolean;
}

/** A single `User-agent:` block: the agent tokens it applies to, and its Allow/Disallow rules. */
export interface RobotsGroup {
  agents: string[];
  rules: Rule[];
}

export interface RobotsRules {
  rules: Rule[];
  sitemaps: string[];
  found: boolean;
  syntaxWarnings: string[];
  /** Canonical names of known AI crawlers that have their own dedicated User-agent group (not just "*"). */
  aiCrawlerGroups: string[];
  /**
   * Every parsed User-agent group (agents + rules), not just the one chosen
   * for our own crawler. Needed by Phase 19's per-crawler verdict, which
   * must evaluate each named AI crawler against *its own* dedicated group
   * (or the wildcard group) rather than the group chosen for us. Optional
   * for backward compatibility with hand-built RobotsRules test fixtures
   * from Phase 13 that predate this field; treat a missing value as `[]`.
   */
  rawGroups?: RobotsGroup[];
}

const OUR_USER_AGENT_TOKEN = "aiseointelligenceplatform-crawler";

/**
 * Known AI crawler user-agent tokens (lowercase) mapped to a display name.
 * Sourced from the central AI crawler registry (Phase 19,
 * `ai-crawler-registry.ts`) rather than duplicated here — this list is only
 * used here to note *that* a site has custom rules for a named AI crawler;
 * the full allowed/blocked/partial/unknown verdict per crawler lives in
 * `ai-crawler-analysis.ts`.
 */
const KNOWN_AI_CRAWLERS: Record<string, string> = KNOWN_AI_CRAWLER_NAMES_BY_TOKEN;

/** Converts a robots.txt path pattern (supporting `*` wildcards and a trailing `$` anchor) into a RegExp. */
function patternToRegex(pattern: string): RegExp {
  const hasEndAnchor = pattern.endsWith("$");
  const body = hasEndAnchor ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${hasEndAnchor ? "$" : ""}`);
}

/**
 * Minimal robots.txt parser: groups by User-agent, picks the most specific
 * group that matches our crawler (falling back to "*"), and implements
 * longest-match-wins with Allow beating Disallow on an exact-length tie —
 * the standard robots.txt precedence rule. Also collects basic syntax
 * warnings and notes which known AI crawlers have a dedicated group.
 */
export function parseRobotsTxt(text: string): RobotsRules {
  const lines = text.split(/\r?\n/);

  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let currentGroup: { agents: string[]; rules: Rule[] } | null = null;
  const sitemaps: string[] = [];
  const syntaxWarnings: string[] = [];

  lines.forEach((rawLine, index) => {
    const line = rawLine.split("#")[0].trim();
    if (!line) return;

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      syntaxWarnings.push(`Line ${index + 1}: not a recognized "directive: value" line.`);
      return;
    }

    const directive = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (directive === "user-agent") {
      // A new User-agent line right after rules starts a new group; a
      // consecutive User-agent line (no rules yet) extends the same group.
      if (currentGroup && currentGroup.rules.length > 0) {
        currentGroup = null;
      }
      if (!currentGroup) {
        currentGroup = { agents: [], rules: [] };
        groups.push(currentGroup);
      }
      currentGroup.agents.push(value.toLowerCase());
    } else if (directive === "disallow") {
      if (!currentGroup) {
        syntaxWarnings.push(`Line ${index + 1}: Disallow appears before any User-agent line.`);
      } else if (value !== "") {
        currentGroup.rules.push({ path: value, allow: false });
      }
    } else if (directive === "allow") {
      if (!currentGroup) {
        syntaxWarnings.push(`Line ${index + 1}: Allow appears before any User-agent line.`);
      } else if (value !== "") {
        currentGroup.rules.push({ path: value, allow: true });
      }
    } else if (directive === "sitemap") {
      if (value) sitemaps.push(value);
    }
    // Other directives (crawl-delay, host, clean-param, etc.) are recognized
    // by real crawlers but aren't part of this tool's scope — not flagged as errors.
  });

  const specific = groups.find((g) => g.agents.some((a) => a.includes(OUR_USER_AGENT_TOKEN)));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  const chosen = specific ?? wildcard;

  const aiCrawlerGroups = Array.from(
    new Set(
      groups
        .flatMap((g) => g.agents)
        .map((a) => KNOWN_AI_CRAWLERS[a])
        .filter((name): name is string => !!name)
    )
  );

  return { rules: chosen?.rules ?? [], sitemaps, found: true, syntaxWarnings, aiCrawlerGroups, rawGroups: groups };
}

/**
 * Returns the single rule that determines the outcome for `pathWithQuery`
 * under the standard robots.txt precedence: longest matching path wins,
 * Allow wins an equal-length tie. Returns `null` when no rule matches
 * (which means "allowed" by default). Exposed (not just the boolean
 * `isPathAllowedForRules`) so callers like Phase 19's per-crawler verdict
 * can cite the exact directive responsible, not just the yes/no outcome.
 */
export function getMatchingRule(rules: Rule[], pathWithQuery: string): Rule | null {
  let best: Rule | null = null;

  for (const rule of rules) {
    if (!patternToRegex(rule.path).test(pathWithQuery)) continue;
    if (!best || rule.path.length > best.path.length) {
      best = rule;
    } else if (rule.path.length === best.path.length && rule.allow && !best.allow) {
      best = rule; // tie: Allow wins
    }
  }

  return best;
}

/** Same matching algorithm as `isPathAllowed`, but against an arbitrary rule list rather than a full `RobotsRules`. */
export function isPathAllowedForRules(rules: Rule[], pathWithQuery: string): boolean {
  const best = getMatchingRule(rules, pathWithQuery);
  return best ? best.allow : true;
}

export function isPathAllowed(rules: RobotsRules, pathWithQuery: string): boolean {
  return isPathAllowedForRules(rules.rules, pathWithQuery);
}

const ROBOTS_MAX_BYTES = 512 * 1024;

/**
 * The fetch outcome for robots.txt alongside its parsed rules.
 *
 * Phase 37 addition. `fetchRobotsRules` previously threw away everything
 * except the rules, which is why the Robots.txt report could say "found" but
 * could never show the file. Nothing about the parsing or the "missing
 * robots.txt means allow everything" behaviour changed — this only KEEPS what
 * was already fetched so the crawl can persist it (see `robots_files`).
 */
export interface RobotsDocument {
  url: string;
  rules: RobotsRules;
  httpStatus: number | null;
  /** The file's own bytes, verbatim. NULL when nothing was retrieved. */
  rawContent: string | null;
  /** Plain-language reason no body was retrieved, or null. */
  fetchError: string | null;
  /** True when the response exceeded the byte cap, so no body was kept at all. */
  overSizeCap: boolean;
}

/**
 * Fetches and parses a site's robots.txt, keeping the raw response. A missing
 * or unfetchable robots.txt is treated as "allow everything" (standard
 * behavior) rather than an error — crawling should not simply fail because a
 * site has no robots.txt.
 */
export async function fetchRobotsDocument(origin: string): Promise<RobotsDocument> {
  const url = new URL("/robots.txt", origin).toString();
  const absent: RobotsRules = { rules: [], sitemaps: [], found: false, syntaxWarnings: [], aiCrawlerGroups: [] };

  try {
    const res = await safeFetch(url, { maxBytes: ROBOTS_MAX_BYTES });
    if (res.status >= 200 && res.status < 300) {
      return {
        url,
        rules: parseRobotsTxt(res.body),
        httpStatus: res.status,
        rawContent: res.body,
        fetchError: null,
        overSizeCap: false,
      };
    }
    return { url, rules: absent, httpStatus: res.status, rawContent: null, fetchError: null, overSizeCap: false };
  } catch (err) {
    if (err instanceof CrawlFetchError) {
      return {
        url,
        rules: absent,
        httpStatus: null,
        rawContent: null,
        fetchError: err.message,
        overSizeCap: err.kind === "too_large",
      };
    }
    throw err;
  }
}

/** Backwards-compatible wrapper: the parsed rules only, exactly as before. */
export async function fetchRobotsRules(origin: string): Promise<RobotsRules> {
  return (await fetchRobotsDocument(origin)).rules;
}
