import "server-only"
import nodemailer, { type Transporter } from "nodemailer"

let cached: Transporter | null = null

function getTransport(): Transporter {
  if (cached) return cached
  const url = process.env.SMTP_URL
  if (url) {
    cached = nodemailer.createTransport(url)
  } else {
    // Dev: print the message to the server log.
    cached = nodemailer.createTransport({ jsonTransport: true })
  }
  return cached
}

export async function sendMail(opts: {
  to: string
  subject: string
  html: string
  text?: string
}) {
  const transport = getTransport()
  const from = process.env.SMTP_FROM ?? "Tobu AI <no-reply@tobu.ai>"
  return transport.sendMail({ from, ...opts })
}
