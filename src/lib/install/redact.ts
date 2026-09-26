/**
 * Web Installer — secret redaction.
 *
 * The installer is the ONE surface in this product that deliberately handles
 * raw connection strings, SMTP passwords and OAuth client secrets, and is
 * also the one surface that must show real, human-readable failure causes
 * (a wizard that says "database error" and stops is useless). Those two
 * requirements pull in opposite directions, and the resolution is this
 * module: every string that leaves the installer — API response, `detail`
 * field, server log line — goes through `sanitizeForDisplay()` first.
 *
 * Section 79 #6: "Never expose secrets (password hashes, OTP hashes, reset
 * tokens, session secrets, environment variables) in any response, log, or
 * admin UI." This module is how that rule survives contact with an error
 * object thrown by `pg`, which routinely carries the connection host — and,
 * in some driver paths, the whole connection string — inside `.message`.
 *
 * Everything here is pure and synchronous so it is directly unit-testable
 * (see `tests/unit/install-redact.test.ts`).
 */

export const REDACTED = "***REDACTED***";

/**
 * Names of environment variables whose VALUES must never appear in any
 * installer output. Derived from actual usage in this codebase (see
 * `src/lib/gsc/crypto.ts`, `src/lib/ga4/crypto.ts`, `src/lib/email/index.ts`,
 * `src/lib/auth/session.ts`, `src/lib/db/index.ts`), not from documentation.
 */
export const SECRET_ENV_VARS = [
  "DATABASE_URL",
  "JWT_SECRET",
  "EMAIL_PASS",
  "GOOGLE_CLIENT_SECRET",
  "GSC_TOKEN_ENCRYPTION_KEY",
  "GA4_TOKEN_ENCRYPTION_KEY",
] as const;

/**
 * Replace the password component of any URI-style connection string that
 * appears anywhere inside `text`.
 *
 * Handles the real shapes seen from `pg`: a bare connection string, a
 * connection string embedded in a longer sentence, and multiple occurrences.
 * The username is deliberately KEPT — "password authentication failed for
 * user `seo_user`" is exactly the diagnostic an operator needs, and a
 * username is not a credential on its own.
 */
export function redactConnectionString(text: string): string {
  if (!text) return text;
  // scheme://user:password@host  ->  scheme://user:***REDACTED***@host
  let out = text.replace(
    /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^\s:/?#@]+)(:)([^\s@/]*)(@)/g,
    (_m, scheme, user, _colon, _pw, at) => `${scheme}${user}:${REDACTED}${at}`
  );
  // libpq keyword/value form: password=secret / password = 'secret'
  out = out.replace(
    /\b(password|pgpassword)(\s*=\s*)("[^"]*"|'[^']*'|[^\s;,)]+)/gi,
    (_m, key, eq) => `${key}${eq}${REDACTED}`
  );
  return out;
}

/**
 * Strip absolute filesystem paths down to their final segment.
 *
 * Rationale: an absolute path leaks the deployment layout (usernames in
 * `C:\Users\<name>\…`, the container's internal root, whether the app runs
 * as root) to whoever can see the installer response. The basename is
 * almost always the useful part of the message ("could not read
 * `.install-token`"), so it is kept.
 */
