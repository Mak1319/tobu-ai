import "server-only"

import { connectToDatabase, ChatStudy } from "@/lib/db/models"
import {
  isWizardStepId,
  resolveWizardStep,
  type WizardStepId,
} from "@/lib/wizard/steps"

/** Read the persisted (forward-only) wizard step for a chat. */
export async function getWizardStep(chatId: string): Promise<WizardStepId> {
  await connectToDatabase()
  const study = await ChatStudy.findOne({ chatId })
    .select({ wizardStep: 1, status: 1 })
    .lean<{ wizardStep?: string; status?: string } | null>()

  return resolveWizardStep({
    wizardStep: isWizardStepId(study?.wizardStep) ? study.wizardStep : null,
    status: study?.status,
  })
}
