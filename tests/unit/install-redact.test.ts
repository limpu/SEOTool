import { describe, expect, it } from "vitest";
import {
  REDACTED,
  describeConnectionTarget,
  extractPasswordFromUri,
  redactConnectionString,
  redactKnownSecretValues,
  sanitizeError,
  sanitizeForDisplay,
  stripAbsolutePaths,
} from "@/lib/install/redact";

/**
 * Web Installer — secret-redaction tests.
 *
 * The installer is the only surface in this product that handles a raw
 * connection string, so these are the tests that decide whether Section 79
 * #6 ("never expose secrets in any response, log, or admin UI") actually
 * holds when a `pg` error carries the password in its message.
 */
describe("install/redact — connection strings", () => {
  it("removes the password from a URI connection string but keeps the diagnosable parts", () => {
    const out = redactConnectionString("postgresql://seo_user:sup3r-s3cret@localhost:5433/seo_platform");
    expect(out).not.toContain("sup3r-s3cret");
    expect(out).toContain(REDACTED);
    // Username, host, port and database name are NOT secrets and are the
    // entire diagnosis — redacting them would make the installer useless.
    expect(out).toContain("seo_user");
    expect(out).toContain("localhost:5433");
    expect(out).toContain("seo_platform");
  });

  it("removes the password when the connection string is embedded in a sentence", () => {
    const msg =
      'could not connect to server: connection to "postgresql://seo_user:hunter2hunter2@db.internal:5432/app" failed';
    const out = redactConnectionString(msg);
    expect(out).not.toContain("hunter2hunter2");
    expect(out).toContain(REDACTED);
  });

  it("redacts every occurrence, not just the first", () => {
    const out = redactConnectionString(
      "primary postgres://u:pw-one-aaa@h1/db and replica postgres://u:pw-two-bbb@h2/db"
    );
    expect(out).not.toContain("pw-one-aaa");
    expect(out).not.toContain("pw-two-bbb");
  });

  it("redacts libpq keyword-form passwords", () => {
    expect(redactConnectionString("host=db user=seo password=letmein port=5432")).not.toContain("letmein");
    expect(redactConnectionString("PGPASSWORD=topsecretvalue psql")).not.toContain("topsecretvalue");
    expect(redactConnectionString("password = 'quoted secret'")).not.toContain("quoted secret");
  });

  it("leaves a password-free string untouched", () => {
    const clean = "connection to server at localhost port 5433 failed";
    expect(redactConnectionString(clean)).toBe(clean);
  });

  it("extracts the password component so it can be scrubbed separately", () => {
    expect(extractPasswordFromUri("postgresql://u:abc123@h:5432/db")).toBe("abc123");
    expect(extractPasswordFromUri("postgresql://h:5432/db")).toBeNull();
    expect(extractPasswordFromUri("not a url")).toBeNull();
  });

  it("describes the connection target without the password", () => {
    const desc = describeConnectionTarget("postgresql://seo_user:secretpw12@localhost:5433/seo_platform");
    expect(desc).toBe("postgresql://seo_user@localhost:5433/seo_platform");
    expect(desc).not.toContain("secretpw12");
  });

  it("never echoes back an unparseable connection string — it may itself be a pasted secret", () => {
    expect(describeConnectionTarget("this-is-garbage-maybe-a-password")).toBe(
      "(unparseable connection string)"
    );
  });
});

