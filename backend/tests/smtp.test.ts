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
} from "../src/integrations/smtp";

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
});
