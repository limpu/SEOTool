import { describe, it, expect } from "vitest";
import { generateOtp, hashOtp, verifyOtp, getOtpExpiry, OTP_EXPIRY_HOURS } from "@/lib/auth/otp";

describe("OTP", () => {
  it("generates a 6-digit numeric OTP", () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });

  it("hashes consistently and verifies correctly", () => {
    const otp = generateOtp();
    const hash = hashOtp(otp);
    expect(verifyOtp(otp, hash)).toBe(true);
    expect(verifyOtp("000000", hash)).toBe(false);
  });

  it("sets expiry 3 hours in the future", () => {
    const before = Date.now();
    const expiry = getOtpExpiry();
    const diffHours = (expiry.getTime() - before) / (1000 * 60 * 60);
    expect(diffHours).toBeGreaterThan(OTP_EXPIRY_HOURS - 0.01);
    expect(diffHours).toBeLessThanOrEqual(OTP_EXPIRY_HOURS + 0.01);
  });
});
