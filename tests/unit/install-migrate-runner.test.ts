import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  expectedObjectsFor,
  hashMigration,
  isAlreadyExistsError,
  migrationFailureGuidance,
  runPendingMigrations,
} from "@/lib/install/actions/migrate";
import { discoverMigrationFiles } from "@/lib/install/checks/migrations";

/**
 * Web Installer — Stage 2. The migration runner.
 *
 * The two behaviours these tests exist for:
 *
 *   ORDER — files are applied in filename order, discovered from disk. A
 *   hard-coded count or an out-of-order run produces a schema the application
 *   cannot use, and the failure is silent until runtime.
 *
 *   STOP ON FAILURE — the run halts at the first failure and attempts nothing
 *   after it. Continuing would apply migration N+1 against a schema that N did
 *   not finish producing, which is how a half-migrated database becomes an
 *   unrecoverable one.
 *
 * A fake client stands in for `pg` so both can be asserted precisely,
 * including the transaction boundaries around each file.
 */

interface FakeOpts {
  failOn?: string;
  /** Tables that already exist before the run. */
  existingTables?: string[];
  /** Hashes already present in the journal. */
  journalHashes?: string[];
  /**
   * Column names that already exist, so `ADD COLUMN` on them throws SQLSTATE
   * 42701 the way Postgres really does. This is how an ALTER-only migration
   * that was applied earlier announces itself.
   */
  existingColumns?: string[];
}

function makeFakeClient(opts: FakeOpts = {}) {
  const log: string[] = [];
  const tables = new Set<string>(opts.existingTables ?? []);
  const types = new Set<string>();
  const journal = new Set<string>(opts.journalHashes ?? []);
  // Objects created inside the current, not-yet-committed transaction.
  let pending: string[] = [];

  const client = {
    connect: async () => {},
    end: async () => {},
    async query(text: string, values?: unknown[]) {
      const t = text.trim();

      if (t === "BEGIN") {
        log.push("BEGIN");
        pending = [];
        return { rows: [] };
      }
      if (t === "COMMIT") {
        log.push("COMMIT");
        for (const name of pending) tables.add(name);
        pending = [];
        return { rows: [] };
      }
      if (t === "ROLLBACK") {
        log.push("ROLLBACK");
        // The whole point: nothing the failing file did survives.
        pending = [];
        return { rows: [] };
      }
      if (t.startsWith("SELECT tablename")) {
        return { rows: [...tables, ...pending].map((tablename) => ({ tablename })) };
      }
      if (t.startsWith("SELECT t.typname")) {
        return { rows: [...types].map((typname) => ({ typname })) };
      }
      if (t.startsWith("SELECT hash")) {
        return { rows: [...journal].map((hash) => ({ hash })) };
      }
      if (t.startsWith("CREATE SCHEMA") || t.startsWith("CREATE TABLE IF NOT EXISTS drizzle")) {
        return { rows: [] };
      }
      if (t.startsWith("INSERT INTO drizzle")) {
        journal.add(String(values?.[0]));
        log.push("JOURNAL");
        return { rows: [] };
      }

      // A migration body.
      const addedColumn = /ADD COLUMN "?([a-z_]+)"?/i.exec(t)?.[1];
      const name = /CREATE TABLE "?([a-z_]+)"?/i.exec(t)?.[1];
      log.push(`APPLY:${name ?? addedColumn ?? "?"}`);
      if (addedColumn && (opts.existingColumns ?? []).includes(addedColumn)) {
        const err = new Error(`column "${addedColumn}" of relation "x" already exists`) as Error & {
          code?: string;
        };
        err.code = "42701"; // duplicate_column
        throw err;
      }
      if (opts.failOn && name === opts.failOn) {
        throw new Error(`relation "${name}" already exists`);
      }
      if (name) pending.push(name);
      return { rows: [] };
    },
  };

  // The runner's client contract is generic in the row type; the fake answers
  // a fixed set of queries, so the cast is at this seam rather than at every
  // call site.
  return {
    client: client as unknown as {
      connect(): Promise<void>;
      end(): Promise<void>;
      query<T = unknown>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
    },
    log,
    tables,
    journal,
  };
}

let root: string;
let migrationsDir: string;

async function writeMigrations(files: Record<string, string>) {
  for (const [name, body] of Object.entries(files)) {
    await fs.writeFile(path.join(migrationsDir, name), body, "utf8");
  }
}

