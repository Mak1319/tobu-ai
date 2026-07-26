import "server-only"
import { Types } from "mongoose"
import { connectToDatabase, Session } from "@/lib/db/models"
import { hashToken, randomToken } from "./password"

const SESSION_TTL_DAYS = 7

export async function createDbSession(opts: {
  userId: Types.ObjectId
  userAgent?: string
  ip?: string
}): Promise<{ token: string; expiresAt: Date }> {
  await connectToDatabase()
  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  await Session.create({
    userId: opts.userId,
    token: hashToken(token),
    userAgent: opts.userAgent,
    ip: opts.ip,
    expiresAt,
  })
  return { token, expiresAt }
}

export async function revokeDbSession(token: string) {
  await connectToDatabase()
  await Session.deleteOne({ token: hashToken(token) })
}

export async function findValidSession(token: string) {
  await connectToDatabase()
  const row = await Session.findOne({ token: hashToken(token), expiresAt: { $gt: new Date() } })
  return row
}
