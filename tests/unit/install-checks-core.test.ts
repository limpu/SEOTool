import { describe, expect, it } from "vitest";
import {
  NODE_BASELINE_MAJOR,
  evaluateNodeVersion,
  evaluatePackageManager,
  parseNodeMajor,
} from "@/lib/install/checks/runtime";
import {
  POSTGRES_BASELINE_MAJOR,
  evaluateDatabaseReachable,
  evaluateDatabaseVersion,
  explainDatabaseFailure,
  parsePostgresMajor,
} from "@/lib/install/checks/database";
import {
  MINIMUM_PRACTICAL_MEMORY_BYTES,
  RECOMMENDED_MEMORY_BYTES,
  evaluateDisk,
  evaluateMemory,
  formatBytes,
} from "@/lib/install/checks/resources";
import { evaluateChromium } from "@/lib/install/checks/chromium";
import { evaluateHealth } from "@/lib/install/checks/health";
import { evaluateHttps, isLocalHost, resolveRequestProtocol } from "@/lib/install/checks/network";

const GB = 1024 ** 3;

/**
 * Web Installer — pass / warn / fail branch coverage for the detection
 * engine's runtime, database, resource, browser, health and transport checks.
 *
 * Every `fail` asserted here also asserts that it carries `howToFix`: the
 * rule is that a user must never see a bare technical error, and a rule that
 * is not tested is a rule that quietly stops being true.
 */
describe("checks/runtime — Node.js", () => {
  it("parses major versions and rejects rubbish", () => {
    expect(parseNodeMajor("v24.19.0")).toBe(24);
    expect(parseNodeMajor("22.1.0")).toBe(22);
    expect(parseNodeMajor("not-a-version")).toBeNull();
  });

  it("PASSES on the baseline major", () => {
    const r = evaluateNodeVersion(`v${NODE_BASELINE_MAJOR}.19.0`);
    expect(r.status).toBe("pass");
  });

  it("FAILS below the baseline, with actionable remediation", () => {
    const r = evaluateNodeVersion("v20.11.0");
    expect(r.status).toBe("fail");
    expect(r.blocking).toBe(true);
    expect(r.howToFix?.length).toBeGreaterThan(0);
    expect(r.howToFix?.join(" ")).toMatch(/nvm|Docker/i);
  });

  it("WARNS above the baseline — newer is untested, not broken", () => {
    const r = evaluateNodeVersion(`v${NODE_BASELINE_MAJOR + 2}.0.0`);
    expect(r.status).toBe("warn");
  });

  it("reports UNKNOWN rather than guessing when the version cannot be parsed", () => {
    const r = evaluateNodeVersion("");
    expect(r.status).toBe("unknown");
    expect(r.howToFix?.length).toBeGreaterThan(0);
  });
});

describe("checks/runtime — package manager", () => {
  it("PASSES when pnpm is available", () => {
    const r = evaluatePackageManager({ pnpmVersion: "11.22.0", npmVersion: "11.0.0" });
    expect(r.status).toBe("pass");
    expect(r.summary).toContain("11.22.0");
  });

  it("WARNS (never fails) when only npm is available", () => {
    const r = evaluatePackageManager({ pnpmVersion: null, npmVersion: "11.0.0" });
    expect(r.status).toBe("warn");
    expect(r.blocking).toBe(false);
    expect(r.howToFix?.join(" ")).toMatch(/corepack/i);
  });

  it("WARNS when neither is present, and says so is normal in a prebuilt container", () => {
    const r = evaluatePackageManager({ pnpmVersion: null, npmVersion: null });
    expect(r.status).toBe("warn");
    expect(r.detail).toMatch(/container/i);
  });
});

