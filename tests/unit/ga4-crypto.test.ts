import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "crypto";

describe("ga4 token encryption (AES-256-GCM)", () => {
  beforeAll(() => {
    process.env.GA4_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  it("round-trips plaintext through encrypt/decrypt", async () => {
    const { encryptGa4Token, decryptGa4Token } = await import("@/lib/ga4/crypto");
    const plaintext = "1//0gA_fake_ga4_refresh_token_ABC123";
    const encrypted = encryptGa4Token(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decryptGa4Token(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const { encryptGa4Token } = await import("@/lib/ga4/crypto");
    const a = encryptGa4Token("same-value");
    const b = encryptGa4Token("same-value");
    expect(a).not.toBe(b);
  });

  it("stores ciphertext in iv:authTag:ciphertext format", async () => {
    const { encryptGa4Token } = await import("@/lib/ga4/crypto");
    const encrypted = encryptGa4Token("value");
    expect(encrypted.split(":")).toHaveLength(3);
  });

  it("throws on tampered ciphertext (auth tag mismatch)", async () => {
    const { encryptGa4Token, decryptGa4Token } = await import("@/lib/ga4/crypto");
    const encrypted = encryptGa4Token("value");
    const [iv, authTag, ciphertext] = encrypted.split(":");
    const tampered = `${iv}:${authTag}:${Buffer.from("tampered").toString("base64")}${ciphertext.slice(4)}`;
    expect(() => decryptGa4Token(tampered)).toThrow();
  });

  it("reports configured when a valid 32-byte key is present", async () => {
    const { isGa4TokenEncryptionConfigured } = await import("@/lib/ga4/crypto");
    expect(isGa4TokenEncryptionConfigured()).toBe(true);
  });

  it("uses an independent key from GSC's — decrypting a GSC ciphertext with the GA4 key fails", async () => {
    const gscKey = randomBytes(32).toString("base64");
    process.env.GSC_TOKEN_ENCRYPTION_KEY = gscKey;
    const gsc = await import("@/lib/gsc/crypto");
    const ga4 = await import("@/lib/ga4/crypto");
    const gscCiphertext = gsc.encryptToken("shared-plaintext");
    expect(() => ga4.decryptGa4Token(gscCiphertext)).toThrow();
  });
});

describe("ga4 token encryption without a configured key", () => {
  it("throws a clear error when GA4_TOKEN_ENCRYPTION_KEY is missing", async () => {
    const original = process.env.GA4_TOKEN_ENCRYPTION_KEY;
    delete process.env.GA4_TOKEN_ENCRYPTION_KEY;
    try {
      const { isGa4TokenEncryptionConfigured } = await import("@/lib/ga4/crypto");
      expect(isGa4TokenEncryptionConfigured()).toBe(false);
    } finally {
      if (original) process.env.GA4_TOKEN_ENCRYPTION_KEY = original;
    }
  });
});
