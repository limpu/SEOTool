import { z } from "zod";
import { createEmailTransport, getEmailFromAddress } from "@/lib/email";
import { emailSchema } from "@/lib/validation/auth";
import { sanitizeForDisplay } from "../redact";

/**
 * Web Installer — Stage 2. The SMTP test.
 *
 * ─── WHY THIS ENDPOINT IS TOKEN-GATED, WITHOUT EXCEPTION ────────────────
 * "Send an email to an address the caller supplies" is, unauthenticated, an
 * open mail relay: anyone on the internet could make this server send mail to
 * arbitrary recipients, from the deployment's own verified domain. That gets
 * the domain blacklisted and turns the installation into a spam appliance.
 * It goes through the same `guardInstallerRequest` as everything else, and it
 * is a MUTATION capability — it has a real external side effect, so it is
 * refused when the installer is locked and refused (503) when the
 * installation state is unknown.
 *
 * ─── WHY IT SENDS FOR REAL ──────────────────────────────────────────────
 * `sendVerificationEmail` / `sendPasswordResetEmail` deliberately only reach
 * the network in production or when `EMAIL_USER` is set; in development they
 * log to the console. That is right for those callers and wrong here — a test
 * that logs and reports "SMTP works" would be exactly the fabricated result
 * this project's rules forbid. So this uses the application's own transport
 * (same host, port, TLS mode, credentials, From address) and actually sends.
 *
 * ─── WHY THE FAILURE TEXT IS TRANSLATED ─────────────────────────────────
 * `nodemailer` failures arrive as things like `ECONNREFUSED`, `EAUTH`,
 * `ESOCKET ... wrong version number`. A non-technical operator cannot act on
 * any of those. Each is mapped to a plain cause and a concrete fix. The
 * original message is sanitized and kept as supporting detail, because the
 * server sometimes says something genuinely specific ("5.7.8 Username and
 * Password not accepted") that is the whole diagnosis.
 *
 * Credentials NEVER appear: `EMAIL_PASS` is in `SECRET_ENV_VARS` so
 * `sanitizeForDisplay` removes it verbatim, and nothing here reads or echoes
 * `EMAIL_USER` beyond reporting whether authentication is configured at all.
 */

export const smtpTestSchema = z.object({
  recipient: emailSchema,
});

export interface SmtpTestOutcome {
  ok: boolean;
  /** Machine-stable cause, for the UI to key remediation off. */
  cause:
    | "sent"
    | "not_configured"
    | "host_unreachable"
    | "connection_refused"
    | "timeout"
    | "auth_failed"
    | "tls_mismatch"
    | "rejected_recipient"
    | "unknown";
  message: string;
  howToFix: string[];
  /** Sanitized server response, when there was one worth showing. */
  detail?: string;
  /** Non-secret description of what was used. Host and port only. */
  usedConfiguration: {
    host: string;
    port: number;
    secure: boolean;
    authenticationConfigured: boolean;
    from: string;
  };
}

/**
 * Map a transport error to a plain cause. Pure, so every branch is testable
 * without a mail server. `raw` must ALREADY be sanitized by the caller — this
 * function never sees a live credential and never adds one.
 */
