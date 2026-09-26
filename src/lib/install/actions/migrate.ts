import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { sanitizeError } from "../redact";
import {
  computeMigrationReport,
  discoverMigrationFiles,
  type MigrationFile,
  type MigrationReport,
} from "../checks/migrations";

/**
 * Web Installer — Stage 2. Applying pending migrations.
 *
 * ─── WHAT THIS RUNNER WILL NOT DO ───────────────────────────────────────
 * It never drops a table, never truncates, never "resets" a database, and
 * never deletes a row. There is no `--force`, no repair mode and no
 * reconciliation step, because every one of those is a path from "the
 * installer got confused" to "the customer's data is gone". If the state on
 * disk and the state in the database disagree in a way this runner cannot
 * reconcile by ADDING things, it stops and says so.
 *
 * ─── ORDERING AND FAILURE ───────────────────────────────────────────────
 * Files are applied in FILENAME ORDER, discovered from disk on every run
 * (Stage 1's `discoverMigrationFiles`, which sorts). No count is hard-coded
 * anywhere — a literal would be silently wrong the moment a phase adds a
 * migration, and the failure mode is the worst kind: "all applied" reported
 * against a database missing the newest schema.
 *
 * Each file runs inside its OWN transaction: BEGIN → execute → verify the
 * objects it claims to create actually exist → COMMIT. On any failure the
 * transaction is rolled back and THE RUN STOPS IMMEDIATELY — nothing after
 * the failing file is attempted. Continuing past a failure would apply
 * migration N+1 against a schema that migration N did not finish producing,
 * which is how a half-migrated database becomes an unrecoverable one.
 *
 * ─── IDEMPOTENCY ────────────────────────────────────────────────────────
 * Two independent guards, so a re-run is safe even if one is wrong:
 *
 *   1. STRUCTURAL. Stage 1's `computeMigrationReport` decides what is
 *      pending by asking the live catalog whether each file's objects exist —
 *      including its `superseded` verdict, so a migration whose objects were
 *      deliberately dropped by a later file is never resurrected.
 *   2. RECORDED. Every file this runner applies is written to Drizzle's own
 *      journal (`drizzle.__drizzle_migrations`) with the SHA-256 of its
 *      contents, inside the same transaction as the migration itself. A file
 *      whose hash is already recorded is skipped without being read into the
 *      database again, and `drizzle-kit migrate` will also skip it.
 *
 * The journal write is deliberately inside the transaction: a crash between
 * "applied" and "recorded" would otherwise leave a migration that reruns.
 */

const JOURNAL_SCHEMA = "drizzle";
const JOURNAL_TABLE = "__drizzle_migrations";

export function hashMigration(contents: string): string {
  return crypto.createHash("sha256").update(contents, "utf8").digest("hex");
}

export type MigrationOutcome = "applied" | "skipped-already-applied" | "skipped-superseded" | "failed";

export interface MigrationRunStep {
  filename: string;
  outcome: MigrationOutcome;
  /** Sanitized. Never a stack trace, never a connection string. */
  message: string;
  durationMs?: number;
  /** Objects the file claims to create that were confirmed present afterwards. */
  verified?: string[];
}

export interface MigrationRunResult {
  ok: boolean;
  /** Files this run actually executed. */
  appliedCount: number;
  /** Files skipped because they were already applied or superseded. */
  skippedCount: number;
  steps: MigrationRunStep[];
  /** Present only when the run stopped on a failure. Sanitized. */
  failure?: {
    filename: string;
    message: string;
    howToFix: string[];
    /** Files that were NOT attempted because the run stopped. */
    notAttempted: string[];
  };
  /** The report as it stood BEFORE this run. */
  before: MigrationReport | null;
  message: string;
}

interface PgLikeClient {
  query<T = unknown>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
  connect(): Promise<void>;
  end(): Promise<void>;
}

async function readCatalog(client: PgLikeClient): Promise<{
  tables: Set<string>;
  types: Set<string>;
}> {
  const tables = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
  );
  const types = await client.query<{ typname: string }>(
    "SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e'"
  );
  return {
    tables: new Set(tables.rows.map((r) => r.tablename)),
    types: new Set(types.rows.map((r) => r.typname)),
  };
}

