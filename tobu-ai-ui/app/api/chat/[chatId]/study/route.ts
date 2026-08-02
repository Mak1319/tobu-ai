import { NextResponse } from "next/server"
import { z } from "zod"
import { getSession } from "@/lib/auth/session"
import {
  ChatStudy,
  Preferences,
  UploadedFile,
  User,
  connectToDatabase,
} from "@/lib/db/models"
import {
  canMoveWizardStep,
  isWizardStepId,
  resolveWizardStep,
  type WizardStepId,
} from "@/lib/wizard/steps"

export const runtime = "nodejs"

const CHAT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

const Body = z.object({
  status: z
    .enum([
      "uploaded",
      "processing",
      "processed",
      "topics_selected",
      "live",
      "failed",
    ])
    .optional(),
  wizardStep: z.enum(["upload", "preview", "agentic"]).optional(),
  fileHash: z.string().min(8).max(128).optional(),
  mdKey: z.string().min(1).max(200).optional(),
  selectedSubject: z.string().min(1).max(200).optional(),
  selectedTopics: z.array(z.string().min(1).max(200)).max(50).optional(),
  processingError: z.string().max(2000).optional(),
})

/**
 * PUT /api/chat/[chatId]/study
 *
 * Upsert chat study session prefs (hash, subject/topics, pipeline status).
 * Also mirrors last study choice onto the user's Preferences doc when signed in,
 * and updates UploadedFile processing fields when status is processed/failed.
 * `wizardStep` is forward-only — never moves backward.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ chatId: string }> },
) {
  const { chatId } = await context.params
  if (!CHAT_ID_RE.test(chatId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid chatId" },
      { status: 400 },
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = Body.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    )
  }

  if (
    parsed.data.status === undefined &&
    parsed.data.wizardStep === undefined &&
    parsed.data.fileHash === undefined &&
    parsed.data.mdKey === undefined &&
    parsed.data.selectedSubject === undefined &&
    parsed.data.selectedTopics === undefined &&
    parsed.data.processingError === undefined
  ) {
    return NextResponse.json(
      { ok: false, error: "Empty update" },
      { status: 400 },
    )
  }

  const session = await getSession()
  const data = parsed.data

  try {
    await connectToDatabase()

    const existing = await ChatStudy.findOne({ chatId })
      .select({ wizardStep: 1, status: 1 })
      .lean<{ wizardStep?: WizardStepId; status?: string } | null>()

    const currentStep = resolveWizardStep({
      wizardStep: existing?.wizardStep,
      status: existing?.status,
    })

    let nextWizardStep: WizardStepId | undefined
    if (data.wizardStep) {
      if (!canMoveWizardStep(currentStep, data.wizardStep)) {
        return NextResponse.json(
          {
            ok: false,
            error: `Cannot move wizard from ${currentStep} back to ${data.wizardStep}`,
          },
          { status: 409 },
        )
      }
      nextWizardStep = data.wizardStep
    } else if (data.status === "processed" && currentStep === "upload") {
      // Upload finished — lock the user onto preview.
      nextWizardStep = "preview"
    } else if (
      data.status === "topics_selected" ||
      data.status === "live"
    ) {
      nextWizardStep = "agentic"
    }

    const study = await ChatStudy.findOneAndUpdate(
      { chatId },
      {
        $set: {
          chatId,
          ...(session.userId ? { userId: session.userId } : {}),
          ...(data.status ? { status: data.status } : {}),
          ...(nextWizardStep ? { wizardStep: nextWizardStep } : {}),
          ...(data.fileHash ? { fileHash: data.fileHash } : {}),
          ...(data.mdKey ? { mdKey: data.mdKey } : {}),
          ...(data.selectedSubject
            ? { selectedSubject: data.selectedSubject }
            : {}),
          ...(data.selectedTopics
            ? { selectedTopics: data.selectedTopics }
            : {}),
          ...(data.status === "failed"
            ? { processingError: data.processingError ?? "processing failed" }
            : data.status
              ? { processingError: undefined }
              : {}),
        },
      },
      { upsert: true, new: true },
    )

    if (data.fileHash && (data.status === "processed" || data.status === "failed")) {
      await UploadedFile.findOneAndUpdate(
        { chatId, contentHash: data.fileHash },
        {
          $set: {
            processingStatus:
              data.status === "processed" ? "ready" : "failed",
            ...(data.mdKey ? { processedKey: data.mdKey } : {}),
            ...(data.status === "processed"
              ? { processedAt: new Date(), processingError: undefined }
              : {
                  processingError:
                    data.processingError ?? "processing failed",
                }),
          },
        },
      )
    }

    if (
      session.userId &&
      data.status === "topics_selected" &&
      data.selectedSubject
    ) {
      const user = await User.findById(session.userId).select({ preferences: 1 })
      const prefId = user?.preferences?.[0]
      if (prefId) {
        await Preferences.collection.updateOne(
          { _id: prefId },
          {
            $set: {
              lastStudy: {
                chatId,
                fileHash: data.fileHash ?? study.fileHash,
                selectedSubject: data.selectedSubject,
                selectedTopics: data.selectedTopics ?? [],
                updatedAt: new Date(),
              },
            },
          },
        )
      }
    }

    return NextResponse.json({
      ok: true,
      chatId,
      status: study.status,
      wizardStep:
        study.wizardStep ?? resolveWizardStep({ status: study.status }),
      fileHash: study.fileHash ?? null,
      mdKey: study.mdKey ?? null,
      selectedSubject: study.selectedSubject ?? null,
      selectedTopics: study.selectedTopics ?? [],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ chatId: string }> },
) {
  const { chatId } = await context.params
  if (!CHAT_ID_RE.test(chatId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid chatId" },
      { status: 400 },
    )
  }

  try {
    await connectToDatabase()
    const study = await ChatStudy.findOne({ chatId }).lean()
    if (!study) {
      return NextResponse.json(
        { ok: false, error: "Study session not found" },
        { status: 404 },
      )
    }
    const wizardStep = resolveWizardStep({
      wizardStep: isWizardStepId(study.wizardStep) ? study.wizardStep : null,
      status: study.status,
    })
    return NextResponse.json({
      ok: true,
      study: { ...study, wizardStep },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
