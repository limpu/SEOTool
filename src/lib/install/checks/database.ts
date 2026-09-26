import type { CheckResult } from "../types";
import { describeConnectionTarget, sanitizeError } from "../redact";

/**
 * Web Installer — database reachability and version.
 *
 * ─── THE ONE RULE ───────────────────────────────────────────────────────
 * A `DATABASE_URL` contains a password. Every failure path in this file
 * therefore routes through `sanitizeError()` / `describeConnectionTarget()`
 * before a single character reaches a `summary`, `detail`, or a log line.
 * `pg` errors regularly carry the host, and in some driver paths the whole
 * connection string, inside `.message` — so "the driver's message is
 * probably fine" is not an assumption this module is willing to make.
 *
 * The username, host, port and database name ARE shown, deliberately. They
 * are not credentials, and "password authentication failed for user
 * `seo_user`" is the entire diagnosis in one line. Redacting them too would
 * make this check useless and push the operator to read raw server logs,
 * which is worse for security, not better.
 */

/** PostgreSQL 18 is the baseline — the live database here is 18.6 and the
 * schema uses `gen_random_uuid()` (built-in since 13) plus modern index and
 * JSONB behaviour. 16 and 17 are very likely fine, so anything ≥ 16 is a
 * `warn` (untested) rather than a `fail` (broken); below 13 is a real
 * failure because `gen_random_uuid()` is not available without pgcrypto. */
export const POSTGRES_BASELINE_MAJOR = 18;
export const POSTGRES_HARD_MINIMUM_MAJOR = 13;

export function parsePostgresMajor(versionString: string): number | null {
  const m = /PostgreSQL\s+(\d+)/i.exec(versionString);
  if (m) return Number(m[1]);
  const bare = /^(\d+)[.\s]/.exec(versionString.trim());
  return bare ? Number(bare[1]) : null;
}

export interface DbFailureFacts {
  /** SQLSTATE or libpq errno, e.g. `28P01`, `ECONNREFUSED`. */
  code?: string;
  /** ALREADY-SANITIZED message. Never pass a raw driver message here. */
  sanitizedMessage: string;
  /** Password-free description of what was being connected to. */
  target: string;
}

/**
 * Turn a driver failure into a human-readable cause plus real remediation.
 * Pure — this is the function the tests hammer, including the "a driver
 * message containing the password must not leak it" case.
 */