describe("checks/database — version", () => {
  it("parses the Postgres version banner", () => {
    expect(parsePostgresMajor("PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on x86_64")).toBe(18);
    expect(parsePostgresMajor("PostgreSQL 14.2")).toBe(14);
    expect(parsePostgresMajor("MySQL 8")).toBeNull();
  });

  it("PASSES on the baseline", () => {
    const r = evaluateDatabaseVersion({
      reachable: true,
      versionString: `PostgreSQL ${POSTGRES_BASELINE_MAJOR}.6 (Debian) on x86_64`,
      target: "postgresql://u@h:5432/db",
    });
    expect(r.status).toBe("pass");
  });

  it("does not publish the full version banner — the OS build and compiler are host fingerprinting", () => {
    const r = evaluateDatabaseVersion({
      reachable: true,
      versionString: "PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on x86_64-pc-linux-gnu, compiled by gcc 14.2.0",
      target: "postgresql://u@h:5432/db",
    });
    expect(r.summary).not.toContain("gcc");
    expect(r.summary).not.toContain("x86_64");
  });

  it("WARNS between the hard minimum and the baseline", () => {
    const r = evaluateDatabaseVersion({
      reachable: true,
      versionString: "PostgreSQL 15.4",
      target: "t",
    });
    expect(r.status).toBe("warn");
  });

  it("FAILS below the hard minimum, explaining gen_random_uuid()", () => {
    const r = evaluateDatabaseVersion({ reachable: true, versionString: "PostgreSQL 11.2", target: "t" });
    expect(r.status).toBe("fail");
    expect(r.detail).toMatch(/gen_random_uuid/);
    expect(r.howToFix?.length).toBeGreaterThan(0);
  });

  it("is UNKNOWN (not fail) when the database was never reached", () => {
    const r = evaluateDatabaseVersion({ reachable: false, target: "t" });
    expect(r.status).toBe("unknown");
  });
});

describe("checks/database — failure explanations", () => {
  const cases: [string, RegExp][] = [
    ["ECONNREFUSED", /refused the connection/i],
    ["ENOTFOUND", /could not be resolved/i],
    ["ETIMEDOUT", /timed out/i],
    ["28P01", /rejected the password/i],
    ["3D000", /does not exist/i],
    ["42501", /sufficient privileges/i],
    ["53300", /too many clients/i],
  ];

  it.each(cases)("explains %s in human terms with real remediation", (code, matcher) => {
    const e = explainDatabaseFailure({
      code,
      sanitizedMessage: "some driver message",
      target: "postgresql://seo_user@localhost:5433/seo_platform",
    });
    expect(e.summary).toMatch(matcher);
    expect(e.howToFix.length).toBeGreaterThan(0);
    // Never a bare technical error.
    expect(e.summary).not.toMatch(/^[A-Z0-9]+$/);
  });

  it("falls back to a useful explanation for an unrecognised code", () => {
    const e = explainDatabaseFailure({ code: "XX999", sanitizedMessage: "weird", target: "t" });
    expect(e.summary).toMatch(/could not be reached/i);
    expect(e.howToFix.length).toBeGreaterThan(0);
  });

  it("gives the classic container mistake as remediation for a refused connection", () => {
    const e = explainDatabaseFailure({ code: "ECONNREFUSED", sanitizedMessage: "", target: "t" });
    expect(e.howToFix.join(" ")).toMatch(/means the container itself/i);
  });

  it("a failure result never contains the password, even when the driver message did", () => {
    // The message reaching this function is already sanitized by
    // `probeDatabase`; this asserts the explanation adds nothing back.
    const r = evaluateDatabaseReachable({
      reachable: false,
      errorCode: "28P01",
      errorMessage: 'password authentication failed for user "seo_user"',
      target: "postgresql://seo_user@localhost:5433/seo_platform",
    });
    expect(JSON.stringify(r)).not.toMatch(/hunter2|secret|password authentication failed for user "seo_user" using/);
    expect(r.status).toBe("fail");
    expect(r.howToFix?.length).toBeGreaterThan(0);
  });

  it("PASSES and reports the round trip when reachable", () => {
    const r = evaluateDatabaseReachable({
      reachable: true,
      target: "postgresql://seo_user@localhost:5433/seo_platform",
      elapsedMs: 12,
    });
    expect(r.status).toBe("pass");
    expect(r.summary).toContain("12 ms");
  });
});

