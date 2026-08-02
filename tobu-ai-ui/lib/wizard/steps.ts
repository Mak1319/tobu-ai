export const WIZARD_STEPS = ["upload", "preview", "agentic"] as const

export type WizardStepId = (typeof WIZARD_STEPS)[number]

export function isWizardStepId(value: unknown): value is WizardStepId {
  return (
    typeof value === "string" &&
    (WIZARD_STEPS as readonly string[]).includes(value)
  )
}

export function wizardStepIndex(step: WizardStepId): number {
  return WIZARD_STEPS.indexOf(step)
}

/** Only allow moving to the same step or a later one. */
export function canMoveWizardStep(
  from: WizardStepId,
  to: WizardStepId,
): boolean {
  return wizardStepIndex(to) >= wizardStepIndex(from)
}

/**
 * Resolve the step a chat should open on.
 * Prefers persisted `wizardStep`; falls back to study `status` for older rows.
 */
export function resolveWizardStep(input: {
  wizardStep?: string | null
  status?: string | null
}): WizardStepId {
  if (isWizardStepId(input.wizardStep)) return input.wizardStep

  switch (input.status) {
    case "topics_selected":
    case "live":
      return "agentic"
    case "processed":
      return "preview"
    default:
      return "upload"
  }
}

export async function patchWizardStep(
  chatId: string,
  wizardStep: WizardStepId,
): Promise<void> {
  await fetch(`/api/chat/${encodeURIComponent(chatId)}/study`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wizardStep }),
  }).catch(() => undefined)
}
