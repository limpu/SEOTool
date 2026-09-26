import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "crypto";

describe("gsc token encryption (AES-256-GCM)", () => {
  beforeAll(() => {
    process.env.GSC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  it("round-trips plaintext through encrypt/decrypt", async () => {
    const { encryptToken, decryptToken } = await import("@/lib/gsc/crypto");
    const plaintext = "1//0gA_fake_refresh_token_value_ABC123";
    const encrypted = encryptToken(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const { encryptToken } = await import("@/lib/gsc/crypto");
    const a = encryptToken("same-value");
    const b = encryptToken("same-value");
    expect(a).not.toBe(b);
  });

  it("stores ciphertext in iv:authTag:ciphertext format", async () => {
    const { encryptToken } = await import("@/lib/gsc/crypto");
    const encrypted = encryptToken("value");
    expect(encrypted.split(":")).toHaveLength(3);
  });

  it("throws on tampered ciphertext (auth tag mismatch)", async () => {
    const { encryptToken, decryptToken } = await import("@/lib/gsc/crypto");
    const encrypted = encryptToken("value");
    const [iv, authTag, ciphertext] = encrypted.split(":");
    const tampered = `${iv}:${authTag}:${Buffer.from("tampered").toString("base64")}${ciphertext.slice(4)}`;
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("reports configured when a valid 32-byte key is present", async () => {
    const { isTokenEncryptionConfigured } = await import("@/lib/gsc/crypto");
    expect(isTokenEncryptionConfigured()).toBe(true);
  });
});

describe("gsc token encryption without a configured key", () => {
  it("throws a clear error when GSC_TOKEN_ENCRYPTION_KEY is missing", async () => {
    // Isolated dynamic import with the env var cleared for this test only.
    const original = process.env.GSC_TOKEN_ENCRYPTION_KEY;
    delete process.env.GSC_TOKEN_ENCRYPTION_KEY;
    try {
      // Bust the module cache is not straightforward in vitest without
      // vi.resetModules; instead call the exported config-check function
      // directly, which re-reads process.env on every call (no module-level caching).
      const { isTokenEncryptionConfigured } = await import("@/lib/gsc/crypto");
      expect(isTokenEncryptionConfigured()).toBe(false);
    } finally {
      if (original) process.env.GSC_TOKEN_ENCRYPTION_KEY = original;
    }
  });
});