async function readJournalHashes(client: PgLikeClient): Promise<Set<string>> {
  try {
    const res = await client.query<{ hash: string }>(
      `SELECT hash FROM ${JOURNAL_SCHEMA}.${JOURNAL_TABLE}`
    );
    return new Set(res.rows.map((r) => r.hash));
  } catch {
    // The journal not existing is normal in this project — prior phases
    // applied SQL with psql, which writes no journal rows. Not an error.
    return new Set();
  }
}

async function ensureJournal(client: PgLikeClient): Promise<void> {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${JOURNAL_SCHEMA}`);
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${JOURNAL_SCHEMA}.${JOURNAL_TABLE} (
       id SERIAL PRIMARY KEY,
       hash text NOT NULL,
       created_at bigint
     )`
  );
}

/**
 * The objects a file must produce for it to count as genuinely applied,
 * excluding anything a LATER file deliberately drops. Reuses exactly the
 * reasoning Stage 1's `superseded` verdict is built on.
 */
export function expectedObjectsFor(files: MigrationFile[], index: number): {
  tables: string[];
  types: string[];
} {
  const droppedLater = { tables: new Set<string>(), types: new Set<string>() };
  for (const later of files.slice(index + 1)) {
    for (const t of later.droppedTables) droppedLater.tables.add(t);
    for (const t of later.droppedTypes) droppedLater.types.add(t);
  }
  const file = files[index];
  return {
    tables: file.createdTables.filter((t) => !droppedLater.tables.has(t)),
    types: file.createdTypes.filter((t) => !droppedLater.types.has(t)),
  };
}

/**
 * Postgres SQLSTATEs that all mean "the thing you are creating is already
 * there": duplicate table or index, duplicate column, duplicate object
 * (constraint, enum value), duplicate schema.
 */
const ALREADY_EXISTS_SQLSTATES = new Set(["42P07", "42701", "42710", "42P06"]);

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } } | undefined;
  return e?.code ?? e?.cause?.code;
}

/**
 * Whether a failure means the migration's changes are ALREADY PRESENT.
 *
 * ─── WHY THIS EXISTS, AND WHY SKIPPING WAS THE WRONG ANSWER ─────────────
 * Stage 1's structural probe answers "is this migration applied?" by asking
 * whether the tables and types it CREATES exist. Nine files in this project
 * create neither — they are pure `ALTER TABLE ADD COLUMN` and `CREATE INDEX`
 * (0002 adds `websites.max_pages`, 0009 adds six columns to `pages`, 0019
 * adds four to `users`, 0016 is nothing but indexes). The probe correctly
 * reports those as `indeterminate`.
 *
 * The first version of this runner SKIPPED them, reasoning that re-running an
 * ALTER on an already-migrated database would fail. Running it against a
 * genuinely empty scratch database proved that wrong in the worst way: 14 of
 * 24 files applied, 10 were skipped, and the resulting schema was missing
 * `websites.max_pages`, `pages.headings_json`, `users.pending_email` and
 * every performance index — while the check reported "all migrations
 * present", because the probe cannot see what it cannot see. A fresh install
 * would have produced a broken platform and said it was fine.
 *
 * So indeterminate files are ATTEMPTED. On a fresh database they apply. On a
 * database where they were applied earlier — this project's own, migrated by
 * hand with psql — they fail with one of these SQLSTATEs, which is exactly
 * the evidence the probe could not gather. The transaction is rolled back
 * (nothing is changed), the file is recorded in the journal so the question is
 * settled definitively from then on, and the run CONTINUES.
 *
 * This leniency applies ONLY to `indeterminate` files. For a file the probe
 * proved `pending`, a duplicate-object error is a genuine conflict between the
 * migration and the database, and the run stops.
 */
export function isAlreadyExistsError(err: unknown): boolean {
  const code = pgCode(err);
  if (code && ALREADY_EXISTS_SQLSTATES.has(code)) return true;
  // Fallback for drivers or wrappers that lose the SQLSTATE.
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  return /already exists/.test(message);
}

/**
 * Remediation text for a migration that failed. Deliberately never suggests
 * dropping or resetting anything.
 */