describe("checks/resources — memory and disk WARN, never block", () => {
  it("formats byte counts readably", () => {
    expect(formatBytes(4 * GB)).toBe("4.0 GB");
    expect(formatBytes(512 * 1024 ** 2)).toBe("512 MB");
    expect(formatBytes(-1)).toBe("unknown");
  });

  it("PASSES at or above the 4 GB recommendation", () => {
    const r = evaluateMemory(RECOMMENDED_MEMORY_BYTES, 2 * GB);
    expect(r.status).toBe("pass");
  });

  it("WARNS between 2 GB and 4 GB", () => {
    const r = evaluateMemory(3 * GB);
    expect(r.status).toBe("warn");
    expect(r.blocking).toBe(false);
  });

  it("WARNS — does not fail — below the 2 GB practical minimum", () => {
    const r = evaluateMemory(MINIMUM_PRACTICAL_MEMORY_BYTES - 1);
    expect(r.status).toBe("warn");
    expect(r.status).not.toBe("fail");
    expect(r.blocking).toBe(false);
    expect(r.howToFix?.join(" ")).toMatch(/swap|RAM/i);
  });

  it("says the reported figure is the host's unless a cgroup limit applies", () => {
    expect(evaluateMemory(8 * GB).detail).toMatch(/cgroup limit/i);
  });

  it("is UNKNOWN when memory cannot be determined", () => {
    expect(evaluateMemory(Number.NaN).status).toBe("unknown");
  });

  it("PASSES with ample disk and names what actually consumes it", () => {
    const r = evaluateDisk({ availableBytes: 50 * GB, totalBytes: 100 * GB });
    expect(r.status).toBe("pass");
    expect(r.detail).toMatch(/Lighthouse/i);
    expect(r.detail).toMatch(/crawl/i);
  });

  it("WARNS on low disk and on critically low disk, never blocking either", () => {
    const low = evaluateDisk({ availableBytes: 3 * GB, totalBytes: 100 * GB });
    expect(low.status).toBe("warn");
    const critical = evaluateDisk({ availableBytes: 100 * 1024 ** 2, totalBytes: 100 * GB });
    expect(critical.status).toBe("warn");
    expect(critical.blocking).toBe(false);
    expect(critical.howToFix?.length).toBeGreaterThan(0);
  });

  it("is UNKNOWN when the filesystem cannot be measured", () => {
    const r = evaluateDisk({ availableBytes: null, totalBytes: null, error: "ENOSYS" });
    expect(r.status).toBe("unknown");
    expect(r.howToFix?.length).toBeGreaterThan(0);
  });
});

describe("checks/chromium — execution, not presence", () => {
  it("PASSES only when the binary actually ran", () => {
    const r = evaluateChromium({
      resolvedPath: "/usr/bin/chromium",
      source: "well-known-path",
      versionOutput: "Chromium 141.0.0.0",
      executionError: null,
      configuredPathMissing: false,
    });
    expect(r.status).toBe("pass");
    expect(r.summary).toContain("Chromium 141");
  });

  it("does NOT report PageSpeed as working when the binary exists but cannot execute", () => {
    const r = evaluateChromium({
      resolvedPath: "/usr/bin/chromium",
      source: "well-known-path",
      versionOutput: null,
      executionError: "error while loading shared libraries: libnss3.so",
      configuredPathMissing: false,
    });
    expect(r.status).not.toBe("pass");
    expect(r.status).toBe("warn");
    expect(r.detail).toMatch(/libnss3/);
    expect(r.howToFix?.length).toBeGreaterThan(0);
  });

  it("WARNS (never blocks) when no browser is found — PageSpeed is one module, not the platform", () => {
    const r = evaluateChromium({
      resolvedPath: null,
      source: "none",
      versionOutput: null,
      executionError: null,
      configuredPathMissing: false,
    });
    expect(r.status).toBe("warn");
    expect(r.blocking).toBe(false);
  });

  it("calls out a configured PAGESPEED_CHROME_PATH that points at nothing", () => {
    const r = evaluateChromium({
      resolvedPath: null,
      source: "PAGESPEED_CHROME_PATH",
      versionOutput: null,
      executionError: null,
      configuredPathMissing: true,
    });
    expect(r.summary).toMatch(/PAGESPEED_CHROME_PATH is set/);
    expect(r.howToFix?.length).toBeGreaterThan(0);
  });
});

