import type { CheckResult } from "../types";

/**
 * Web Installer — the existing `/api/health` contract.
 *
 * `/api/health` already exists (Phase 34) with a fixed, documented contract:
 * 200 `{status:"ok", checks:{database:"ok"}}` when a `SELECT 1` succeeds,
 * 503 `{status:"error", …}` when it does not, and deliberately no error
 * detail in either case. This check CALLS that endpoint over HTTP rather
 * than re-implementing the query, because it is verifying something the
 * database probe cannot: that the HTTP surface is actually serving — that a
 * load balancer's readiness probe pointed here will get the right answer.
 * A direct database query would prove the database is up while an incorrectly
 * routed or proxied application still failed every probe.
 *
 * Nothing about `/api/health` is modified. This is a consumer of the
 * existing contract, not a change to it.
 */

export interface HealthProbeFacts {
  httpStatus: number | null;
  body: { status?: string; checks?: { database?: string } } | null;
  /** Sanitized transport-level failure, when the request never completed. */
  transportError?: string;
  url: string;
}

export function evaluateHealth(facts: HealthProbeFacts): CheckResult {
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "health.endpoint",
    group: "health",
    label: "Health endpoint (/api/health)",
    blocking: false,
  };

  if (facts.httpStatus === null) {
    return {
      ...base,
      status: "unknown",
      summary: "The health endpoint could not be reached from the server itself.",
      detail:
        `A request to ${facts.url} did not complete${facts.transportError ? `: ${facts.transportError}` : "."} ` +
        "This is a loopback request the application makes to itself, so a failure usually means the origin the installer inferred is not the address this process actually listens on — not that the application is down (you are reading its response right now).",
      howToFix: [
        "Confirm the application is listening on the expected host and port (HOSTNAME/PORT, or the container's published port).",
        "If a reverse proxy is in front, confirm it forwards Host and X-Forwarded-Proto correctly.",
        "Check /api/health directly in a browser — if it returns 200 there, only this self-request path is affected.",
      ],
    };
  }

  if (facts.httpStatus === 200 && facts.body?.status === "ok") {
    return {
      ...base,
      status: "pass",
      summary: "The health endpoint returned 200 and reports the database as reachable.",
      detail:
        "This is the endpoint to point a load balancer, uptime monitor or container orchestrator's readiness probe at. It never returns error detail or connection information by design.",
    };
  }

  if (facts.httpStatus === 503) {
    return {
      ...base,
      status: "fail",
      summary: "The health endpoint returned 503 — the application cannot reach its database.",
      detail:
        "The HTTP surface is serving correctly (it answered), but its `SELECT 1` failed. The database checks above carry the actual cause; the health endpoint itself deliberately withholds detail so it can be exposed publicly.",
      howToFix: [
        "Fix the database connection using the database check's guidance above.",
        "Re-run these checks — this endpoint turns green as soon as the database responds.",
      ],
    };
  }

  return {
    ...base,
    status: "warn",
    summary: `The health endpoint returned an unexpected HTTP ${facts.httpStatus}.`,
    detail:
      "Its contract is 200 or 503 and nothing else. Any other status means something in front of the application — a proxy, an auth gateway, a WAF — is intercepting the request before it reaches the app.",
    howToFix: [
      "Check whether a reverse proxy, WAF or authentication gateway is intercepting /api/health.",
      "Health probes must be allowed through unauthenticated, or every orchestrator probe will report the application as unhealthy while it is fine.",
    ],
  };
}

export async function checkHealthEndpoint(origin: string): Promise<CheckResult> {
  const url = `${origin.replace(/\/$/, "")}/api/health`;
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    let body: HealthProbeFacts["body"] = null;
    try {
      body = (await res.json()) as HealthProbeFacts["body"];
    } catch {
      body = null;
    }
    return evaluateHealth({ httpStatus: res.status, body, url });
  } catch (err) {
    return evaluateHealth({
      httpStatus: null,
      body: null,
      url,
      transportError: err instanceof Error ? err.message.slice(0, 120) : undefined,
    });
  }
}
