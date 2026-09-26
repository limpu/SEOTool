import { z } from "zod";

// ─── Password validation rules (shared client + server) ───────────────────────

export const PASSWORD_RULES = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
} as const;

export const passwordSchema = z
  .string()
  .min(PASSWORD_RULES.minLength, `Password must contain at least ${PASSWORD_RULES.minLength} characters.`)
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
  .regex(/[0-9]/, "Password must contain at least one number.");

export const emailSchema = z
  .string()
  .min(1, "Please enter your email address.")
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.email("Please enter a valid email address."));

export const registerSchema = z
  .object({
    name: z.string().min(1, "Please enter your name.").max(255, "Name is too long.").trim(),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Please enter your password."),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required."),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Please enter your current password."),
    newPassword: passwordSchema,
    confirmNewPassword: z.string().min(1, "Please confirm your new password."),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, {
    message: "Passwords do not match.",
    path: ["confirmNewPassword"],
  });

// ─── Profile Settings (Stage 3) ────────────────────────────────────────────

// Reasonable E.164-ish check, NOT full SMS/telecom verification (explicitly
// out of scope — see read.md Stage 3): optional leading "+", 7-15 digits
// total (ITU E.164's own real bounds), digits only after the optional "+".
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/, "Please enter a valid phone number (7-15 digits, optional + prefix).")
  .optional()
  .or(z.literal(""));

export const updateProfileSchema = z.object({
  name: z.string().min(1, "Please enter your name.").max(255, "Name is too long.").trim(),
  phone: phoneSchema,
  addressLine1: z.string().max(255).trim().optional().or(z.literal("")),
  addressLine2: z.string().max(255).trim().optional().or(z.literal("")),
  city: z.string().max(120).trim().optional().or(z.literal("")),
  state: z.string().max(120).trim().optional().or(z.literal("")),
  postalCode: z.string().max(32).trim().optional().or(z.literal("")),
  addressCountry: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Country must be a 2-letter code (e.g. US).")
    .optional()
    .or(z.literal("")),
});

export const requestEmailChangeSchema = z.object({
  newEmail: emailSchema,
});

export const confirmEmailChangeSchema = z.object({
  otp: z
    .string()
    .length(6, "Verification code must be 6 digits.")
    .regex(/^\d{6}$/, "Verification code must be 6 digits."),
});

export const verifyEmailSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),
  otp: z
    .string()
    .length(6, "Verification code must be 6 digits.")
    .regex(/^\d{6}$/, "Verification code must be 6 digits."),
});

// ─── Password requirement helpers (for live UI feedback) ─────────────────────

export interface PasswordRequirement {
  id: string;
  label: string;
  met: boolean;
}

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      id: "length",
      label: `At least ${PASSWORD_RULES.minLength} characters`,
      met: password.length >= PASSWORD_RULES.minLength,
    },
    {
      id: "uppercase",
      label: "One uppercase letter",
      met: /[A-Z]/.test(password),
    },
    {
      id: "lowercase",
      label: "One lowercase letter",
      met: /[a-z]/.test(password),
    },
    {
      id: "number",
      label: "One number",
      met: /[0-9]/.test(password),
    },
  ];
}

export function isPasswordValid(password: string): boolean {
  return getPasswordRequirements(password).every((r) => r.met);
}

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
// Stage 5 — self-service account deletion. Reuses the exact same
// "re-enter your current password" shape `changePasswordSchema` already
// uses for its `currentPassword` field; deletion needs nothing else from
// the client (no new-password, no confirmation text field — the in-app
// modal itself is the confirmation UI).
export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Please enter your current password."),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type RequestEmailChangeInput = z.infer<typeof requestEmailChangeSchema>;
export type ConfirmEmailChangeInput = z.infer<typeof confirmEmailChangeSchema>;
