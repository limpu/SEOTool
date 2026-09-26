import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("hashes a password and verifies it correctly", async () => {
    const hash = await hashPassword("Str0ngPass");
    expect(hash).not.toBe("Str0ngPass");
    expect(await verifyPassword("Str0ngPass", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("Str0ngPass");
    expect(await verifyPassword("WrongPass1", hash)).toBe(false);
  });
});
