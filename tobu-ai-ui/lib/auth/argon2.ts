import { argon2idAsync } from "@noble/hashes/argon2.js"
import { bytesToHex } from "@noble/hashes/utils.js"

/**
 * Client-side password hashing with Argon2id.
 *
 * Uses `@noble/hashes` (pure JS, audited) so the same code runs in the
 * browser bundle and on the server. The native `argon2` package can't
 * be imported from a client component because it pulls in `fs`/`path`
 * via `node-gyp-build`.
 *
 * The `salt` parameter makes the output deterministic (same password +
 * same salt ⇒ same hash), so the server can verify by string equality.
 * For signup and login, use the user's email as the salt. For password-
 * reset flows, use the single-use token as the salt.
 *
 * Cost parameters (RFC 9106 baseline): t=3, m=64 MiB, p=4, dkLen=32.
 * Returning hex keeps the wire format compact and JSON-safe.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const hash = await argon2idAsync(password, salt, {
    t: 3,
    m: 65536, // 64 MiB
    p: 4,
    dkLen: 32,
  })
  return bytesToHex(hash)
}
