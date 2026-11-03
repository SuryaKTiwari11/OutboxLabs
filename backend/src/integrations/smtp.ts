// ─────────────────────────────────────────────────────────────
//  integrations/smtp.ts
//  Nodemailer factory supporting multiple Ethereal sender accounts.
//
//  Pattern: Factory — creates a configured transporter per sender.
//
//  Ethereal Email: https://ethereal.email/
//  - Fake SMTP server for testing
//  - Emails are never actually delivered
//  - Preview URL is returned so you can see the email in browser
//
//  If ETHEREAL_USER/PASS are not set in .env, a new test account
//  is auto-created on first call (requires network on startup).
// ─────────────────────────────────────────────────────────────

import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { decrypt } from "../utils/crypto";

// Use a local type that mirrors the Prisma SenderAccount shape.
// Avoids circular imports and keeps this integration layer decoupled from Prisma.
interface SenderAccountLike {
  displayName: string;    // used in "From:" header display name
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassEncrypted: string;
  smtpSecure: boolean;
}

function smtpTransportOptions(
  host: string,
  port: number,
  secure: boolean,
  auth: { user: string; pass: string }
) {
  return {
    host,
    port,
    secure,
    auth,
    connectionTimeout: env.SMTP_TIMEOUT_MS,
    greetingTimeout: env.SMTP_TIMEOUT_MS,
    socketTimeout: env.SMTP_TIMEOUT_MS,
  };
}

// ── Default Ethereal credentials (auto-created if empty) ──────
let _defaultTransporter: Transporter | null = null;

export interface SmtpSendResult {
  messageId: string;
  previewUrl: string | null;
}

/**
 * Get (or create) the default Ethereal transporter.
 * Used when no custom sender is specified.
 */
export async function getDefaultTransporter(): Promise<Transporter> {
  if (_defaultTransporter) return _defaultTransporter;

  if (env.ETHEREAL_USER && env.ETHEREAL_PASS) {
    // Use credentials from .env
    _defaultTransporter = nodemailer.createTransport(smtpTransportOptions(
      env.ETHEREAL_HOST,
      env.ETHEREAL_PORT,
      false,
      {
        user: env.ETHEREAL_USER,
        pass: env.ETHEREAL_PASS,
      }
    ));
    logger.info("[SMTP] Using Ethereal credentials from env");
  } else {
    // Auto-create a test account (requires network)
    logger.info("[SMTP] No Ethereal credentials found — creating test account...");
    const testAccount = await nodemailer.createTestAccount();
    _defaultTransporter = nodemailer.createTransport(smtpTransportOptions(
      "smtp.ethereal.email",
      587,
      false,
      {
        user: testAccount.user,
        pass: testAccount.pass,
      }
    ));
    logger.info(`[SMTP] Ethereal test account created: ${testAccount.user}`);
    logger.info(`[SMTP] Add to .env: ETHEREAL_USER=${testAccount.user} ETHEREAL_PASS=${testAccount.pass}`);
  }

  return _defaultTransporter;
}

/**
 * Create a transporter for a specific sender account from the DB.
 * SMTP password is stored encrypted — decrypted here at runtime.
 */
export function createTransporterForSender(sender: SenderAccountLike): Transporter {
  const smtpPass = decrypt(sender.smtpPassEncrypted);

  return nodemailer.createTransport(smtpTransportOptions(
    sender.smtpHost,
    sender.smtpPort,
    sender.smtpSecure,
    {
      user: sender.smtpUser,
      pass: smtpPass,
    }
  ));
}

/**
 * Send an email and return messageId + Ethereal preview URL.
 * Never marks an email as sent unless SMTP confirms delivery.
 */
export async function sendEmail(
  transporter: Transporter,
  options: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }
): Promise<SmtpSendResult> {
  const info = await transporter.sendMail({
    from: options.from,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info) || null;

  logger.info(`[SMTP] Email sent`, {
    messageId: info.messageId,
    to: options.to,
    previewUrl,
  });

  return {
    messageId: info.messageId,
    previewUrl: typeof previewUrl === "string" ? previewUrl : null,
  };
}