describe("install/migrate — the runner", () => {
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "install-migrate-"));
    migrationsDir = path.join(root, "database", "migrations");
    await fs.mkdir(migrationsDir, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("APPLIES IN FILENAME ORDER, and discovers the file list from disk rather than any literal", async () => {
    await writeMigrations({
      "0003_third.sql": 'CREATE TABLE "gamma" (id int);',
      "0001_first.sql": 'CREATE TABLE "alpha" (id int);',
      "0002_second.sql": 'CREATE TABLE "beta" (id int);',
    });
    const fake = makeFakeClient();
    const res = await runPendingMigrations({
      projectRoot: root,
      connectionString: "postgresql://u:p@h/db",
      clientFactory: () => fake.client,
    });

    expect(res.ok).toBe(true);
    expect(res.appliedCount).toBe(3);
    expect(res.steps.map((s) => s.filename)).toEqual([
      "0001_first.sql",
      "0002_second.sql",
      "0003_third.sql",
    ]);
    expect(fake.log.filter((l) => l.startsWith("APPLY:"))).toEqual([
      "APPLY:alpha",
      "APPLY:beta",
      "APPLY:gamma",
    ]);
    // The count came from the directory, not from the runner.
    const discovered = await discoverMigrationFiles(migrationsDir);
    expect(res.steps.length).toBe(discovered.length);
  });

  it("wraps each file in its OWN transaction and journals it inside that transaction", async () => {
    await writeMigrations({
      "0001_a.sql": 'CREATE TABLE "alpha" (id int);',
      "0002_b.sql": 'CREATE TABLE "beta" (id int);',
    });
    const fake = makeFakeClient();
    await runPendingMigrations({
      projectRoot: root,
      connectionString: "postgresql://u:p@h/db",
      clientFactory: () => fake.client,
    });
    expect(fake.log).toEqual([
      "BEGIN",
      "APPLY:alpha",
      "JOURNAL",
      "COMMIT",
      "BEGIN",
      "APPLY:beta",
      "JOURNAL",
      "COMMIT",
    ]);
  });

  it("A FAILURE STOPS THE RUN IMMEDIATELY — nothing after it is attempted", async () => {
    await writeMigrations({
      "0001_a.sql": 'CREATE TABLE "alpha" (id int);',
      "0002_b.sql": 'CREATE TABLE "beta" (id int);',
      "0003_c.sql": 'CREATE TABLE "gamma" (id int);',
      "0004_d.sql": 'CREATE TABLE "delta" (id int);',
    });
    const fake = makeFakeClient({ failOn: "beta" });
    const res = await runPendingMigrations({
      projectRoot: root,
      connectionString: "postgresql://u:p@h/db",
      clientFactory: () => fake.client,
    });

    expect(res.ok).toBe(false);
    expect(res.appliedCount).toBe(1);
    expect(res.failure?.filename).toBe("0002_b.sql");
    // The two files after the failure were never touched.
    expect(res.failure?.notAttempted).toEqual(["0003_c.sql", "0004_d.sql"]);
    expect(fake.log).not.toContain("APPLY:gamma");
    expect(fake.log).not.toContain("APPLY:delta");
    // The failing file was rolled back, so the database sits at the state the
    // previous file left — not half-applied.
    expect(fake.log).toContain("ROLLBACK");
    expect(fake.tables.has("alpha")).toBe(true);
    expect(fake.tables.has("beta")).toBe(false);
  });

  it("reports the failure in human-readable, sanitized form with remediation that never suggests dropping anything", async () => {
    await writeMigrations({ "0001_a.sql": 'CREATE TABLE "alpha" (id int);' });
    const fake = makeFakeClient({ failOn: "alpha" });
    const res = await runPendingMigrations({
      projectRoot: root,
      connectionString: "postgresql://seo_user:hunter2@localhost:5432/db",
      clientFactory: () => fake.client,
    });

    expect(res.ok).toBe(false);
    const payload = JSON.stringify(res);
    expect(payload).not.toContain("hunter2");
    expect(payload).not.toMatch(/\bat .*\.ts:\d+/); // no stack frames
    expect(res.failure?.message).toContain("already exists");

    const fix = migrationFailureGuidance("0001_a.sql").join(" ").toLowerCase();
    // No destructive INSTRUCTION anywhere — the only mention of dropping is
    // the promise that the installer will not do it.
    expect(fix).not.toMatch(/drop table|drop database|drop schema|truncate table|--force|db:reset/);
    expect(fix).toContain("never drop, truncate or reset anything");
    // And it does tell the operator what actually happened to their data.
    expect(fix).toContain("it is not half-applied");
  });

  it("is IDEMPOTENT — a second run applies nothing", async () => {
    await writeMigrations({
      "0001_a.sql": 'CREATE TABLE "alpha" (id int);',
      "0002_b.sql": 'CREATE TABLE "beta" (id int);',
    });
    const fake = makeFakeClient();
    const first = await runPendingMigrations({
      projectRoot: root,
      connectionString: "postgresql://u:p@h/db",
      clientFactory: () => fake.client,
    });
    expect(first.appliedCount).toBe(2);

    const second = await runPendingMigrations({
      projectRoot: root,
      connectionString: "postgresql://u:p@h/db",
      clientFactory: () => fake.client,
    });
    expect(second.ok).toBe(true);
    expect(second.appliedCount).toBe(0);
    expect(second.skippedCount).toBe(2);
  });

  it("skips a SUPERSEDED migration instead of resurrecting a deliberately removed feature", async () => {
    await writeMigrations({
      "0001_a.sql": 'CREATE TABLE "alpha" (id int);',
      "0002_add_backlinks.sql": 'CREATE TABLE "backlink_audits" (id int);',
      "0003_remove_backlinks.sql": 'DROP TABLE "backlink_audits";',
    });
    const fake = makeFakeClient();
    const res = await runPendingMigrations({
      projectRoot: root,
      connectionString: "postgresql://u:p@h/db",
      clientFactory: () => fake.client,
    });

    const superseded = res.steps.find((s) => s.filename === "0002_add_backlinks.sql");
    expect(superseded?.outcome).toBe("skipped-superseded");
    expect(fake.log).not.toContain("APPLY:backlink_audits");
  });

  it("does not re-execute a migration whose objects are already present", async () => {
    await writeMigrations({ "0001_a.sql": 'CREATE TABLE "alpha" (id int);' });
    const fake = makeFakeClient({ existingTables: ["alpha"] });
    const res = await runPendingMigrations({
      projectRoot: root,
      connectionString: "postgresql://u:p@h/db",
      clientFactory: () => fake.client,
    });
    expect(res.appliedCount).toBe(0);
    expect(res.steps[0].outcome).toBe("skipped-already-applied");
    expect(fake.log.filter((l) => l.startsWith("APPLY:"))).toEqual([]);
  });

  /**
   * The regression these three cover was found by running the installer
   * against a genuinely empty scratch database. The first version SKIPPED
   * every `indeterminate` file — those creating no table or type — and so
   * applied 14 of 24 migrations, leaving the schema without
   * `websites.max_pages`, `pages.headings_json`, `users.pending_email` and
   * every performance index, while reporting "all migrations present"
   * because the structural probe cannot see what it cannot see. A fresh
   * install would have produced a broken platform and called it fine.
   */
  it("APPLIES ALTER-ONLY MIGRATIONS ON A FRESH DATABASE — skipping them silently breaks the schema", async () => {
    await writeMigrations({
      "0001_create.sql": 'CREATE TABLE "websites" (id int);',
      "0002_alter.sql": 'ALTER TABLE "websites" ADD COLUMN "max_pages" integer;',
      "0003_index.sql": 'CREATE INDEX "websites_user_id_idx" ON "websites" ("id");',
    });
    const fake = makeFakeClient();
    const res = await runPendingMigrations({
      projectRoot: root,
      connectionString: "postgresql://u:p@h/db",
      clientFactory: () => fake.client,
    });

    expect(res.ok).toBe(true);
    expect(res.appliedCount).toBe(3);
    expect(res.steps.every((s) => s.outcome === "applied")).toBe(true);
    expect(fake.log).toContain("APPLY:max_pages");
  });

  it("treats an 'already exists' failure on an ALTER-only file as PROOF it was applied, and continues", async () => {
    await writeMigrations({
      "0001_create.sql": 'CREATE TABLE "websites" (id int);',
      "0002_alter.sql": 'ALTER TABLE "websites" ADD COLUMN "max_pages" integer;',
      "0003_later.sql": 'CREATE TABLE "pages" (id int);',
    });
    // The database already has the column — the state this project's own dev
    // database is in, because prior phases applied migrations with psql.
    const fake = makeFakeClient({ existingColumns: ["max_pages"] });
    const res = await runPendingMigrations({
      projectRoot: root,
      connectionString: "postgresql://u:p@h/db",
      clientFactory: () => fake.client,
    });

    expect(res.ok).toBe(true);
    const alter = res.steps.find((s) => s.filename === "0002_alter.sql")!;
    expect(alter.outcome).toBe("skipped-already-applied");
    expect(alter.message).toMatch(/rolled back and nothing was changed/i);
    // Crucially, the run did NOT stop — the later migration still applied.
    expect(res.steps.find((s) => s.filename === "0003_later.sql")!.outcome).toBe("applied");
    expect(fake.log).toContain("ROLLBACK");
    expect(fake.tables.has("pages")).toBe(true);
  });

  it("records that conclusion in the journal so the second run settles it without another attempt", async () => {
    await writeMigrations({
      "0001_create.sql": 'CREATE TABLE "websites" (id int);',
      "0002_alter.sql": 'ALTER TABLE "websites" ADD COLUMN "max_pages" integer;',
    });
    const fake = makeFakeClient({ existingColumns: ["max_pages"] });
    await runPendingMigrations({
      projectRoot: root,
      connectionString: "postgresql://u:p@h/db",
      clientFactory: () => fake.client,
    });
    const before = fake.log.length;
    const second = await runPendingMigrations({
      projectRoot: root,
      connectionString: "postgresql://u:p@h/db",
      clientFactory: () => fake.client,
    });
    expect(second.appliedCount).toBe(0);
    expect(second.skippedCount).toBe(2);
    // No BEGIN/APPLY/ROLLBACK cycle at all the second time round.
    expect(fake.log.slice(before)).toEqual([]);
  });

  it("does NOT extend that leniency to a migration the probe proved pending", async () => {
    // A duplicate-object error on a file whose objects are demonstrably
    // absent is a genuine conflict, not evidence of a prior application.
    await writeMigrations({
      "0001_a.sql": 'CREATE TABLE "alpha" (id int);',
      "0002_b.sql": 'CREATE TABLE "beta" (id int);',
    });
    const fake = makeFakeClient({ failOn: "alpha" });
    const res = await runPendingMigrations({
      projectRoot: root,
      connectionString: "postgresql://u:p@h/db",
      clientFactory: () => fake.client,
    });
    expect(res.ok).toBe(false);
    expect(res.failure?.filename).toBe("0001_a.sql");
    expect(res.failure?.notAttempted).toEqual(["0002_b.sql"]);
  });

  it("refuses to run at all with no DATABASE_URL, rather than half-trying", async () => {
    const res = await runPendingMigrations({ projectRoot: root, connectionString: undefined });
    expect(res.ok).toBe(false);
    expect(res.appliedCount).toBe(0);
    expect(res.message).toMatch(/DATABASE_URL is not set/);
  });

  it("reports an empty migrations directory honestly rather than claiming success", async () => {
    const res = await runPendingMigrations({
      projectRoot: root,
      connectionString: "postgresql://u:p@h/db",
      clientFactory: () => makeFakeClient().client,
    });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/No migration files were found/);
  });
});

