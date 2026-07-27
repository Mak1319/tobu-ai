"use server"

import { z } from "zod"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { generate, generateURI, verifySync } from "otplib"
import QRCode from "qrcode"
import { connectToDatabase, User, Account, Preferences, EmailToken, Session } from "@/lib/db/models"
import { getSession } from "./session"
import { createDbSession, revokeDbSession } from "./tokens"
import { sendMail } from "./mail"
import { issueEmailToken, consumeEmailToken } from "./email-helpers"
import { randomToken, hashToken } from "./password"


const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

// ---------- shared ----------
export type ActionResult = { ok: true } | { ok: false; error: string }

function err(msg: string): ActionResult {
  return { ok: false, error: msg }
}

async function getRequestMeta() {
  const h = await headers()
  return {
    userAgent: h.get("user-agent") ?? undefined,
    ip: h.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined,
  }
}

// otplib v13 doesn't have a top-level generateSecret — derive from generate()
function generateSecretCompat(): string {
  // @ts-expect-error - the function returns a base32 secret in `secret`
  const { secret } = generate({ strategy: "totp" })
  return secret as string
}

// ---------- signup ----------
const signupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(500),
})

export async function signupAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) return err("Please provide name, a valid email, and a password of 8+ characters.")

  const { name, email, password } = parsed.data
  const emailNormalized = email.toLowerCase()

  await connectToDatabase()
  const exists = await User.findOne({ emailNormalized }).lean()
  if (exists) return err("An account with that email already exists.")

  // password is already an argon2 hash produced client-side
  const prefs = await Preferences.create({})
  const user = await User.create({
    name,
    email,
    emailNormalized,
    verified: false,
    preferences: [prefs._id],
    accounts: [],
  })
  await Account.create({ userId: user._id, provider: "email", passwordHash: password })

  // issue verification email
  const raw = await issueEmailToken(user._id, "verify-email")
  const link = `${APP_URL}/auth/verify-email?token=${raw}`
  await sendMail({
    to: email,
    subject: "Verify your Tobu AI email",
    html: `<p>Hi ${name},</p><p>Click to verify your email: <a href="${link}">${link}</a></p>`,
    text: `Verify your email: ${link}`,
  })

  const session = await getSession()
  session.flash = { kind: "verify-email", userId: user._id.toString() }
  await session.save()

  return { ok: true }
}

// ---------- login ----------
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(500),
})

export async function loginAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) return err("Please enter a valid email and password.")

  await connectToDatabase()
  const user = await User.findOne({ emailNormalized: parsed.data.email.toLowerCase() })
  if (!user) return err("Invalid email or password.")

  const account = await Account.findOne({ userId: user._id, provider: "email" })
  if (!account?.passwordHash) return err("This account uses a different sign-in method.")

  if (parsed.data.password !== account.passwordHash) return err("Invalid email or password.")

  if (user.twoFactor?.enabled) {
    const session = await getSession()
    session.pending2faUserId = user._id.toString()
    await session.save()
    redirect("/auth/2fa")
  }

  const meta = await getRequestMeta()
  const { token, expiresAt } = await createDbSession({ userId: user._id, ...meta })
  await User.updateOne(
    { _id: user._id },
    { $push: { sessions: { $each: [], $position: 0 } } },
  )
  // keep the User.sessions[] list in sync (object ids of Session docs)
  // we don't have the doc _id back from createDbSession; fetch the latest one
  const { Session } = await import("@/lib/db/models")
  const latest = await Session.findOne({ userId: user._id, token: hashToken(token) }).lean()
  if (latest) {
    await User.updateOne({ _id: user._id }, { $addToSet: { sessions: latest._id } })
  }

  const session = await getSession()
  session.userId = user._id.toString()
  session.email = user.email
  session.pending2faUserId = undefined
  await session.save()

  redirect("/chat")
}

// ---------- logout ----------
export async function logoutAction() {
  const session = await getSession()
  if (session.userId) {
    // note: we don't have the raw token in the session — the session cookie is the auth proof
    // revocation is best-effort via DB cascade; for now we just clear the cookie
  }
  session.destroy()
  redirect("/auth/login")
}

// ---------- forgot password ----------
const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email() })

export async function forgotPasswordAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = forgotSchema.safeParse({ email: formData.get("email") })
  if (!parsed.success) return err("Please enter a valid email.")

  await connectToDatabase()
  const user = await User.findOne({ emailNormalized: parsed.data.email.toLowerCase() })
  // Always return ok — don't reveal whether the email exists
  if (user) {
    const raw = await issueEmailToken(user._id, "reset-password")
    const link = `${APP_URL}/auth/reset-password?token=${raw}`
    await sendMail({
      to: user.email,
      subject: "Reset your Tobu AI password",
      html: `<p>Click to reset your password (valid for ${60} min): <a href="${link}">${link}</a></p>`,
      text: `Reset your password: ${link}`,
    })
  }
  return { ok: true }
}

