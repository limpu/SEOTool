import { describe, it, expect } from "vitest";
import {
  phoneSchema,
  updateProfileSchema,
  requestEmailChangeSchema,
  confirmEmailChangeSchema,
} from "@/lib/validation/auth";
import { generateOtp, hashOtp, verifyOtp, getOtpExpiry, OTP_MAX_ATTEMPTS } from "@/lib/auth/otp";

describe("phoneSchema — reasonable E.164-ish validation (not full SMS verification)", () => {
  it("accepts a valid +-prefixed international number", () => {
    expect(phoneSchema.safeParse("+15551234567").success).toBe(true);
  });

  it("accepts a valid number without a + prefix", () => {
    expect(phoneSchema.safeParse("15551234567").success).toBe(true);
  });

  it("accepts an empty string (phone is optional)", () => {
    expect(phoneSchema.safeParse("").success).toBe(true);
  });

  it("accepts undefined (phone is optional)", () => {
    expect(phoneSchema.safeParse(undefined).success).toBe(true);
  });

  it("rejects a too-short number", () => {
    expect(phoneSchema.safeParse("12345").success).toBe(false);
  });

  it("rejects a too-long number", () => {
    expect(phoneSchema.safeParse("1234567890123456").success).toBe(false);
  });

  it("rejects letters mixed into the number", () => {
    expect(phoneSchema.safeParse("+1555CALLNOW").success).toBe(false);
  });

  it("rejects garbage with symbols/spaces (not silently accepted)", () => {
    expect(phoneSchema.safeParse("(555) 123-4567 ext.9").success).toBe(false);
  });
});

describe("updateProfileSchema", () => {
  it("accepts a full valid profile payload", () => {
    const result = updateProfileSchema.safeParse({
      name: "Test User",
      phone: "+15551234567",
      addressLine1: "123 Main St",
      addressLine2: "",
      city: "Springfield",
      state: "IL",
      postalCode: "62704",
      addressCountry: "us",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // country is normalized to uppercase
      expect(result.data.addressCountry).toBe("US");
    }
  });

  it("rejects an empty name", () => {
    const result = updateProfileSchema.safeParse({
      name: "",
      phone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      addressCountry: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid phone within the full payload", () => {
    const result = updateProfileSchema.safeParse({
      name: "Test User",
      phone: "abc",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      addressCountry: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-2-letter country code", () => {
    const result = updateProfileSchema.safeParse({
      name: "Test User",
      phone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      addressCountry: "USA",
    });
    expect(result.success).toBe(false);
  });
});

describe("requestEmailChangeSchema — duplicate/format validation", () => {
  it("accepts a valid email", () => {
    expect(requestEmailChangeSchema.safeParse({ newEmail: "new@example.com" }).success).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(requestEmailChangeSchema.safeParse({ newEmail: "not-an-email" }).success).toBe(false);
  });

  it("rejects a missing newEmail", () => {
    expect(requestEmailChangeSchema.safeParse({}).success).toBe(false);
  });
});

describe("confirmEmailChangeSchema", () => {
  it("accepts a 6-digit code", () => {
    expect(confirmEmailChangeSchema.safeParse({ otp: "123456" }).success).toBe(true);
  });

  it("rejects a non-6-digit code", () => {
    expect(confirmEmailChangeSchema.safeParse({ otp: "12345" }).success).toBe(false);
  });

  it("rejects non-numeric characters", () => {
    expect(confirmEmailChangeSchema.safeParse({ otp: "12345a" }).success).toBe(false);
  });
});

describe("pending-email OTP state machine (logic mirrored from the confirm route)", () => {
  // These tests exercise the exact decision logic the confirm route applies
  // against a `users` row's pending-email fields, without hitting the DB —
  // i.e. they validate the state machine's rules in isolation.

  function evaluate(row: {
    pendingEmail: string | null;
    pendingEmailOtpHash: string | null;
    pendingEmailOtpExpiresAt: Date | null;
    pendingEmailOtpAttempts: number;
  }, submittedOtp: string, now: Date) {
    if (!row.pendingEmail || !row.pendingEmailOtpHash || !row.pendingEmailOtpExpiresAt) {
      return { ok: false, reason: "no_pending_change" as const };
    }
    if (row.pendingEmailOtpExpiresAt < now) {
      return { ok: false, reason: "expired" as const };
    }
    if (row.pendingEmailOtpAttempts >= OTP_MAX_ATTEMPTS) {
      return { ok: false, reason: "too_many_attempts" as const };
    }
    if (!verifyOtp(submittedOtp, row.pendingEmailOtpHash)) {
      return { ok: false, reason: "invalid_otp" as const };
    }
    return { ok: true as const, newEmail: row.pendingEmail };
  }

  it("rejects confirm when there is no pending change at all (fresh account, never requested)", () => {
    const result = evaluate(
      { pendingEmail: null, pendingEmailOtpHash: null, pendingEmailOtpExpiresAt: null, pendingEmailOtpAttempts: 0 },
      "123456",
      new Date()
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_pending_change");
  });

  it("accepts the correct OTP and returns the pending email as the new email — old email untouched by this function", () => {
    const otp = generateOtp();
    const hash = hashOtp(otp);
    const result = evaluate(
      {
        pendingEmail: "new@example.com",
        pendingEmailOtpHash: hash,
        pendingEmailOtpExpiresAt: getOtpExpiry(),
        pendingEmailOtpAttempts: 0,
      },
      otp,
      new Date()
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newEmail).toBe("new@example.com");
  });

  it("rejects an incorrect OTP without changing the pending state's validity", () => {
    const otp = generateOtp();
    const hash = hashOtp(otp);
    const wrongOtp = otp === "000000" ? "111111" : "000000";
    const result = evaluate(
      {
        pendingEmail: "new@example.com",
        pendingEmailOtpHash: hash,
        pendingEmailOtpExpiresAt: getOtpExpiry(),
        pendingEmailOtpAttempts: 0,
      },
      wrongOtp,
      new Date()
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_otp");
  });

  it("rejects an expired OTP even when the code itself is correct", () => {
    const otp = generateOtp();
    const hash = hashOtp(otp);
    const alreadyExpired = new Date(Date.now() - 1000);
    const result = evaluate(
      {
        pendingEmail: "new@example.com",
        pendingEmailOtpHash: hash,
        pendingEmailOtpExpiresAt: alreadyExpired,
        pendingEmailOtpAttempts: 0,
      },
      otp,
      new Date()
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("expired");
  });

  it("rejects once attempts reach OTP_MAX_ATTEMPTS, even with the correct code", () => {
    const otp = generateOtp();
    const hash = hashOtp(otp);
    const result = evaluate(
      {
        pendingEmail: "new@example.com",
        pendingEmailOtpHash: hash,
        pendingEmailOtpExpiresAt: getOtpExpiry(),
        pendingEmailOtpAttempts: OTP_MAX_ATTEMPTS,
      },
      otp,
      new Date()
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("too_many_attempts");
  });
});