export function explainDatabaseFailure(facts: DbFailureFacts): {
  summary: string;
  detail: string;
  howToFix: string[];
} {
  const { code, sanitizedMessage, target } = facts;
  const tail = `Target: ${target}.`;

  switch (code) {
    case "ECONNREFUSED":
      return {
        summary: "The database refused the connection — nothing is listening on that host and port.",
        detail: `${tail} The address resolved, but no PostgreSQL server accepted the connection.`,
        howToFix: [
          "Confirm PostgreSQL is running (`docker ps` if containerised, or `systemctl status postgresql`).",
          "Check the host and PORT in DATABASE_URL — a very common cause is the port the container publishes differing from Postgres's internal 5432.",
          "From inside a container, `localhost` means the container itself. Use the compose service name (e.g. `postgres`) or `host.docker.internal`, not `localhost`.",
          "Confirm no firewall is blocking the port between this application and the database.",
        ],
      };
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return {
        summary: "The database hostname could not be resolved by DNS.",
        detail: `${tail} The name in the connection string does not resolve from this host.`,
        howToFix: [
          "Check the hostname in DATABASE_URL for a typo.",
          "If the database is a container in the same compose project, use the SERVICE NAME as the hostname and make sure both services share a network.",
          "If the hostname is external, confirm DNS works from this host (`nslookup <host>`).",
        ],
      };
    case "ETIMEDOUT":
    case "ECONNRESET":
      return {
        summary: "The connection to the database timed out.",
        detail: `${tail} The address is reachable in principle but the server did not complete a handshake in time.`,
        howToFix: [
          "Check for a firewall or security group blocking the database port from this host.",
          "If the database is managed (RDS/Cloud SQL/etc.), add this server's IP to its allowed sources.",
          "Confirm the database is not overloaded or still starting up.",
        ],
      };
    case "28P01":
      return {
        summary: "The database rejected the password for that user.",
        detail: `${tail} The server was reached and the user exists, but authentication failed.`,
        howToFix: [
          "Re-check the password in DATABASE_URL. Password authentication failed — the host, port and database name are all fine.",
          "If the password contains `@`, `:`, `/`, `#` or `?`, it must be percent-encoded in the URL (for example `@` becomes `%40`).",
          "Confirm the password with `ALTER ROLE <user> WITH PASSWORD '<new>';` as a superuser if you are unsure of it.",
        ],
      };
    case "28000":
      return {
        summary: "The database rejected the connection for this user or client address.",
        detail: `${tail} Authentication was refused before a password was even considered — typically a pg_hba.conf rule.`,
        howToFix: [
          "Check the server's `pg_hba.conf` allows connections from this application's IP for this user and database.",
          "Confirm the username in DATABASE_URL exists (`\\du` in psql).",
          "Reload the server configuration after editing pg_hba.conf (`SELECT pg_reload_conf();`).",
        ],
      };
    case "3D000":
      return {
        summary: "That database does not exist on the server.",
        detail: `${tail} The server was reached and credentials were accepted, but the named database is not there.`,
        howToFix: [
          "Create it: `CREATE DATABASE <name>;` (or `docker exec -i <container> createdb -U <user> <name>`).",
          "Or correct the database name at the end of DATABASE_URL.",
        ],
      };
    case "42501":
      return {
        summary: "The database user does not have sufficient privileges.",
        detail: `${tail} Connection and authentication succeeded, but the user cannot perform the required operation.`,
        howToFix: [
          "Grant ownership or full rights on the database: `GRANT ALL PRIVILEGES ON DATABASE <name> TO <user>;`",
          "The application creates tables during migration, so the user needs CREATE on the `public` schema: `GRANT ALL ON SCHEMA public TO <user>;`",
        ],
      };
    case "53300":
      return {
        summary: "The database has too many clients already connected.",
        detail: `${tail} The server refused the connection because it is at its connection limit.`,
        howToFix: [
          "Raise `max_connections` on the PostgreSQL server, or reduce the pool size / number of application replicas.",
          "Check for another application or a leaked connection pool holding connections open.",
        ],
      };
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
      return {
        summary: "The database's TLS certificate could not be verified.",
        detail: `${tail} A TLS connection was attempted but the certificate chain was not trusted.`,
        howToFix: [
          "Supply the database's CA certificate to this host so the chain can be verified.",
          "For a managed database, append the provider's documented `?sslmode=require` (or stricter) to DATABASE_URL and install its CA bundle.",
          "Do not disable certificate verification in production — that turns TLS into decoration.",
        ],
      };
    default:
      return {
        summary: "The database could not be reached.",
        detail: `${tail} ${sanitizedMessage}`,
        howToFix: [
          "Verify DATABASE_URL: scheme, username, password, host, port and database name.",
          "Confirm the PostgreSQL server is running and reachable from this host.",
          "Check the application's server logs for the full driver error — it is deliberately not shown here, because driver errors can contain the database password.",
        ],
      };
  }
}

export interface DatabaseProbeResult {
  reachable: boolean;
  versionString?: string;
  /** Present only when `reachable` is false. */
  errorCode?: string;
  /** Already sanitized. */
  errorMessage?: string;
  target: string;
  /** Round-trip time of the probe, milliseconds. */
  elapsedMs?: number;
}

export function evaluateDatabaseReachable(probe: DatabaseProbeResult): CheckResult {
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "database.reachable",
    group: "database",
    label: "Database connection",
    blocking: true,
  };

  if (probe.reachable) {
    return {
      ...base,
      status: "pass",
      summary: `Connected successfully${probe.elapsedMs !== undefined ? ` in ${probe.elapsedMs} ms` : ""}.`,
      detail: `Authenticated and ran a query against ${probe.target}.`,
    };
  }

  const explained = explainDatabaseFailure({
    code: probe.errorCode,
    sanitizedMessage: probe.errorMessage ?? "No further detail is available.",
    target: probe.target,
  });

  return {
    ...base,
    status: "fail",
    summary: explained.summary,
    detail: explained.detail,
    howToFix: explained.howToFix,
  };
}