describe("checks/health — the existing /api/health contract", () => {
  it("PASSES on 200 + status ok", () => {
    const r = evaluateHealth({ httpStatus: 200, body: { status: "ok" }, url: "http://h/api/health" });
    expect(r.status).toBe("pass");
  });

  it("FAILS on the documented 503, pointing at the database checks for the cause", () => {
    const r = evaluateHealth({ httpStatus: 503, body: { status: "error" }, url: "http://h/api/health" });
    expect(r.status).toBe("fail");
    expect(r.detail).toMatch(/withholds detail/i);
    expect(r.howToFix?.length).toBeGreaterThan(0);
  });

  it("WARNS on any status outside the 200/503 contract — something is intercepting", () => {
    const r = evaluateHealth({ httpStatus: 401, body: null, url: "http://h/api/health" });
    expect(r.status).toBe("warn");
    expect(r.detail).toMatch(/proxy|WAF|gateway/i);
  });

  it("is UNKNOWN when the self-request never completes", () => {
    const r = evaluateHealth({
      httpStatus: null,
      body: null,
      url: "http://h/api/health",
      transportError: "fetch failed",
    });
    expect(r.status).toBe("unknown");
    expect(r.howToFix?.length).toBeGreaterThan(0);
  });
});

describe("checks/network — HTTPS", () => {
  const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

  it("honours x-forwarded-proto so a correctly proxied HTTPS site is not called insecure", () => {
    expect(resolveRequestProtocol(headers({ "x-forwarded-proto": "https" }))).toEqual({
      protocol: "https",
      viaProxyHeader: true,
    });
    // Load balancers append; the first value is the client-facing one.
    expect(resolveRequestProtocol(headers({ "x-forwarded-proto": "https, http" })).protocol).toBe("https");
    expect(resolveRequestProtocol(headers({})).protocol).toBe("http");
  });

  it("recognises development hostnames", () => {
    for (const h of ["localhost", "127.0.0.1", "::1", "0.0.0.0", "app.localhost", "foo.test", "box.local"]) {
      expect(isLocalHost(h)).toBe(true);
    }
    expect(isLocalHost("seo.example.com")).toBe(false);
    expect(isLocalHost("LOCALHOST:3000")).toBe(true);
  });

  it("PASSES over HTTPS", () => {
    const r = evaluateHttps({
      protocol: "https",
      viaProxyHeader: true,
      host: "seo.example.com",
      isProduction: true,
    });
    expect(r.status).toBe("pass");
  });

  it("FAILS and BLOCKS on plain HTTP in production, naming both concrete consequences", () => {
    const r = evaluateHttps({
      protocol: "http",
      viaProxyHeader: false,
      host: "seo.example.com",
      isProduction: true,
    });
    expect(r.status).toBe("fail");
    expect(r.blocking).toBe(true);
    expect(r.detail).toMatch(/clear text/i);
    expect(r.detail).toMatch(/secure/i);
    expect(r.howToFix?.join(" ")).toMatch(/X-Forwarded-Proto/i);
  });

  it("treats plain HTTP on localhost in development as OPTIONAL, not a defect", () => {
    const r = evaluateHttps({
      protocol: "http",
      viaProxyHeader: false,
      host: "localhost:3000",
      isProduction: false,
    });
    expect(r.status).toBe("optional");
    expect(r.blocking).toBe(false);
  });

  it("WARNS on plain HTTP on a real host outside production", () => {
    const r = evaluateHttps({
      protocol: "http",
      viaProxyHeader: false,
      host: "staging.example.com",
      isProduction: false,
    });
    expect(r.status).toBe("warn");
  });
});
