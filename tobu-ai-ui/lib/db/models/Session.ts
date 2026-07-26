import "server-only"
import { Schema, model, models, Types } from "mongoose"

export interface ISession {
  _id: Types.ObjectId
  userId: Types.ObjectId
  token: string // hashed session token (random 32 bytes, sha-256)
  userAgent?: string
  ip?: string
  expiresAt: Date
  createdAt: Date
}

const sessionSchema = new Schema<ISession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    userAgent: { type: String },
    ip: { type: String },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const Session = models.Session || model<ISession>("Session", sessionSchema)
