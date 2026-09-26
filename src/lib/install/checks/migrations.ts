import fs from "fs/promises";
import path from "path";
import type { CheckResult } from "../types";
import { sanitizeError } from "../redact";

/**
 * Web Installer — migration discovery and applied/pending reporting.
 *
 * ─── DISCOVERY IS DYNAMIC, ALWAYS ───────────────────────────────────────
 * The file count is READ FROM DISK on every run and never hard-coded. A
 * literal ("23 migrations") is wrong the moment the next phase adds one, and
 * the failure is silent: the installer would report "all applied" while a
 * new migration sits unapplied and the app breaks at runtime. read.md
 * already records the documentation drifting this way once.
 *
 * ─── WHY "APPLIED" NEEDS TWO METHODS, NOT ONE ───────────────────────────
 * The obvious source of truth is Drizzle's own `drizzle.__drizzle_migrations`
 * journal table. In THIS project that table exists and is EMPTY, while the
 * database has 37 tables — because `drizzle-kit migrate` has been unreliable
 * here and prior phases applied migrations directly via
 * `docker exec -i seo-postgres psql`. Reporting "0 of 23 applied" against a
 * fully-migrated production database would be a confidently wrong answer,
 * and would push an operator into re-running migrations that are already in
 * place.
 *
 * So two independent methods are used and BOTH are reported:
 *
 *   journal  — how many rows `drizzle.__drizzle_migrations` holds. Precise
 *              when drizzle-kit did the work; meaningless when psql did.
 *   probe    — a structural check: parse each migration file for the
 *              database objects it CREATEs (tables and enum types) and ask
 *              the live catalog whether they exist. This is method-agnostic
 *              — it measures the database's actual shape, not who changed
 *              it — and is what the pass/fail verdict is based on.
 *
 * Migration files that create no new object (index-only, ALTER-only, DROP-
 * only) are reported as `indeterminate` rather than guessed at. Saying "we
 * cannot tell for these 4 files" is a true statement; inferring them from
 * their neighbours is not (Section 77).
 *
 * ─── SUPERSEDED MIGRATIONS ──────────────────────────────────────────────
 * A structural probe alone gets one case confidently wrong, and this project
 * contains a live example of it: `0020_wealthy_robin_chapel.sql` creates the
 * Backlink Audit table and enum, and `0021_remove_backlink_audit.sql` drops
 * both, because the module was deliberately removed (GSC's API has no
 * backlink resource). Its objects are legitimately absent from a
 * fully-migrated database. Reporting 0020 as "pending" would tell the
 * operator to re-apply it and resurrect a feature that was intentionally
 * deleted — a wrong instruction produced with total confidence.
 *
 * So DROP statements are parsed too, and any object dropped by a LATER
 * migration is removed from the set a file's objects are checked against. A
 * file whose every created object is later dropped is `superseded`, which is
 * a correct outcome, not a problem.
 */

export interface MigrationFile {
  filename: string;
  /** Numeric prefix, e.g. 22 for `0022_phase37_site_file_content.sql`. */
  index: number;
  /** Table names this migration creates. */
  createdTables: string[];
  /** Enum type names this migration creates. */
  createdTypes: string[];
  /** Table names this migration drops. */
  droppedTables: string[];
  /** Enum type names this migration drops. */
  droppedTypes: string[];
}

/**
 * Parse the objects a migration file creates. Handles the two shapes
 * drizzle-kit actually emits in this repo — `CREATE TABLE "x"` and
 * `CREATE TYPE "public"."y"` — plus the `IF NOT EXISTS` variants that
 * hand-written migrations here use.
 */
export function parseMigrationObjects(sql: string): { tables: string[]; types: string[] } {
  const tables: string[] = [];
  const types: string[] = [];

  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"public"\.)?"?([A-Za-z0-9_]+)"?/gi;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(sql)) !== null) tables.push(m[1]);

  const typeRe = /CREATE\s+TYPE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"public"\.)?"?([A-Za-z0-9_]+)"?/gi;
  while ((m = typeRe.exec(sql)) !== null) types.push(m[1]);

  return { tables: [...new Set(tables)], types: [...new Set(types)] };
}

/** Parse the objects a migration file DROPS — see "superseded migrations". */
export function parseMigrationDrops(sql: string): { tables: string[]; types: string[] } {
  const tables: string[] = [];
  const types: string[] = [];

  const tableRe = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"public"\.)?"?([A-Za-z0-9_]+)"?/gi;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(sql)) !== null) tables.push(m[1]);

  const typeRe = /DROP\s+TYPE\s+(?:IF\s+EXISTS\s+)?(?:"public"\.)?"?([A-Za-z0-9_]+)"?/gi;
  while ((m = typeRe.exec(sql)) !== null) types.push(m[1]);

  return { tables: [...new Set(tables)], types: [...new Set(types)] };
}