describe("install/migrate — helpers", () => {
  it("hashes file contents stably and distinctly", () => {
    expect(hashMigration("a")).toBe(hashMigration("a"));
    expect(hashMigration("a")).not.toBe(hashMigration("b"));
    expect(hashMigration("a")).toHaveLength(64);
  });

  it("recognises every 'already exists' SQLSTATE, and nothing else", () => {
    for (const code of ["42P07", "42701", "42710", "42P06"]) {
      expect(isAlreadyExistsError(Object.assign(new Error("x"), { code }))).toBe(true);
      // Drizzle wraps the driver error, so the code can sit on `.cause`.
      expect(isAlreadyExistsError({ cause: { code } })).toBe(true);
    }
    // A syntax error, a permission error and a missing relation are all real
    // failures that must stop the run.
    for (const code of ["42601", "42501", "42P01", "23505"]) {
      expect(isAlreadyExistsError(Object.assign(new Error("x"), { code }))).toBe(false);
    }
    // Fallback for a wrapper that loses the SQLSTATE entirely.
    expect(isAlreadyExistsError(new Error('relation "x" already exists'))).toBe(true);
    expect(isAlreadyExistsError(new Error("syntax error at or near"))).toBe(false);
  });

  it("excludes objects a LATER migration drops from what a file must produce", () => {
    const files = [
      {
        filename: "0001.sql",
        index: 1,
        createdTables: ["kept", "removed_later"],
        createdTypes: [],
        droppedTables: [],
        droppedTypes: [],
      },
      {
        filename: "0002.sql",
        index: 2,
        createdTables: [],
        createdTypes: [],
        droppedTables: ["removed_later"],
        droppedTypes: [],
      },
    ];
    expect(expectedObjectsFor(files, 0).tables).toEqual(["kept"]);
  });
});
