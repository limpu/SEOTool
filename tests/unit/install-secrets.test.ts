import { describe, expect, it } from "vitest";
import {
  GENERATABLE_SECRETS,
  evaluateSecretRotation,
  generateSecretValue,
  isGeneratableSecretName,
} from "@/lib/install/actions/secrets";

/**
 * Web Installer — Stage 2. Secret generation, and the refusal that matters
 * more than the generation.
 *
 * The generation assertions are ordinary. The rotation assertions are the
 * point of the file: rotating either token-encryption key makes every stored
 * Google refresh token permanently undecryptable, and this codebase has no
 * key versioning, so an accidental one-click rotation is unrecoverable data
 * loss. The default for an already-set key must be REFUSAL.
 */
describe("install/secrets — generation", () => {
  it("generates 32 bytes of real entropy for every supported variable", () => {
    for (const spec of Object.values(GENERATABLE_SECRETS)) {
      const value = generateSecretValue(spec);
      const decoded = Buffer.from(value, spec.encoding);
      expect(decoded.length).toBe(32);
    }
  });

  it("encodes the AES keys as base64 that decodes to exactly 32 bytes — the shape gsc/ga4 crypto requires", () => {
    for (const name of ["GSC_TOKEN_ENCRYPTION_KEY", "GA4_TOKEN_ENCRYPTION_KEY"] as const) {
      const spec = GENERATABLE_SECRETS[name];
      expect(spec.encoding).toBe("base64");
      // The exact check `validateBase64Key32` and `src/lib/gsc/crypto.ts` run.
      expect(Buffer.from(generateSecretValue(spec), "base64").length).toBe(32);
    }
  });

  it("encodes JWT_SECRET as base64url — safe to paste into a shell, a URL or a compose file unquoted", () => {
    const value = generateSecretValue(GENERATABLE_SECRETS.JWT_SECRET);
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(value).not.toContain("=");
  });

  it("never repeats — 500 generations are 500 distinct values", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(generateSecretValue(GENERATABLE_SECRETS.JWT_SECRET));
    expect(seen.size).toBe(500);
  });

  it("only recognises the three variables it is allowed to generate", () => {
    expect(isGeneratableSecretName("JWT_SECRET")).toBe(true);
    expect(isGeneratableSecretName("DATABASE_URL")).toBe(false);
    expect(isGeneratableSecretName("NODE_OPTIONS")).toBe(false);
    expect(isGeneratableSecretName("")).toBe(false);
  });
});

describe("install/secrets — REFUSAL TO ROTATE AN EXISTING KEY", () => {
  it("generates freely when the variable is unset — nothing has been encrypted or signed with it", () => {
    for (const spec of Object.values(GENERATABLE_SECRETS)) {
      const d = evaluateSecretRotation(spec, undefined, false);
      expect(d.allowed).toBe(true);
      expect(d.code).toBe("generate_new");
      expect(d.consequences).toEqual([]);
    }
  });

  it("treats an empty / whitespace value as unset", () => {
    expect(evaluateSecretRotation(GENERATABLE_SECRETS.JWT_SECRET, "", false).allowed).toBe(true);
    expect(evaluateSecretRotation(GENERATABLE_SECRETS.JWT_SECRET, "   ", false).allowed).toBe(true);
  });

  it("REFUSES by default when a value already exists, for every variable", () => {
    for (const spec of Object.values(GENERATABLE_SECRETS)) {
      const d = evaluateSecretRotation(spec, "an-existing-value", false);
      expect(d.allowed).toBe(false);
      expect(d.code).toBe("confirmation_required");
      // 409, not 400 — the request is well formed, it conflicts with reality.
      expect(d.httpStatus).toBe(409);
      expect(d.consequences.length).toBeGreaterThan(0);
    }
  });

  it("states the UNRECOVERABLE consequence for both token-encryption keys, and marks them destructive", () => {
    for (const name of ["GSC_TOKEN_ENCRYPTION_KEY", "GA4_TOKEN_ENCRYPTION_KEY"] as const) {
      const d = evaluateSecretRotation(GENERATABLE_SECRETS[name], "existing", false);
      expect(d.destructive).toBe(true);
      const text = d.consequences.join(" ").toLowerCase();
      // The two facts an operator must see before clicking.
      expect(text).toContain("permanently undecryptable");
      expect(text).toContain("no key versioning");
      expect(text).toMatch(/disconnect|authorise it again|reconnect/);
    }
  });

  it("states BOTH JWT_SECRET consequences — sessions AND in-flight OAuth state signing", () => {
    const d = evaluateSecretRotation(GENERATABLE_SECRETS.JWT_SECRET, "existing", false);
    const text = d.consequences.join(" ").toLowerCase();
    expect(text).toContain("signed out");
    // JWT_SECRET signs the OAuth `state` for both Google flows — the part
    // that is easy to forget and produces an opaque failure.
    expect(text).toContain("state");
    expect(text).toMatch(/search console/);
    expect(text).toMatch(/analytics/);
    // Recoverable, unlike the encryption keys — and it says so.
    expect(d.destructive).toBe(false);
    expect(text).toContain("no stored data is lost");
  });

  it("proceeds ONLY on an explicit confirmation, and still repeats the consequences", () => {
    const spec = GENERATABLE_SECRETS.GSC_TOKEN_ENCRYPTION_KEY;
    const d = evaluateSecretRotation(spec, "existing", true);
    expect(d.allowed).toBe(true);
    expect(d.code).toBe("rotation_confirmed");
    expect(d.destructive).toBe(true);
    expect(d.consequences.length).toBeGreaterThan(0);
  });

  it("never puts the existing value into the decision it returns", () => {
    const secret = "SUPER-SECRET-EXISTING-KEY-VALUE-0123456789";
    const d = evaluateSecretRotation(GENERATABLE_SECRETS.JWT_SECRET, secret, false);
    expect(JSON.stringify(d)).not.toContain(secret);
  });
});
