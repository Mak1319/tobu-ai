import "server-only"
import { Schema, model, models } from "mongoose"

export interface IPreferences {
  _id: Schema.Types.ObjectId
  theme: "light" | "dark" | "system"
  language: string
  notifications: {
    email: boolean
    push: boolean
  }
  createdAt: Date
  updatedAt: Date
}

const preferencesSchema = new Schema<IPreferences>(
  {
    theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
    language: { type: String, default: "en" },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
)

export const Preferences = models.Preferences || model<IPreferences>("Preferences", preferencesSchema)
