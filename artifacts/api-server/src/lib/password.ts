import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Password hashing using Node's built-in scrypt (no external dependency).
// Stored format: "scrypt$<saltHex>$<hashHex>". The salt is unique per password.
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = scryptSync(plain, salt, KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

// Constant-time verification. Returns false for any malformed/absent hash so a
// not-yet-provisioned account (null hash) can never authenticate.
export function verifyPassword(plain: string, stored: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = parts[1];
  const hashHex = parts[2];
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const derived = scryptSync(plain, salt, KEY_LENGTH);
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}
