import "server-only"
import bcrypt from "bcryptjs"
import { createHash, randomBytes } from "node:crypto"

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url")
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}
