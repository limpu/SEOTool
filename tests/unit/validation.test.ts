import { describe, it, expect } from "vitest";
import {
  passwordSchema,
  emailSchema,
  registerSchema,
  getPasswordRequirements,
  isPasswordValid,
} from "@/lib/validation/auth";

describe("password validation", () => {
  it("accepts a valid password", () => {
    expect(passwordSchema.safeParse("Abcdef12").success).toBe(true);
  });

  it("rejects passwords missing requirements", () => {
    expect(passwordSchema.safeParse("abcdefgh").success).toBe(false);
    expect(passwordSchema.safeParse("ABCDEFGH").success).toBe(false);
    expect(passwordSchema.safeParse("Abcdefg").success).toBe(false);
  });

  it("computes live password requirements", () => {
    const reqs = getPasswordRequirements("Abcdef12");
    expect(reqs.every((r) => r.met)).toBe(true);
    expect(isPasswordValid("Abcdef12")).toBe(true);
    expect(isPasswordValid("weak")).toBe(false);
  });
});

describe("email normalization", () => {
  it("lowercases and trims email addresses", () => {
    const result = emailSchema.safeParse("  User@Example.com ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("user@example.com");
  });

  it("rejects invalid email formats", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("registerSchema", () => {
  it("rejects mismatched passwords", () => {
    const result = registerSchema.safeParse({
      name: "Jane Doe",
      email: "jane@example.com",
      password: "Abcdef12",
      confirmPassword: "Different1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid registration input", () => {
    const result = registerSchema.safeParse({
      name: "Jane Doe",
      email: "jane@example.com",
      password: "Abcdef12",
      confirmPassword: "Abcdef12",
    });
    expect(result.success).toBe(true);
  });
});
