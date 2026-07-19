import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

function decodeKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

export function encryptSecret(
  plaintext: string,
  encodedKey: string,
  keyVersion = 1,
): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeKey(encodedKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion,
  };
}

export function decryptSecret(secret: EncryptedSecret, encodedKey: string): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    decodeKey(encodedKey),
    Buffer.from(secret.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function redactSecrets(value: unknown): unknown {
  const sensitive = /authorization|cookie|secret|password|token|api[-_]?key|credential/i;
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitive.test(key) ? "[REDACTED]" : redactSecrets(item),
      ]),
    );
  }
  return value;
}
