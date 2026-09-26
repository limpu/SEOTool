import { describe, it, expect } from "vitest";
import { generateResetToken, hashResetToken, getResetTokenExpiry } from "@/lib/auth/tokens";

describe("password reset tokens", () => {
  it("generates a plaintext token and matching hash", () => {
    const { plaintext, hash } = generateResetToken();
    expect(plaintext.length).toBeGreaterThan(30);
    expect(hashResetToken(plaintext)).toBe(hash);
  });

  it("produces different tokens each time", () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a.plaintext).not.toBe(b.plaintext);
  });

  it("sets an expiry in the future", () => {
    const expiry = getResetTokenExpiry();
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
  });
});
