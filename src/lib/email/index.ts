import nodemailer from "nodemailer";
import { verificationEmailTemplate } from "./templates/verification";
import { resetPasswordEmailTemplate } from "./templates/reset";

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST ?? "smtp.ethereal.email",
    port: parseInt(process.env.EMAIL_PORT ?? "587", 10),
    secure: process.env.EMAIL_SECURE === "true",
    auth:
      process.env.EMAIL_USER && process.env.EMAIL_PASS
        ? { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        : undefined,
  });
}

const FROM = process.env.EMAIL_FROM ?? "AI SEO Platform <noreply@ai-seo-platform.local>";

// ─── In development, log emails instead of sending ───────────────────────────

function logEmailInDev(subject: string, to: string, text: string) {
  if (process.env.NODE_ENV !== "production") {
    console.log(`\n📧 [DEV EMAIL]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
  }
}

// ─── Send verification OTP email ─────────────────────────────────────────────

export async function sendVerificationEmail(opts: {
  to: string;
  name: string;
  otp: string;
}): Promise<void> {
  const { to, name, otp } = opts;
  const subject = "Verify your email — AI SEO Platform";
  const { html, text } = verificationEmailTemplate({ name, otp });

  logEmailInDev(subject, to, text);

  if (process.env.NODE_ENV === "production" || process.env.EMAIL_USER) {
    const transporter = createTransport();
    await transporter.sendMail({ from: FROM, to, subject, html, text });
  }
}

// ─── Send password reset email ────────────────────────────────────────────────

export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<void> {
  const { to, name, resetUrl } = opts;
  const subject = "Reset your password — AI SEO Platform";
  const { html, text } = resetPasswordEmailTemplate({ name, resetUrl });

  logEmailInDev(subject, to, text);

  if (process.env.NODE_ENV === "production" || process.env.EMAIL_USER) {
    const transporter = createTransport();
    await transporter.sendMail({ from: FROM, to, subject, html, text });
  }
}

// ─── Transport access for the web installer (Stage 2) ────────────────────────
//
// The installer must send a REAL test email through exactly the configuration
// the application itself uses — a test that builds its own transport proves
// nothing about whether password resets and verification OTPs will work.
// These two exports expose the existing configuration without changing any
// behaviour above: `createTransport()` and `FROM` are unchanged and every
// existing caller is untouched.
//
// Note the deliberate difference from the two senders above: those only reach
// the network in production or when EMAIL_USER is set (in development they
// log instead). The installer's test must always actually send — a test that
// silently logs and reports success would be a fabricated result.

export function createEmailTransport() {
  return createTransport();
}

/** The `From:` address the application sends as. Never a credential. */
export function getEmailFromAddress(): string {
  return FROM;
}