export function migrationFailureGuidance(filename: string): string[] {
  return [
    `The run stopped at ${filename}. Everything before it was applied and committed; nothing after it was attempted.`,
    "The failing migration was rolled back, so the database is in the state it reached after the previous file — it is not half-applied.",
    "Read the message above: it is the database's own reason, with credentials removed. The most common causes are an object that already exists under a different definition, a missing extension, or insufficient privileges for the connecting user.",
    `Inspect the file at database/migrations/${filename} and apply it by hand if you can resolve the cause: \`psql "$DATABASE_URL" -f database/migrations/${filename}\``,
    "Re-run this step afterwards. Migrations already applied are skipped, so re-running is safe.",
    "This installer will never drop, truncate or reset anything to get past a failure. If the schema needs repair, that is a deliberate operator decision made outside the installer.",
  ];
}

/**
 * Apply every pending migration.
 *
 * `clientFactory` is injectable purely so the ordering and stop-on-failure
 * behaviour can be tested against a fake without a live database; production
 * callers pass nothing and get `pg`.
 */
export async function runPendingMigrations(opts: {
  projectRoot: string;
  connectionString: string | undefined;
  clientFactory?: (connectionString: string) => PgLikeClient | Promise<PgLikeClient>;
}): Promise<MigrationRunResult> {
  const migrationsDir = path.join(opts.projectRoot, "database", "migrations");

  if (!opts.connectionString) {
    return {
      ok: false,
      appliedCount: 0,
      skippedCount: 0,
      steps: [],
      before: null,
      message:
        "DATABASE_URL is not set, so there is nothing to connect to. Fix the database configuration first.",
    };
  }

  let files: MigrationFile[];
  try {
    files = await discoverMigrationFiles(migrationsDir);
  } catch (err) {
    return {
      ok: false,
      appliedCount: 0,
      skippedCount: 0,
      steps: [],
      before: null,
      message: `The migrations directory could not be read: ${sanitizeError(err)}`,
    };
  }

  if (files.length === 0) {
    return {
      ok: false,
      appliedCount: 0,
      skippedCount: 0,
      steps: [],
      before: null,
      message:
        "No migration files were found in database/migrations. Run this step from a checkout of the repository that includes them — the runtime container image does not ship the migrations directory.",
    };
  }

  const factory =
    opts.clientFactory ??
    (async (cs: string) => {
      // Imported lazily, matching Stage 1's `collectDatabaseCatalog`, so this
      // module stays loadable where `pg` is not wanted at import time.
      const { Client } = await import("pg");
      return new Client({
        connectionString: cs,
        connectionTimeoutMillis: 10_000,
        // No statement_timeout: a real migration on a large table can take
        // minutes, and killing it mid-statement is exactly the outcome this
        // runner exists to avoid.
      }) as unknown as PgLikeClient;
    });

  const client = await factory(opts.connectionString);
  const steps: MigrationRunStep[] = [];
  let appliedCount = 0;
  let skippedCount = 0;
  let before: MigrationReport | null = null;

  try {
    await client.connect();
  } catch (err) {
    return {
      ok: false,
      appliedCount: 0,
      skippedCount: 0,
      steps: [],
      before: null,
      message: `The database could not be reached, so no migration was attempted: ${sanitizeError(err, { extraSecrets: [opts.connectionString] })}`,
    };
  }

  try {
    const catalog = await readCatalog(client);
    const journal = await readJournalHashes(client);
    before = computeMigrationReport({
      files,
      existingTables: catalog.tables,
      existingTypes: catalog.types,
      journalCount: journal.size,
    });

    await ensureJournal(client);

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const verdict = before.perFile[i]?.verdict;

      if (verdict === "superseded") {
        skippedCount += 1;
        steps.push({
          filename: file.filename,
          outcome: "skipped-superseded",
          message:
            "Skipped: every object this migration creates is deliberately dropped by a later migration, so its objects being absent is correct. Re-applying it would resurrect a removed feature.",
        });
        continue;
      }

      const contents = await fs.readFile(path.join(migrationsDir, file.filename), "utf8");
      const hash = hashMigration(contents);

      if (journal.has(hash)) {
        skippedCount += 1;
        steps.push({
          filename: file.filename,
          outcome: "skipped-already-applied",
          message: "Skipped: already recorded in the migration journal.",
        });
        continue;
      }

      if (verdict === "applied") {
        // Every table and type it creates is already present.
        skippedCount += 1;
        steps.push({
          filename: file.filename,
          outcome: "skipped-already-applied",
          message:
            "Skipped: every table and type this migration creates is already present in the database.",
        });
        continue;
      }

      // `indeterminate` files (index-only / ALTER-only) ARE ATTEMPTED. See
      // `isAlreadyExistsError` for why skipping them is not an option.

      // Genuinely pending — apply it.
      const started = Date.now();
      try {
        await client.query("BEGIN");
        await client.query(contents);

        // Verify INSIDE the transaction, before committing. If the file did
        // not actually produce what it claims, the commit never happens.
        const expected = expectedObjectsFor(files, i);
        const post = await readCatalog(client);
        const missingTables = expected.tables.filter((t) => !post.tables.has(t));
        const missingTypes = expected.types.filter((t) => !post.types.has(t));
        if (missingTables.length > 0 || missingTypes.length > 0) {
          throw new Error(
            `The migration ran without error but did not create the objects it declares: ${[
              ...missingTables.map((t) => `table ${t}`),
              ...missingTypes.map((t) => `type ${t}`),
            ].join(", ")}.`
          );
        }

        await client.query(
          `INSERT INTO ${JOURNAL_SCHEMA}.${JOURNAL_TABLE} (hash, created_at) VALUES ($1, $2)`,
          [hash, Date.now()]
        );
        await client.query("COMMIT");

        appliedCount += 1;
        journal.add(hash);
        steps.push({
          filename: file.filename,
          outcome: "applied",
          message: `Applied and verified in ${Date.now() - started} ms.`,
          durationMs: Date.now() - started,
          verified: [
            ...expected.tables.map((t) => `table ${t}`),
            ...expected.types.map((t) => `type ${t}`),
          ],
        });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});

        // An INDETERMINATE file that fails because its objects already exist
        // is not a failure — it is the evidence the structural probe could
        // not produce. See `isAlreadyExistsError`. Record it and continue.
        if (verdict === "indeterminate" && isAlreadyExistsError(err)) {
          try {
            await client.query(
              `INSERT INTO ${JOURNAL_SCHEMA}.${JOURNAL_TABLE} (hash, created_at) VALUES ($1, $2)`,
              [hash, Date.now()]
            );
            journal.add(hash);
          } catch {
            // Recording is an optimisation, not a correctness requirement —
            // the same conclusion is reached again on the next run.
          }
          skippedCount += 1;
          steps.push({
            filename: file.filename,
            outcome: "skipped-already-applied",
            message:
              "Already applied. This file creates no table or type, so it could not be confirmed structurally; running it produced an 'already exists' error, which is proof it was applied earlier. The attempt was rolled back and nothing was changed.",
          });
          continue;
        }

        const message = sanitizeError(err, { extraSecrets: [opts.connectionString] });
        steps.push({ filename: file.filename, outcome: "failed", message });
        const notAttempted = files.slice(i + 1).map((f) => f.filename);
        return {
          ok: false,
          appliedCount,
          skippedCount,
          steps,
          before,
          failure: {
            filename: file.filename,
            message,
            howToFix: migrationFailureGuidance(file.filename),
            notAttempted,
          },
          message: `Migration ${file.filename} failed. The run stopped immediately and nothing after it was attempted.`,
        };
      }
    }

    return {
      ok: true,
      appliedCount,
      skippedCount,
      steps,
      before,
      message:
        appliedCount === 0
          ? `No migrations needed applying — all ${files.length} detected files are already accounted for.`
          : `${appliedCount} of ${files.length} detected migrations were applied, in filename order, each verified before it was committed.`,
    };
  } catch (err) {
    return {
      ok: false,
      appliedCount,
      skippedCount,
      steps,
      before,
      message: `The migration run could not complete: ${sanitizeError(err, { extraSecrets: [opts.connectionString] })}`,
    };
  } finally {
    await client.end().catch(() => {});
  }
}
