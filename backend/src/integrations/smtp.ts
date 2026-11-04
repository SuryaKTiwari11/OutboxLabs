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
import { lookup } from "dns/promises";
import net from "net";
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

export interface SmtpErrorDetails {
  message: string;
  name?: string;
  code?: string;
  responseCode?: number;
  command?: string;
  response?: string;
  stack?: string;
}

export function getSmtpErrorDetails(error: unknown): SmtpErrorDetails {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const smtpError = error as Error & {
    code?: string;
    responseCode?: number;
    command?: string;
    response?: string;
  };

  return {
    message: error.message,
    name: error.name,
    code: smtpError.code,
    responseCode: smtpError.responseCode,
    command: smtpError.command,
    response: smtpError.response,
    stack: error.stack,
  };
}

export function formatSmtpError(error: unknown): string {
  const details = getSmtpErrorDetails(error);
  const metadata = [
    details.code && `code=${details.code}`,
    details.responseCode && `responseCode=${details.responseCode}`,
    details.command && `command=${details.command}`,
    details.response && `response=${details.response}`,
  ].filter(Boolean);

  return metadata.length > 0
    ? `${details.message} (${metadata.join(", ")})`
    : details.message;
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

function maskSmtpUser(user: string): string {
  const at = user.indexOf("@");
  if (at <= 1) return "***";
  return `${user[0]}***${user.slice(at)}`;
}

// ── Default Ethereal credentials (auto-created if empty) ──────
let _defaultTransporter: Transporter | null = null;

export interface SmtpSendResult {
  messageId: string;
  previewUrl: string | null;
}

export interface SmtpConnectionDetails {
  host: string;
  port: number;
  secure: boolean;
  user: string;
}

function logConnectionDetails(details: SmtpConnectionDetails): void {
  logger.info("[SMTP] Transport configuration", {
    host: details.host,
    port: details.port,
    secure: details.secure,
    connectionTimeoutMs: env.SMTP_TIMEOUT_MS,
    greetingTimeoutMs: env.SMTP_TIMEOUT_MS,
    socketTimeoutMs: env.SMTP_TIMEOUT_MS,
    user: maskSmtpUser(details.user),
  });
}

async function checkTcpConnectivity(host: string, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      const error = new Error(`TCP connection timeout to ${host}:${port}`);
      Object.assign(error, { code: "ETIMEDOUT", host, port });
      reject(error);
    }, env.SMTP_TIMEOUT_MS);

    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.end();
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

export async function verifySmtpTransport(
  transporter: Transporter,
  details: SmtpConnectionDetails
): Promise<void> {
  logConnectionDetails(details);

  try {
    const addresses = await lookup(details.host, { all: true });
    logger.info("[SMTP] DNS lookup succeeded", {
      host: details.host,
      addresses: addresses.map((address) => address.address),
    });
  } catch (error) {
    logger.error("[SMTP] DNS lookup failed", {
      host: details.host,
      error: getSmtpErrorDetails(error),
    });
    throw error;
  }

  try {
    await checkTcpConnectivity(details.host, details.port);
    logger.info("[SMTP] TCP connection succeeded", {
      host: details.host,
      port: details.port,
    });
  } catch (error) {
    logger.error("[SMTP] TCP connection failed", {
      host: details.host,
      port: details.port,
      error: getSmtpErrorDetails(error),
    });
    throw error;
  }

  try {
    await transporter.verify();
    logger.info("[SMTP] Transport verification succeeded", {
      host: details.host,
      port: details.port,
      secure: details.secure,
      user: maskSmtpUser(details.user),
    });
  } catch (error) {
    logger.error("[SMTP] Transport verification failed", {
      host: details.host,
      port: details.port,
      secure: details.secure,
      user: maskSmtpUser(details.user),
      error: getSmtpErrorDetails(error),
    });
    throw error;
  }
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
      env.ETHEREAL_PORT === 465,
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
    logger.info("[SMTP] Ethereal test account created", {
      user: maskSmtpUser(testAccount.user),
      host: "smtp.ethereal.email",
      port: 587,
    });
  }

  return _defaultTransporter;
}

export function getDefaultSmtpConnectionDetails(): SmtpConnectionDetails {
  return {
    host: env.ETHEREAL_HOST,
    port: env.ETHEREAL_PORT,
    secure: env.ETHEREAL_PORT === 465,
    user: env.ETHEREAL_USER ?? "auto-created-account",
  };
}

/**
 * Create a transporter for a specific sender account from the DB.
 * SMTP password is stored encrypted — decrypted here at runtime.
 */
export function createTransporterForSender(sender: SenderAccountLike): Transporter {
  let smtpPass: string;
  try {
    smtpPass = decrypt(sender.smtpPassEncrypted);
    logger.info("[SMTP] Sender password decrypted successfully", {
      host: sender.smtpHost,
      port: sender.smtpPort,
      secure: sender.smtpSecure,
      user: maskSmtpUser(sender.smtpUser),
    });
  } catch (error) {
    logger.error("[SMTP] Sender password decryption failed before transporter creation", {
      host: sender.smtpHost,
      port: sender.smtpPort,
      secure: sender.smtpSecure,
      user: maskSmtpUser(sender.smtpUser),
      error: getSmtpErrorDetails(error),
    });
    throw error;
  }

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

export function getSenderSmtpConnectionDetails(sender: SenderAccountLike): SmtpConnectionDetails {
  return {
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpSecure,
    user: sender.smtpUser,
  };
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
    messageId?: string;
  }
): Promise<SmtpSendResult> {
  const info = await transporter.sendMail({
    from: options.from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    messageId: options.messageId,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info) || null;

  logger.info(`[SMTP] Email sent`, {
    messageId: info.messageId,
    to: options.to,
    response: info.response,
    accepted: info.accepted,
    rejected: info.rejected,
    previewUrl,
  });

  return {
    messageId: info.messageId,
    previewUrl: typeof previewUrl === "string" ? previewUrl : null,
  };
}
