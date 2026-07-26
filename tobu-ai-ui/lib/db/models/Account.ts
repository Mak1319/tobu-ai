import "server-only"
import { Schema, model, models, Types } from "mongoose"

/**
 * One document per linked provider (email, google, apple, github, ...).
 * For "email" provider, `passwordHash` is set.
 * For OAuth providers, `providerAccountId` holds the provider's user id.
 *
 * Empty by default for new users; populated when Google/Apple login is added.
 */
export interface IAccount {
  _id: Types.ObjectId
  userId: Types.ObjectId
  provider: "email" | "google" | "apple" | "github"
  providerAccountId?: string // provider-side user id (for OAuth)
  passwordHash?: string // for provider === "email"
  createdAt: Date
  updatedAt: Date
}

const accountSchema = new Schema<IAccount>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, enum: ["email", "google", "apple", "github"], required: true },
    providerAccountId: { type: String, index: true },
    passwordHash: { type: String },
  },
  { timestamps: true },
)

accountSchema.index({ userId: 1, provider: 1 }, { unique: true })
accountSchema.index({ provider: 1, providerAccountId: 1 }, { unique: true, sparse: true })

export const Account = models.Account || model<IAccount>("Account", accountSchema)
