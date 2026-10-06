import {
  randomBytes,
  scrypt as callbackScrypt,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(callbackScrypt);
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algorithm, salt, hex] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function createToken(): string {
  return randomBytes(32).toString("base64url");
}
export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