describe("install/redact — verbatim secret values", () => {
  it("scrubs the real DATABASE_URL password wherever it appears, in any shape", () => {
    const env = {
      DATABASE_URL: "postgresql://seo_user:VeryLongPassword123@localhost:5433/seo_platform",
    } as unknown as NodeJS.ProcessEnv;
    // A driver that prints only the password, with no surrounding URI —
    // nothing structural to match on, which is exactly why this backstop exists.
    const out = redactKnownSecretValues('authentication failed using "VeryLongPassword123"', env);
    expect(out).not.toContain("VeryLongPassword123");
    expect(out).toContain(REDACTED);
  });

  it("scrubs JWT_SECRET and the token-encryption keys", () => {
    const env = {
      JWT_SECRET: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      GSC_TOKEN_ENCRYPTION_KEY: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      EMAIL_PASS: "cccccccccccccccc",
    } as unknown as NodeJS.ProcessEnv;
    const out = redactKnownSecretValues(
      "jwt=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa key=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb smtp=cccccccccccccccc",
      env
    );
    expect(out).not.toContain("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(out).not.toContain("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(out).not.toContain("cccccccccccccccc");
  });

  it("skips values shorter than 8 characters so unrelated text is not corrupted", () => {
    const env = { JWT_SECRET: "abc" } as unknown as NodeJS.ProcessEnv;
    expect(redactKnownSecretValues("the abc of it", env)).toBe("the abc of it");
  });

  it("accepts an extra secret supplied by the caller (a candidate string not yet in env)", () => {
    const out = redactKnownSecretValues("failed for CandidatePassword99", {} as unknown as NodeJS.ProcessEnv, [
      "CandidatePassword99",
    ]);
    expect(out).not.toContain("CandidatePassword99");
  });
});

describe("install/redact — absolute paths", () => {
  it("reduces a Windows absolute path to its final segment", () => {
    // Generic name on purpose: this file ships in the distributed source, and a
    // real operator's account name in a fixture is a small privacy leak for no
    // test value. The space is retained because paths with spaces are the case
    // this fixture exists to cover.
    const out = stripAbsolutePaths("cannot read C:\\Users\\Jane Doe\\Desktop\\app\\.install-token");
    expect(out).not.toContain("C:\\Users");
    expect(out).toContain(".install-token");
  });

  it("reduces a POSIX system path to its final segment", () => {
    const out = stripAbsolutePaths("ENOENT: no such file or directory, open '/app/database/migrations/x.sql'");
    expect(out).not.toContain("/app/database");
    expect(out).toContain("x.sql");
  });

  it("does not mangle a URL", () => {
    const url = "https://example.com/api/gsc/callback";
    expect(stripAbsolutePaths(url)).toBe(url);
  });
});

describe("install/redact — sanitizeError (the exit point)", () => {
  it("never leaks the password from a database error, in any of its shapes", () => {
    const env = {
      DATABASE_URL: "postgresql://seo_user:P@ssw0rdLongEnough@localhost:5433/seo_platform",
    } as unknown as NodeJS.ProcessEnv;
    const err = new Error(
      'connection to server failed: postgresql://seo_user:P@ssw0rdLongEnough@localhost:5433/seo_platform — password authentication failed for user "seo_user"'
    );
    const out = sanitizeError(err, { env });
    expect(out).not.toContain("P@ssw0rdLongEnough");
    expect(out).toContain("seo_user");
  });

  it("uses only the message and never the stack trace", () => {
    const err = new Error("boom");
    err.stack = "Error: boom\n    at Object.<anonymous> (/app/src/lib/db/index.ts:12:9)";
    const out = sanitizeError(err);
    expect(out).toBe("boom");
    expect(out).not.toContain("src/lib/db");
    expect(out).not.toContain("at Object");
  });

  it("handles non-Error throws without exposing anything", () => {
    expect(sanitizeError({ weird: true })).toBe("An unexpected error occurred.");
    expect(sanitizeError("plain string failure")).toBe("plain string failure");
  });

  it("caps runaway driver messages", () => {
    const out = sanitizeForDisplay("x".repeat(5000), { maxLength: 100 });
    expect(out.length).toBe(100);
    expect(out.endsWith("…")).toBe(true);
  });

  it("collapses whitespace so multi-line driver output stays one readable line", () => {
    expect(sanitizeForDisplay("line one\n\n   line two")).toBe("line one line two");
  });
});
