import "server-only"
import { Schema, model, models } from "mongoose"

/**
 * Single-use tokens for verify-email and forgot-password flows.
 * `purpose` discriminates the kind of token. TTL is enforced by Mongo.
 */
export interface IEmailToken {
  _id: Schema.Types.ObjectId
  userId: Schema.Types.ObjectId
  purpose: "verify-email" | "reset-password"
  tokenHash: string // sha-256 of the raw token
  expiresAt: Date
  usedAt?: Date
  createdAt: Date
}

const emailTokenSchema = new Schema<IEmailToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, enum: ["verify-email", "reset-password"], required: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

emailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const EmailToken =
  models.EmailToken || model<IEmailToken>("EmailToken", emailTokenSchema)
