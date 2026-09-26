import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  computeMigrationReport,
  discoverMigrationFiles,
  evaluateMigrations,
  parseMigrationDrops,
  parseMigrationObjects,
} from "@/lib/install/checks/migrations";

/**
 * Web Installer — migration discovery tests.
 *
 * The rule these enforce: the migration count is ALWAYS read from disk and
 * never hard-coded. A literal count silently becomes wrong the moment a phase
 * adds a migration, and the installer would then report "all applied" over an
 * unapplied schema. So no assertion in this file names a number of files in
 * the real repository — they assert the count matches what is actually on
 * disk, which stays true as the project grows.
 */
describe("migrations — dynamic discovery", () => {
  it("discovers whatever is in the real migrations directory, matching the filesystem exactly", async () => {
    const dir = path.join(process.cwd(), "database", "migrations");
    const onDisk = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith(".sql"));
    const discovered = await discoverMigrationFiles(dir);

    // Deliberately compared against a fresh directory listing, NOT a literal.
    expect(discovered).toHaveLength(onDisk.length);
    expect(discovered.length).toBeGreaterThan(0);
    expect(discovered.map((d) => d.filename)).toEqual([...onDisk].sort());
  });

  it("returns files in filename order, so they can be applied in sequence", async () => {
    const discovered = await discoverMigrationFiles(path.join(process.cwd(), "database", "migrations"));
    const names = discovered.map((d) => d.filename);
    expect(names).toEqual([...names].sort());
  });

  it("parses the numeric prefix of each migration", async () => {
    const discovered = await discoverMigrationFiles(path.join(process.cwd(), "database", "migrations"));
    expect(discovered[0].index).toBe(0);
    for (const f of discovered) expect(Number.isNaN(f.index)).toBe(false);
  });

  it("picks up a newly added migration without any code change", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "install-mig-"));
    try {
      await fs.writeFile(path.join(dir, "0000_a.sql"), 'CREATE TABLE "alpha" ("id" uuid);');
      expect(await discoverMigrationFiles(dir)).toHaveLength(1);
      await fs.writeFile(path.join(dir, "0001_b.sql"), 'CREATE TABLE "beta" ("id" uuid);');
      const after = await discoverMigrationFiles(dir);
      expect(after).toHaveLength(2);
      expect(after[1].createdTables).toEqual(["beta"]);
      // A non-.sql file is ignored rather than counted.
      await fs.writeFile(path.join(dir, "notes.md"), "hello");
      expect(await discoverMigrationFiles(dir)).toHaveLength(2);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("migrations — object parsing", () => {
  it("extracts CREATE TABLE and CREATE TYPE in both drizzle and hand-written forms", () => {
    const sql = `
      CREATE TYPE "public"."site_file_source" AS ENUM('discovered','manual');
      CREATE TABLE "sitemap_documents" ("id" uuid PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS "installation_state" ("id" integer PRIMARY KEY);
      CREATE INDEX "x_idx" ON "sitemap_documents" ("id");
      ALTER TABLE "llms_files" ADD COLUMN "source" text;
    `;
    const parsed = parseMigrationObjects(sql);
    expect(parsed.tables).toEqual(["sitemap_documents", "installation_state"]);
    expect(parsed.types).toEqual(["site_file_source"]);
  });

  it("returns nothing for an ALTER-only or index-only migration", () => {
    expect(parseMigrationObjects('ALTER TABLE "users" ADD COLUMN "phone" varchar(32);')).toEqual({
      tables: [],
      types: [],
    });
    expect(parseMigrationObjects('CREATE INDEX "a_idx" ON "a" ("b");')).toEqual({ tables: [], types: [] });
  });

  it("extracts DROP TABLE and DROP TYPE so superseded migrations can be recognised", () => {
    const sql =
      'DROP TABLE IF EXISTS "backlink_audit_checks";--> statement-breakpoint\nDROP TYPE IF EXISTS "public"."backlink_check_status";';
    expect(parseMigrationDrops(sql)).toEqual({
      tables: ["backlink_audit_checks"],
      types: ["backlink_check_status"],
    });
  });

  it("de-duplicates repeated object names", () => {
    expect(parseMigrationObjects('CREATE TABLE "a" (); CREATE TABLE IF NOT EXISTS "a" ();').tables).toEqual([
      "a",
    ]);
  });
});

describe("migrations — applied / pending report", () => {
  const files = [
    { filename: "0000_a.sql", index: 0, createdTables: ["alpha"], createdTypes: [], droppedTables: [], droppedTypes: [] },
    { filename: "0001_b.sql", index: 1, createdTables: ["beta"], createdTypes: ["beta_kind"], droppedTables: [], droppedTypes: [] },
    { filename: "0002_indexes.sql", index: 2, createdTables: [], createdTypes: [], droppedTables: [], droppedTypes: [] },
  ];

  it("counts applied, pending and indeterminate from the live catalog", () => {
    const report = computeMigrationReport({
      files,
      existingTables: new Set(["alpha"]),
      existingTypes: new Set(),
      journalCount: 0,
    });
    expect(report.detected).toBe(3);
    expect(report.applied).toBe(1);
    expect(report.pending).toBe(1);
    expect(report.indeterminate).toBe(1);
  });

  it("marks a migration pending when only SOME of its objects exist", () => {
    const report = computeMigrationReport({
      files,
      existingTables: new Set(["alpha", "beta"]),
      existingTypes: new Set(), // beta_kind missing
      journalCount: 0,
    });
    expect(report.perFile.find((p) => p.filename === "0001_b.sql")?.verdict).toBe("pending");
  });

  it("reports everything applied when every object is present", () => {
    const report = computeMigrationReport({
      files,
      existingTables: new Set(["alpha", "beta"]),
      existingTypes: new Set(["beta_kind"]),
      journalCount: 0,
    });
    expect(report.applied).toBe(2);
    expect(report.pending).toBe(0);
  });

  it("marks a migration SUPERSEDED, not pending, when a later migration dropped everything it created", () => {
    // This is the real 0020/0021 Backlink Audit case in this repository.
    // Calling 0020 "pending" would tell the operator to re-apply it and
    // resurrect a module that was deliberately deleted.
    const report = computeMigrationReport({
      files: [
        {
          filename: "0020_wealthy_robin_chapel.sql",
          index: 20,
          createdTables: ["backlink_audit_checks"],
          createdTypes: ["backlink_check_status"],
          droppedTables: [],
          droppedTypes: [],
        },
        {
          filename: "0021_remove_backlink_audit.sql",
          index: 21,
          createdTables: [],
          createdTypes: [],
          droppedTables: ["backlink_audit_checks"],
          droppedTypes: ["backlink_check_status"],
        },
      ],
      existingTables: new Set(),
      existingTypes: new Set(),
      journalCount: 0,
    });
    expect(report.perFile[0].verdict).toBe("superseded");
    expect(report.pending).toBe(0);
    expect(report.superseded).toBe(1);
    const r = evaluateMigrations(report, false);
    expect(r.status).toBe("pass");
    expect(r.detail).toMatch(/superseded/i);
    expect(r.detail).toMatch(/does NOT mean the migration needs re-applying/i);
  });

  it("still marks a migration PENDING when only PART of what it created was later dropped", () => {
    const report = computeMigrationReport({
      files: [
        {
          filename: "0000_a.sql",
          index: 0,
          createdTables: ["kept", "removed"],
          createdTypes: [],
          droppedTables: [],
          droppedTypes: [],
        },
        {
          filename: "0001_b.sql",
          index: 1,
          createdTables: [],
          createdTypes: [],
          droppedTables: ["removed"],
          droppedTypes: [],
        },
      ],
      existingTables: new Set(), // `kept` is genuinely missing
      existingTypes: new Set(),
      journalCount: 0,
    });
    expect(report.perFile[0].verdict).toBe("pending");
  });
});

describe("migrations — verdict", () => {
  const applied = (n: number) =>
    computeMigrationReport({
      files: Array.from({ length: n }, (_, i) => ({
        filename: `000${i}_x.sql`,
        index: i,
        createdTables: [`t${i}`],
        createdTypes: [],
        droppedTables: [],
        droppedTypes: [],
      })),
      existingTables: new Set(Array.from({ length: n }, (_, i) => `t${i}`)),
      existingTypes: new Set(),
      journalCount: 0,
    });

  it("PASSES when nothing is pending", () => {
    const r = evaluateMigrations(applied(3), false);
    expect(r.status).toBe("pass");
    expect(r.summary).toContain("3");
  });

  it("explains the empty drizzle journal rather than reporting 0 of N applied", () => {
    // This project's real situation: drizzle.__drizzle_migrations is empty
    // because migrations were applied with psql. Reporting "0 applied" here
    // would be a confidently wrong answer that pushes an operator into
    // re-running migrations that are already in place.
    const r = evaluateMigrations(applied(23), false);
    expect(r.status).toBe("pass");
    expect(r.detail).toMatch(/journal is EMPTY/i);
    expect(r.detail).toMatch(/psql/);
  });

  it("FAILS with the pending filenames and a copy-pasteable psql command", () => {
    const report = computeMigrationReport({
      files: [
        { filename: "0000_a.sql", index: 0, createdTables: ["alpha"], createdTypes: [], droppedTables: [], droppedTypes: [] },
        { filename: "0023_web_installer_state.sql", index: 23, createdTables: ["installation_state"], createdTypes: [], droppedTables: [], droppedTypes: [] },
      ],
      existingTables: new Set(["alpha"]),
      existingTypes: new Set(),
      journalCount: null,
    });
    const r = evaluateMigrations(report, false);
    expect(r.status).toBe("fail");
    expect(r.blocking).toBe(true);
    expect(r.detail).toContain("0023_web_installer_state.sql");
    expect(r.howToFix?.join(" ")).toMatch(/psql/);
  });

  it("is UNKNOWN — not fail — when the database could not be inspected", () => {
    const r = evaluateMigrations(applied(5), true);
    expect(r.status).toBe("unknown");
    expect(r.howToFix?.length).toBeGreaterThan(0);
  });

  it("is UNKNOWN when no migration files are present, and explains the container case", () => {
    const r = evaluateMigrations(applied(0), false);
    expect(r.status).toBe("unknown");
    expect(r.detail).toMatch(/container/i);
  });
});
