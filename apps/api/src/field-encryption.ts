import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

// Derives a stable 32-byte AES key from an arbitrary-length secret. `purpose` domain-separates
// this from other derivations of the same underlying secret (e.g. HMAC identity fingerprinting)
// so the same env var can't be replayed across unrelated cryptographic uses.
function deriveKey(secret: string, purpose: string): Buffer {
  return createHash("sha256").update(`${purpose}:${secret}`).digest();
}

/**
 * Encrypts a personal-data field (name, phone, etc.) for storage in a `bytea` column.
 * Only use this for data the person themselves chose to submit for a specific, disclosed
 * purpose (e.g. "so Operations can contact me about a work assignment") — never for
 * third-party data imported without the subject's knowledge.
 */
export function encryptField(secret: string, plaintext: string): Buffer {
  const key = deriveKey(secret, "field-encryption");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

export function decryptField(secret: string, payload: Buffer): string {
  const key = deriveKey(secret, "field-encryption");
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/**
 * "María González" -> "María G***" — enough to recognize a real person is behind the entry
 * without exposing a full identity in a public listing. Contact details are never masked for
 * partial display; they're either fully decrypted (authenticated Operations) or not shown at all.
 */
export function maskDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const [first, ...rest] = parts;
  const maskedRest = rest.map((part) => {
    const initial = part[0]?.toUpperCase() ?? "";
    return `${initial}${"*".repeat(Math.max(2, part.length - 1))}`;
  });
  return [first, ...maskedRest].join(" ");
}