export function classifySmtpFailure(
  code: string | undefined,
  raw: string
): { cause: SmtpTestOutcome["cause"]; message: string; howToFix: string[] } {
  const text = `${code ?? ""} ${raw}`.toLowerCase();

  if (text.includes("econnrefused")) {
    return {
      cause: "connection_refused",
      message:
        "The mail server refused the connection. Something answered at that address, but nothing is listening on that port.",
      howToFix: [
        "Check EMAIL_PORT. The usual values are 587 (STARTTLS), 465 (implicit TLS) and 25 (unencrypted, usually blocked).",
        "Confirm EMAIL_HOST is the SMTP host your provider documents, not the website address.",
        "If the mail server is on this machine, confirm it is running.",
      ],
    };
  }
  if (text.includes("enotfound") || text.includes("eai_again") || text.includes("getaddrinfo")) {
    return {
      cause: "host_unreachable",
      message:
        "The mail server's hostname could not be resolved, so no connection was even attempted.",
      howToFix: [
        "Check EMAIL_HOST for a typo.",
        "Confirm this server can resolve external hostnames (DNS may be restricted on a locked-down network).",
      ],
    };
  }
  if (text.includes("etimedout") || text.includes("timeout") || text.includes("econnreset")) {
    return {
      cause: "timeout",
      message:
        "The connection to the mail server timed out. The address resolved, but nothing completed the handshake in time.",
      howToFix: [
        "A firewall is the usual cause — many hosting providers block outbound port 25, and some block 587 as well.",
        "Try the provider's alternative port (587 and 465 are the common pair).",
        "Confirm outbound SMTP is permitted from this server's network.",
      ],
    };
  }
  if (text.includes("eauth") || text.includes("535") || text.includes("534") || text.includes("authentication")) {
    return {
      cause: "auth_failed",
      message:
        "The mail server rejected the username and password. The connection itself worked, so the host and port are correct.",
      howToFix: [
        "Re-enter EMAIL_USER and EMAIL_PASS. For Gmail and Microsoft 365, an ordinary account password will not work — you need an app password or an OAuth-based relay.",
        "If your provider requires it, confirm the account is allowed to send through SMTP at all.",
        "The password itself is never shown by this installer, so retype it rather than trying to read it back.",
      ],
    };
  }
  if (
    text.includes("wrong version number") ||
    text.includes("esocket") ||
    text.includes("ssl") ||
    text.includes("tls")
  ) {
    return {
      cause: "tls_mismatch",
      message:
        "The TLS settings do not match what the mail server expects. This is almost always EMAIL_SECURE being set the wrong way round for the port in use.",
      howToFix: [
        "Port 465 expects EMAIL_SECURE=true (TLS from the first byte).",
        "Port 587 expects EMAIL_SECURE=false (the connection starts in plain text and upgrades with STARTTLS).",
        "Change EMAIL_SECURE to match your port and try again.",
      ],
    };
  }
  if (text.includes("550") || text.includes("recipient") || text.includes("relay")) {
    return {
      cause: "rejected_recipient",
      message:
        "The mail server accepted the connection but refused the message — usually because the From address is not one it is willing to send as, or it will not relay to that recipient.",
      howToFix: [
        "Set EMAIL_FROM to an address on a domain this mail server is authorised to send for.",
        "If you are using a relay, confirm this server's address is on its allowed-senders list.",
      ],
    };
  }
  return {
    cause: "unknown",
    message: "The test email could not be sent. The mail server's own response is shown below.",
    howToFix: [
      "Check EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE, EMAIL_USER and EMAIL_PASS against your provider's documentation.",
      "Email is optional: without it the platform still runs, but verification codes and password-reset links are written to the server log instead of being delivered.",
    ],
  };
}

function currentSmtpConfiguration() {
  return {
    host: (process.env.EMAIL_HOST ?? "").trim(),
    port: Number.parseInt(process.env.EMAIL_PORT ?? "587", 10),
    secure: process.env.EMAIL_SECURE === "true",
    authenticationConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
    from: getEmailFromAddress(),
  };
}

/** Send a real test email through the application's own transport. */
export async function sendSmtpTest(recipient: string): Promise<SmtpTestOutcome> {
  const usedConfiguration = currentSmtpConfiguration();

  if (!usedConfiguration.host) {
    return {
      ok: false,
      cause: "not_configured",
      message:
        "EMAIL_HOST is not set, so there is no mail server to test. Email delivery is optional — the platform runs without it, but verification codes and password-reset links go to the server log instead of the user's inbox.",
      howToFix: [
        "Set EMAIL_HOST, EMAIL_PORT and EMAIL_SECURE (plus EMAIL_USER and EMAIL_PASS if your provider requires authentication), restart the application, and test again.",
        "Or continue without email and configure it later — nothing else in the installation depends on it.",
      ],
      usedConfiguration,
    };
  }

  const transporter = createEmailTransport();
  const sentAt = new Date().toISOString();

  try {
    await transporter.sendMail({
      from: usedConfiguration.from,
      to: recipient,
      subject: "AI SEO Platform — installer test email",
      text: [
        "This is a test message sent by the AI SEO Platform web installer.",
        "",
        "If you are reading it, outgoing email is working: verification codes and",
        "password-reset links will reach your users.",
        "",
        `Sent at ${sentAt}.`,
        "",
        "No action is needed. You can delete this message.",
      ].join("\n"),
    });

    return {
      ok: true,
      cause: "sent",
      message: `A test message was handed to ${usedConfiguration.host} for delivery. Check the recipient's inbox — and its spam folder, since a brand-new sending domain frequently lands there first.`,
      howToFix: [],
      detail:
        "The mail server accepted the message. That proves the connection, the TLS mode and the credentials are correct; it does not prove the message will be delivered, which depends on the recipient's own filtering.",
      usedConfiguration,
    };
  } catch (err) {
    const code = (err as { code?: string; responseCode?: number })?.code;
    const raw = sanitizeForDisplay(err instanceof Error ? err.message : String(err));
    const classified = classifySmtpFailure(code, raw);
    return {
      ok: false,
      cause: classified.cause,
      message: classified.message,
      howToFix: classified.howToFix,
      detail: raw || undefined,
      usedConfiguration,
    };
  } finally {
    // nodemailer keeps a pooled connection open otherwise.
    try {
      (transporter as { close?: () => void }).close?.();
    } catch {
      /* closing a transport must never turn a successful send into an error */
    }
  }
}
