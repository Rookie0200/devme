import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Provider Key encryption.
 *
 * AES-256-GCM under a master key held in the environment and never in the
 * database, so that a database compromise on its own does not hand an attacker
 * a customer's model billing account. Ciphertext, initialisation vector, and
 * authentication tag are stored in separate columns.
 *
 * The plaintext is never logged and never returned to a client — only `hint`,
 * the last four characters, ever reaches the dashboard.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length.
const KEY_BYTES = 32;

export interface EncryptedKey {
  ciphertext: string;
  iv: string;
  authTag: string;
  hint: string;
}

function masterKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_MASTER_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}. Generate one with: openssl rand -base64 32`,
    );
  }
  return key;
}

export function encryptProviderKey(
  plaintext: string,
  masterKeyBase64: string,
): EncryptedKey {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey(masterKeyBase64), iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    hint: plaintext.slice(-4),
  };
}

/**
 * @throws if the ciphertext or the master key has been tampered with — GCM
 * authenticates, so a wrong key fails loudly rather than returning garbage.
 */
export function decryptProviderKey(
  encrypted: Pick<EncryptedKey, "ciphertext" | "iv" | "authTag">,
  masterKeyBase64: string,
): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    masterKey(masterKeyBase64),
    Buffer.from(encrypted.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