/** Read and parse every `.sql` file in the migrations directory, in order. */
export async function discoverMigrationFiles(migrationsDir: string): Promise<MigrationFile[]> {
  const entries = await fs.readdir(migrationsDir);
  const sqlFiles = entries.filter((f) => f.toLowerCase().endsWith(".sql")).sort();

  const files: MigrationFile[] = [];
  for (const filename of sqlFiles) {
    const contents = await fs.readFile(path.join(migrationsDir, filename), "utf8");
    const { tables, types } = parseMigrationObjects(contents);
    const drops = parseMigrationDrops(contents);
    const idxMatch = /^(\d+)/.exec(filename);
    files.push({
      filename,
      index: idxMatch ? Number(idxMatch[1]) : Number.NaN,
      createdTables: tables,
      createdTypes: types,
      droppedTables: drops.tables,
      droppedTypes: drops.types,
    });
  }
  return files;
}

export type MigrationVerdict = "applied" | "pending" | "indeterminate" | "superseded";

export interface MigrationStatusFacts {
  files: MigrationFile[];
  /** Table names that exist in the live database's `public` schema. */
  existingTables: Set<string>;
  /** Enum type names that exist in the live database. */
  existingTypes: Set<string>;
  /** Row count of `drizzle.__drizzle_migrations`, or null if unreadable. */
  journalCount: number | null;
  /** True when the database could not be inspected at all. */
  databaseUnavailable?: boolean;
}

export interface MigrationReport {
  detected: number;
  applied: number;
  pending: number;
  indeterminate: number;
  /** Files whose created objects were deliberately dropped by a later file. */
  superseded: number;
  journalCount: number | null;
  perFile: { filename: string; verdict: MigrationVerdict }[];
}

/**
 * Pure. Given the discovered files and the live catalog contents, decide
 * per-file whether each migration's objects are present — accounting for
 * objects a LATER migration deliberately dropped.
 */
export function computeMigrationReport(facts: MigrationStatusFacts): MigrationReport {
  const perFile = facts.files.map((f, i) => {
    // Everything dropped by a later migration. An object in this set is
    // SUPPOSED to be absent, so its absence is not evidence of a missing
    // migration.
    const laterDroppedTables = new Set<string>();
    const laterDroppedTypes = new Set<string>();
    for (const later of facts.files.slice(i + 1)) {
      for (const t of later.droppedTables) laterDroppedTables.add(t);
      for (const t of later.droppedTypes) laterDroppedTypes.add(t);
    }

    const tables = f.createdTables.filter((t) => !laterDroppedTables.has(t));
    const types = f.createdTypes.filter((t) => !laterDroppedTypes.has(t));
    const createdAnything = f.createdTables.length + f.createdTypes.length > 0;

    if (!createdAnything) return { filename: f.filename, verdict: "indeterminate" as const };
    if (tables.length + types.length === 0) {
      // Everything it created was later dropped on purpose.
      return { filename: f.filename, verdict: "superseded" as const };
    }

    const allPresent =
      tables.every((t) => facts.existingTables.has(t)) &&
      types.every((t) => facts.existingTypes.has(t));
    return { filename: f.filename, verdict: allPresent ? ("applied" as const) : ("pending" as const) };
  });

  return {
    detected: facts.files.length,
    applied: perFile.filter((p) => p.verdict === "applied").length,
    pending: perFile.filter((p) => p.verdict === "pending").length,
    indeterminate: perFile.filter((p) => p.verdict === "indeterminate").length,
    superseded: perFile.filter((p) => p.verdict === "superseded").length,
    journalCount: facts.journalCount,
    perFile,
  };
}

