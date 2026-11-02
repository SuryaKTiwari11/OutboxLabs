// ─────────────────────────────────────────────────────────────
//  tests/crypto.test.ts
//  Unit tests for AES-256-GCM encryption helpers.
// ─────────────────────────────────────────────────────────────

// Mock ALL required env vars BEFORE any module import
process.env["DATABASE_URL"]       = "postgresql://test:test@localhost:5432/test";
process.env["GOOGLE_CLIENT_ID"]   = "test-google-id";
process.env["GOOGLE_CLIENT_SECRET"] = "test-google-secret";
process.env["GOOGLE_CALLBACK_URL"]= "http://localhost:4000/api/auth/google/callback";
process.env["SLACK_CLIENT_ID"]    = "test-slack-id";
process.env["SLACK_CLIENT_SECRET"]= "test-slack-secret";
process.env["SLACK_REDIRECT_URI"] = "http://localhost:4000/api/slack/callback";
process.env["JWT_SECRET"]         = "test-jwt-secret-minimum-length-32-chars-long!!";
process.env["ENCRYPTION_KEY"]     = "a".repeat(64); // 32 bytes = 64 hex chars

import { encrypt, decrypt } from "../src/utils/crypto";

describe("AES-256-GCM Crypto", () => {
  it("encrypts and decrypts successfully", () => {
    const original = "super-secret-slack-token";
    const ciphertext = encrypt(original);
    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe(original);
  });

  it("produces different ciphertext for same plaintext (random IV)", () => {
    const text = "same-text";
    const c1 = encrypt(text);
    const c2 = encrypt(text);
    expect(c1).not.toBe(c2); // IVs differ
    // But both decrypt to same value
    expect(decrypt(c1)).toBe(text);
    expect(decrypt(c2)).toBe(text);
  });

  it("throws on tampered ciphertext", () => {
    const ciphertext = encrypt("original");
    const parts = ciphertext.split(":");
    // Corrupt the data part
    parts[2] = Buffer.from("tampered").toString("base64");
    const tampered = parts.join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on invalid format", () => {
    expect(() => decrypt("not-a-valid-ciphertext")).toThrow("Invalid ciphertext format");
  });
});