export function evaluateDatabaseVersion(probe: DatabaseProbeResult): CheckResult {
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "database.version",
    group: "database",
    label: "PostgreSQL version",
    blocking: true,
  };

  if (!probe.reachable || !probe.versionString) {
    return {
      ...base,
      status: "unknown",
      summary: "The PostgreSQL version could not be determined because the database was not reachable.",
      howToFix: [
        "Fix the database connection first — this check reports a real version as soon as a connection succeeds.",
      ],
    };
  }

  const major = parsePostgresMajor(probe.versionString);
  // Trim the full `version()` banner down to the product and version only:
  // the banner also names the exact OS build and compiler, which is host
  // fingerprinting an installer has no reason to publish.
  const short = /^(PostgreSQL\s+[\d.]+)/i.exec(probe.versionString)?.[1] ?? "PostgreSQL";

  if (major === null) {
    return {
      ...base,
      status: "unknown",
      summary: "Connected, but the server's version string could not be parsed.",
      howToFix: ["Run `SELECT version();` against the database and confirm it is PostgreSQL 18 or newer."],
    };
  }

  if (major < POSTGRES_HARD_MINIMUM_MAJOR) {
    return {
      ...base,
      status: "fail",
      summary: `${short} is too old — this platform requires PostgreSQL ${POSTGRES_HARD_MINIMUM_MAJOR} at an absolute minimum, and ${POSTGRES_BASELINE_MAJOR}+ is the tested baseline.`,
      detail:
        "The schema uses `gen_random_uuid()` as a column default on nearly every table, which is only built in from PostgreSQL 13. On older servers the migrations will not apply at all.",
      howToFix: [
        `Upgrade the server to PostgreSQL ${POSTGRES_BASELINE_MAJOR}.`,
        "Migrating data across a major upgrade: `pg_dump` the old server, create the new one, restore, then point DATABASE_URL at it.",
      ],
    };
  }

  if (major < POSTGRES_BASELINE_MAJOR) {
    return {
      ...base,
      status: "warn",
      summary: `${short} is below the tested baseline of PostgreSQL ${POSTGRES_BASELINE_MAJOR}.`,
      detail: `Nothing is known to be broken on ${major}.x — the schema's requirements are met from 13 onward — but this release is developed and verified against ${POSTGRES_BASELINE_MAJOR}. Recorded rather than blocked.`,
      howToFix: [
        `Upgrade to PostgreSQL ${POSTGRES_BASELINE_MAJOR} when convenient to match the tested configuration.`,
      ],
    };
  }

  return {
    ...base,
    status: "pass",
    summary: `${short} meets the PostgreSQL ${POSTGRES_BASELINE_MAJOR}+ baseline.`,
  };
}

/**
 * Run the real probe. Uses a short-lived `pg.Client` rather than the app's
 * shared pool so that (a) an operator-supplied candidate connection string
 * can be tested without disturbing the running app, and (b) a hanging
 * connection cannot exhaust the shared pool.
 */
export async function probeDatabase(connectionString: string | undefined): Promise<DatabaseProbeResult> {
  const target = describeConnectionTarget(connectionString ?? "");
  if (!connectionString || !connectionString.trim()) {
    return {
      reachable: false,
      target: "(not set)",
      errorCode: "NO_CONNECTION_STRING",
      errorMessage: "DATABASE_URL is not set.",
    };
  }

  const startedAt = Date.now();
  const { Client } = await import("pg");
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  try {
    await client.connect();
    const res = await client.query<{ version: string }>("SELECT version() AS version");
    return {
      reachable: true,
      versionString: res.rows[0]?.version ?? "",
      target,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    return {
      reachable: false,
      target,
      errorCode: code,
      // Sanitized at the boundary, before it can be stored, logged or returned.
      errorMessage: sanitizeError(err, { extraSecrets: [connectionString] }),
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    await client.end().catch(() => {});
  }
}