// ---------- reset password ----------
const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(500),
})

export async function resetPasswordAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  })
  if (!parsed.success) return err("Invalid token or password.")

  const row = await consumeEmailToken(parsed.data.token, "reset-password")
  if (!row) return err("This reset link is invalid or has expired.")

  await connectToDatabase()
  // password is already an argon2 hash produced client-side
  await Account.updateOne(
    { userId: row.userId, provider: "email" },
    { $set: { passwordHash: parsed.data.password } },
  )
  // Invalidate all sessions for safety
  await User.updateOne({ _id: row.userId }, { $set: { sessions: [] } })
  return { ok: true }
}

// ---------- verify email ----------
export async function verifyEmailAction(token: string): Promise<ActionResult> {
  const row = await consumeEmailToken(token, "verify-email")
  if (!row) return err("This verification link is invalid or has expired.")
  await connectToDatabase()
  await User.updateOne({ _id: row.userId }, { $set: { verified: true } })
  return { ok: true }
}

// ---------- 2FA ----------
function genRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => randomToken(8))
}

export type TwoFactorSetup = { ok: true; otpauthUrl: string; qrDataUrl: string } | { ok: false; error: string }

export async function startTwoFactorSetupAction(): Promise<TwoFactorSetup> {
  const session = await getSession()
  if (!session.userId) return { ok: false, error: "Not signed in." }
  await connectToDatabase()
  const user = await User.findById(session.userId)
  if (!user) return { ok: false, error: "User not found." }
  if (user.twoFactor?.enabled) return { ok: false, error: "Two-factor is already enabled." }

  const secret = generateSecretCompat()
  await User.updateOne(
    { _id: user._id },
    { $set: { "twoFactor.secret": secret, "twoFactor.enabled": false } },
  )
  const otpauthUrl = generateURI({ strategy: "totp", issuer: "Tobu AI", label: `Tobu AI:${user.email}`, secret })
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl)
  return { ok: true, otpauthUrl, qrDataUrl }
}

export async function confirmTwoFactorSetupAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const code = String(formData.get("code") ?? "").trim()
  if (!/^\d{6}$/.test(code)) return err("Enter the 6-digit code from your authenticator.")
  const session = await getSession()
  if (!session.userId) return err("Not signed in.")
  await connectToDatabase()
  const user = await User.findById(session.userId)
  if (!user?.twoFactor?.secret) return err("No setup in progress.")

  const valid = verifySync({ strategy: "totp", secret: user.twoFactor.secret, token: code })
  if (valid === null) return err("That code is incorrect.")

  const recoveryCodes = genRecoveryCodes()
  const hashed = recoveryCodes.map(hashToken)
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        "twoFactor.enabled": true,
        "twoFactor.verifiedAt": new Date(),
        "twoFactor.recoveryCodes": hashed,
      },
    },
  )
  return { ok: true }
}

export async function disableTwoFactorAction(): Promise<ActionResult> {
  const session = await getSession()
  if (!session.userId) return err("Not signed in.")
  await connectToDatabase()
  await User.updateOne(
    { _id: session.userId },
    { $set: { "twoFactor.enabled": false, "twoFactor.secret": undefined, "twoFactor.recoveryCodes": [] } },
  )
  return { ok: true }
}

const verify2faSchema = z.object({ code: z.string().regex(/^\d{6}$/) })

export async function verifyTwoFactorAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = verify2faSchema.safeParse({ code: String(formData.get("code") ?? "") })
  if (!parsed.success) return err("Enter the 6-digit code from your authenticator.")

  const session = await getSession()
  if (!session.pending2faUserId) return err("No pending sign-in to verify.")
  await connectToDatabase()
  const user = await User.findById(session.pending2faUserId)
  if (!user?.twoFactor?.secret) return err("Two-factor is not configured.")

  const valid = verifySync({ strategy: "totp", secret: user.twoFactor.secret, token: parsed.data.code })
  if (valid === null) return err("That code is incorrect.")

  const meta = await getRequestMeta()
  const { token, expiresAt } = await createDbSession({ userId: user._id, ...meta })
  const latest = await Session.findOne({ userId: user._id, token: hashToken(token) }).lean()
  if (latest) {
    await User.updateOne({ _id: user._id }, { $addToSet: { sessions: latest._id } })
  }

  session.userId = user._id.toString()
  session.email = user.email
  session.pending2faUserId = undefined
  await session.save()

  redirect("/chat")
}
