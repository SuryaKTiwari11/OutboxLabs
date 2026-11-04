process.env["DATABASE_URL"] = "postgresql://localhost:5432/test";
process.env["GOOGLE_CLIENT_ID"] = "test";
process.env["GOOGLE_CLIENT_SECRET"] = "test";
process.env["GOOGLE_CALLBACK_URL"] = "http://localhost/callback";
process.env["JWT_SECRET"] = "test-secret-minimum-32-chars-long!!!!";
process.env["ENCRYPTION_KEY"] = "a".repeat(64);

import { Transporter } from "nodemailer";
import {
  formatSmtpError,
  sendEmail,
  verifySmtpTransport,
} from "../src/integrations/smtp";
import { logger } from "../src/utils/logger";
import net from "net";

jest.mock("../src/utils/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

describe("SMTP integration", () => {
  it("preserves provider diagnostics in the formatted error", () => {
    const error = Object.assign(new Error("Invalid login"), {
      code: "EAUTH",
      responseCode: 535,
      command: "AUTH PLAIN",
      response: "535 5.7.8 Authentication credentials invalid",
    });

    expect(formatSmtpError(error)).toBe(
      "Invalid login (code=EAUTH, responseCode=535, command=AUTH PLAIN, response=535 5.7.8 Authentication credentials invalid)"
    );
  });

  it("preserves a connection timeout classification", () => {
    const error = Object.assign(new Error("Connection timeout"), {
      code: "ETIMEDOUT",
      command: "CONN",
    });

    expect(formatSmtpError(error)).toBe(
      "Connection timeout (code=ETIMEDOUT, command=CONN)"
    );
  });

  it("logs transport diagnostics without exposing credentials", async () => {
    const server = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test port");
    const transporter = { verify: jest.fn().mockResolvedValue(true) } as unknown as Transporter;

    try {
      await verifySmtpTransport(transporter, {
        host: "127.0.0.1",
        port: address.port,
        secure: false,
        user: "private-user@example.com",
      });
      const logs = JSON.stringify((logger.info as jest.Mock).mock.calls);
      expect(logs).toContain("[SMTP] DNS lookup succeeded");
      expect(logs).toContain("[SMTP] TCP connection succeeded");
      expect(logs).toContain("[SMTP] Transport verification succeeded");
      expect(logs).not.toContain("private-user@example.com");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("passes the deterministic Message-ID to SMTP", async () => {
    const sendMail = jest.fn().mockResolvedValue({
      messageId: "<stable@reachinbox.local>",
      response: "250 Accepted",
      accepted: ["recipient@example.com"],
      rejected: [],
    });
    const transporter = { sendMail } as unknown as Transporter;

    await sendEmail(transporter, {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Test",
      html: "<p>Test</p>",
      messageId: "<stable@reachinbox.local>",
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "<stable@reachinbox.local>",
      })
    );
  });

  it("returns success only after SMTP reports acceptance", async () => {
    const sendMail = jest.fn().mockResolvedValue({
      messageId: "<accepted@reachinbox.local>",
      response: "250 Accepted",
      accepted: ["recipient@example.com"],
      rejected: [],
    });
    const transporter = { sendMail } as unknown as Transporter;
    const result = await sendEmail(transporter, {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });

    expect(result.messageId).toBe("<accepted@reachinbox.local>");
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