export function stripAbsolutePaths(text: string): string {
  if (!text) return text;
  let out = text.replace(/[A-Za-z]:\\[^\s"'`,;)]+/g, (m) => {
    const seg = m.split(/[\\/]/).filter(Boolean).pop();
    return seg ? `…/${seg}` : "…";
  });
  // POSIX absolute paths, but only rooted at real system directories so we
  // never mangle a URL path or a bare "/" in prose.
  out = out.replace(
    /(?<![\w:/])\/(?:home|Users|users|app|usr|var|opt|etc|root|tmp|srv|mnt)(?:\/[^\s"'`,;:)]+)+/g,
    (m) => {
      const seg = m.split("/").filter(Boolean).pop();
      return seg ? `…/${seg}` : "…";
    }
  );
  return out;
}

/**
 * Remove verbatim occurrences of the process's real secret values.
 *
 * This is the backstop for anything the structural regexes above cannot
 * anticipate — e.g. a driver that prints the password on its own, or an
 * operator pasting `JWT_SECRET` into a field and it coming back in a
 * validation message. Values shorter than 8 characters are skipped: a very
 * short secret is already broken, and blanket-replacing a 3-character string
 * would corrupt unrelated text (and could itself hint at the secret's
 * content by which words got mangled).
 */
export function redactKnownSecretValues(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
  extraValues: string[] = []
): string {
  if (!text) return text;
  let out = text;
  const values: string[] = [];

  for (const name of SECRET_ENV_VARS) {
    const raw = env[name];
    if (!raw) continue;
    values.push(raw);
    // For DATABASE_URL also scrub the password component on its own, since
    // `pg` errors sometimes carry only that part.
    const pw = extractPasswordFromUri(raw);
    if (pw) values.push(pw);
  }
  for (const v of extraValues) if (v) values.push(v);

  for (const v of values) {
    if (v.length < 8) continue;
    out = out.split(v).join(REDACTED);
  }
  return out;
}

/** Pull the password out of a URI-style connection string, if present. */
export function extractPasswordFromUri(uri: string): string | null {
  const m = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s:/?#@]+:([^\s@/]*)@/.exec(uri.trim());
  return m && m[1] ? m[1] : null;
}

/**
 * A connection string safe to show an operator: password removed, everything
 * else (scheme, user, host, port, database) kept, because those five facts
 * are precisely what a "cannot connect" diagnosis is made of.
 */
export function describeConnectionTarget(uri: string): string {
  const trimmed = (uri ?? "").trim();
  if (!trimmed) return "(not set)";
  try {
    const u = new URL(trimmed);
    const user = u.username ? `${u.username}@` : "";
    const port = u.port ? `:${u.port}` : "";
    const dbName = u.pathname.replace(/^\//, "");
    return `${u.protocol}//${user}${u.hostname}${port}/${dbName || "(no database name)"}`;
  } catch {
    // Unparseable — do not echo it back raw; it may be a pasted secret.
    return "(unparseable connection string)";
  }
}

/**
 * The single exit point. Every string the installer returns or logs passes
 * through here. Order matters: verbatim secret values first (they may
 * contain characters the structural regexes would otherwise split on), then
 * connection-string structure, then filesystem paths, then a length cap so a
 * pathological driver message cannot become a response-size problem.
 */
export function sanitizeForDisplay(
  text: string,
  opts: { env?: NodeJS.ProcessEnv; extraSecrets?: string[]; maxLength?: number } = {}
): string {
  if (!text) return "";
  let out = String(text);
  out = redactKnownSecretValues(out, opts.env ?? process.env, opts.extraSecrets ?? []);
  out = redactConnectionString(out);
  out = stripAbsolutePaths(out);
  out = out.replace(/\s+/g, " ").trim();
  const max = opts.maxLength ?? 400;
  if (out.length > max) out = `${out.slice(0, max - 1)}…`;
  return out;
}

/**
 * Extract a displayable message from an unknown thrown value.
 *
 * Deliberately uses ONLY `error.message` — never `error.stack` (Section 79
 * #6: stack traces expose internal module paths and code structure) and
 * never the whole serialised error object (`pg` attaches driver internals
 * that have included the connection config in some versions).
 */
export function sanitizeError(
  err: unknown,
  opts: { env?: NodeJS.ProcessEnv; extraSecrets?: string[]; maxLength?: number } = {}
): string {
  let raw: string;
  if (err instanceof Error) raw = err.message;
  else if (typeof err === "string") raw = err;
  else raw = "An unexpected error occurred.";
  return sanitizeForDisplay(raw, opts);
}
