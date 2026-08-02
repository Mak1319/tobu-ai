import "server-only"
import { connectToDatabase, mongoose } from "@/lib/db/connection"

const COLLECTION = process.env.HASH_COLLECTION ?? "hashContentMap"

export type TopicGraphSubject = {
  id?: string
  name?: string
  subtopics?: Array<{
    id?: string
    name?: string
    granular?: Array<{ id?: string; name?: string }>
  }>
}

export type TopicGraph = {
  subjects?: TopicGraphSubject[]
  nodes?: Array<{ id?: string; label?: string; kind?: string; subject?: string }>
  edges?: Array<{ from?: string; to?: string; weight?: number }>
  graph?: unknown
  status?: string
}

export type HashContentPayload = {
  markdownKey?: string
  conversionMethod?: string
  markdownChars?: number
  topicGraph?: TopicGraph | null
}

export type HashContentDoc = {
  hashId: string
  content: HashContentPayload
  createdAt?: Date
  updatedAt?: Date
}

export async function findHashContent(
  hashId: string,
): Promise<HashContentDoc | null> {
  await connectToDatabase()
  const db = mongoose.connection.db
  if (!db) return null

  const doc = await db.collection(COLLECTION).findOne({ hashId })
  if (!doc || typeof doc.hashId !== "string") return null

  const content =
    doc.content && typeof doc.content === "object"
      ? (doc.content as HashContentPayload)
      : {}

  return {
    hashId: doc.hashId,
    content,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt : undefined,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt : undefined,
  }
}