export function evaluateMigrations(
  report: MigrationReport,
  databaseUnavailable: boolean
): CheckResult {
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "database.migrations",
    group: "database",
    label: "Database migrations",
    blocking: true,
  };

  if (report.detected === 0) {
    return {
      ...base,
      status: "unknown",
      summary: "No migration files were found in database/migrations.",
      detail:
        "Either the directory is missing from this deployment or it is empty. A container built from the provided Dockerfile does not include the migrations directory in the runtime image — migrations are applied from the source checkout, not from inside the running container.",
      howToFix: [
        "Run migrations from a checkout of the repository that has database/migrations present.",
        "Apply them with: `docker exec -i <postgres-container> psql -U <user> -d <database> < database/migrations/<file>.sql` for each file in order.",
      ],
    };
  }

  if (databaseUnavailable) {
    return {
      ...base,
      status: "unknown",
      summary: `${report.detected} migration files detected, but the database could not be inspected, so none can be confirmed as applied.`,
      howToFix: [
        "Fix the database connection first — this check reports real applied/pending counts as soon as the database responds.",
      ],
    };
  }

  const journalNote =
    report.journalCount === null
      ? "Drizzle's own migration journal (drizzle.__drizzle_migrations) could not be read, so the counts above come from a structural probe of the live database."
      : report.journalCount === 0 && report.applied > 0
        ? `Drizzle's migration journal is EMPTY while ${report.applied} migrations are structurally present. That is expected in this project: migrations here are applied directly with psql (drizzle-kit migrate has been unreliable), which does not write journal rows. The verdict above comes from inspecting the database's actual tables and types, not from the journal.`
        : `Drizzle's migration journal holds ${report.journalCount} row(s).`;

  const indeterminateNote =
    (report.indeterminate > 0
      ? ` ${report.indeterminate} file(s) create no new table or type (index-only, ALTER-only or DROP-only migrations), so their state cannot be determined structurally and is reported as indeterminate rather than assumed.`
      : "") +
    (report.superseded > 0
      ? ` ${report.superseded} file(s) are superseded — every object they created was deliberately dropped by a later migration, so those objects being absent is correct and does NOT mean the migration needs re-applying.`
      : "");

  if (report.pending > 0) {
    const pendingFiles = report.perFile
      .filter((p) => p.verdict === "pending")
      .map((p) => p.filename);
    return {
      ...base,
      status: "fail",
      summary: `${report.pending} of ${report.detected} migrations have not been applied.`,
      detail: `Detected ${report.detected}, applied ${report.applied}, pending ${report.pending}. Pending: ${pendingFiles.join(", ")}.${indeterminateNote} ${journalNote}`,
      howToFix: [
        "Apply each pending migration in filename order:",
        "`docker exec -i <postgres-container> psql -U <db-user> -d <db-name> < database/migrations/<file>.sql`",
        "On a non-containerised database: `psql \"$DATABASE_URL\" -f database/migrations/<file>.sql`",
        "Re-run these checks afterwards to confirm every migration is present.",
      ],
    };
  }

  return {
    ...base,
    status: "pass",
    summary: `All ${report.detected} detected migrations are present in the database.`,
    detail: `Detected ${report.detected}, applied ${report.applied}, pending 0.${indeterminateNote} ${journalNote}`,
  };
}

/** Inspect the live catalog. Returns nulls (never throws) when unavailable. */
export async function collectDatabaseCatalog(connectionString: string | undefined): Promise<{
  existingTables: Set<string>;
  existingTypes: Set<string>;
  journalCount: number | null;
  available: boolean;
  error?: string;
}> {
  const empty = {
    existingTables: new Set<string>(),
    existingTypes: new Set<string>(),
    journalCount: null,
    available: false,
  };
  if (!connectionString) return empty;

  const { Client } = await import("pg");
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  try {
    await client.connect();
    const tables = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    );
    const types = await client.query<{ typname: string }>(
      "SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e'"
    );
    let journalCount: number | null = null;
    try {
      const j = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations"
      );
      journalCount = Number(j.rows[0]?.count ?? 0);
    } catch {
      // The journal table not existing is a normal state for a database that
      // was migrated with psql. Not an error worth surfacing on its own.
      journalCount = null;
    }
    return {
      existingTables: new Set(tables.rows.map((r) => r.tablename)),
      existingTypes: new Set(types.rows.map((r) => r.typname)),
      journalCount,
      available: true,
    };
  } catch (err) {
    return { ...empty, error: sanitizeError(err, { extraSecrets: [connectionString] }) };
  } finally {
    await client.end().catch(() => {});
  }
}

/** Full check: discover files on disk, inspect the database, report. */
export async function checkMigrations(
  projectRoot: string,
  connectionString: string | undefined
): Promise<{ result: CheckResult; report: MigrationReport }> {
  const migrationsDir = path.join(projectRoot, "database", "migrations");

  let files: MigrationFile[] = [];
  try {
    files = await discoverMigrationFiles(migrationsDir);
  } catch {
    files = [];
  }

  const catalog = await collectDatabaseCatalog(connectionString);
  const report = computeMigrationReport({
    files,
    existingTables: catalog.existingTables,
    existingTypes: catalog.existingTypes,
    journalCount: catalog.journalCount,
  });

  return { result: evaluateMigrations(report, !catalog.available), report };
}
