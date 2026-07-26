import "server-only"
import { Schema, model, models, Types } from "mongoose"

/**
 * Tobu AI user document.
 *
 * `email` is the primary identifier (required, unique, lowercased, indexed).
 * `verified` flips to true after the user clicks the verification email link.
 * `sessions[]` and `preferences[]` are refs into the Session / Preferences
 * collections — we keep them as ObjectId[] to avoid pulling full sub-docs.
 *
 * `twoFactor` holds TOTP data for the QR-code authenticator flow.
 *
 * `accounts[]` is a ref to linked providers (email + future Google/Apple).
 */
export interface IUser {
  _id: Types.ObjectId
  name: string
  email: string
  emailNormalized: string // lowercased, used for the unique index
  verified: boolean
  image?: string
  twoFactor?: {
    secret: string // base32, encrypted at rest is a future concern
    enabled: boolean
    verifiedAt?: Date
    recoveryCodes: string[] // hashed (sha-256)
  }
  sessions: Types.ObjectId[]
  preferences: Types.ObjectId[]
  accounts: Types.ObjectId[]
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true },
    emailNormalized: { type: String, required: true, lowercase: true, unique: true, index: true },
    verified: { type: Boolean, default: false, index: true },
    image: { type: String },
    twoFactor: {
      secret: { type: String },
      enabled: { type: Boolean, default: false },
      verifiedAt: { type: Date },
      recoveryCodes: { type: [String], default: [] },
    },
    sessions: [{ type: Schema.Types.ObjectId, ref: "Session" }],
    preferences: [{ type: Schema.Types.ObjectId, ref: "Preferences" }],
    accounts: [{ type: Schema.Types.ObjectId, ref: "Account" }],
  },
  { timestamps: true },
)

userSchema.index({ emailNormalized: 1 })

export const User = models.User || model<IUser>("User", userSchema)
