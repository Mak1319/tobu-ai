import "server-only"
import { connectToDatabase, EmailToken } from "@/lib/db/models"
import { hashToken, randomToken } from "./password"
import { Types } from "mongoose"

const TTL_MIN = 60

export async function issueEmailToken(userId: Types.ObjectId, purpose: "verify-email" | "reset-password") {
  await connectToDatabase()
  const raw = randomToken(32)
  await EmailToken.create({
    userId,
    purpose,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + TTL_MIN * 60 * 1000),
  })
  return raw
}

export async function consumeEmailToken(raw: string, purpose: "verify-email" | "reset-password") {
  await connectToDatabase()
  const row = await EmailToken.findOneAndUpdate(
    { tokenHash: hashToken(raw), purpose, usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true },
  )
  return row
}
