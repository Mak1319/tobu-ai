import "server-only"
import mongoose from "mongoose"

const MONGODB_URI = process.env.MONGODB_URI
const MONGODB_DB = process.env.MONGODB_DB ?? "tobu_ai"

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not set. Add it to .env.local.")
}

// Reuse a single connection across hot-reloads in dev.
type Cached = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
const globalForMongoose = globalThis as unknown as { _mongoose?: Cached }
const cached: Cached = globalForMongoose._mongoose ?? { conn: null, promise: null }
if (!globalForMongoose._mongoose) globalForMongoose._mongoose = cached

export async function connectToDatabase() {
  if (cached.conn) return cached.conn
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI as string, {
      dbName: MONGODB_DB,
      bufferCommands: false,
    })
  }
  cached.conn = await cached.promise
  return cached.conn
}

export { mongoose }
