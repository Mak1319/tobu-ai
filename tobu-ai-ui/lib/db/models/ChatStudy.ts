import "server-only"
import { Schema, model, models, Types } from "mongoose"

/**
 * Per-chat study session preferences (subject/topics/file hash).
 * Written when the wizard finishes topic selection, before LiveKit starts.
 */
export interface IChatStudy {
  _id: Types.ObjectId
  chatId: string
  userId?: Types.ObjectId
  fileHash?: string
  mdKey?: string
  selectedSubject?: string
  selectedTopics: string[]
  /** Wizard pipeline status for this chat. */
  status:
    | "uploaded"
    | "processing"
    | "processed"
    | "topics_selected"
    | "live"
    | "failed"
  processingError?: string
  createdAt: Date
  updatedAt: Date
}

const chatStudySchema = new Schema<IChatStudy>(
  {
    chatId: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    fileHash: { type: String, index: true },
    mdKey: { type: String },
    selectedSubject: { type: String },
    selectedTopics: { type: [String], default: [] },
    status: {
      type: String,
      enum: [
        "uploaded",
        "processing",
        "processed",
        "topics_selected",
        "live",
        "failed",
      ],
      default: "uploaded",
      index: true,
    },
    processingError: { type: String },
  },
  { timestamps: true },
)

export const ChatStudy =
  models.ChatStudy || model<IChatStudy>("ChatStudy", chatStudySchema)
