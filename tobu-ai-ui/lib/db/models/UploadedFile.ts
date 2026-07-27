import "server-only"
import { Schema, model, models, Types } from "mongoose"

/**
 * Metadata for a file uploaded into MinIO via /api/upload.
 *
 * The bytes live in MinIO under `bucket` / `key`. This collection is the
 * queryable source of truth for "what files belong to which chat" and "who
 * uploaded what, when".
 *
 * `userId` is optional today because the (dashboard) route group is not yet
 * auth-gated; once auth lands in the upload route we just populate it.
 *
 * The processing fields (processingStatus / processedAt / processedKey /
 * contentHash / processingError) are written by the imbbox2 document worker
 * after it picks the upload up from MinIO events and runs Docling.
 */
export type ProcessingStatus = "pending" | "processing" | "ready" | "failed"

export interface IUploadedFile {
  _id: Types.ObjectId
  chatId: string
  userId?: Types.ObjectId
  bucket: string
  key: string
  filename: string
  contentType: string
  size: number
  uploadedAt: Date
  // Populated by the worker.
  processingStatus: ProcessingStatus
  processedAt?: Date
  processedKey?: string // MinIO key of the .md in processed-documents
  contentHash?: string // sha256 of bytes, hex
  processingError?: string
  // Set by the worker for vector PDFs where the per-character fill-vs-bitmap
  // safeguard detected text that is visually indistinguishable from its
  // background (a common SEO / prompt-injection trick).
  flagged?: boolean
  createdAt: Date
  updatedAt: Date
}

const uploadedFileSchema = new Schema<IUploadedFile>(
  {
    chatId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    bucket: { type: String, required: true },
    // The MinIO object key is globally unique, so the index doubles as an
    // idempotency guard against accidental double-writes.
    key: { type: String, required: true, unique: true, index: true },
    filename: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, required: true, default: () => new Date() },
    processingStatus: {
      type: String,
      enum: ["pending", "processing", "ready", "failed"],
      required: true,
      default: "pending",
      index: true,
    },
    processedAt: { type: Date },
    processedKey: { type: String },
    contentHash: { type: String, index: true },
    processingError: { type: String },
    flagged: { type: Boolean, default: false },
  },
  { timestamps: true },
)

// "List uploads for this chat, newest first".
uploadedFileSchema.index({ chatId: 1, uploadedAt: -1 })

// "Reclaim rows stuck in `processing` after a worker crash" +
// "what's still waiting to be processed".
uploadedFileSchema.index({ processingStatus: 1, uploadedAt: 1 })

export const UploadedFile =
  models.UploadedFile || model<IUploadedFile>("UploadedFile", uploadedFileSchema)