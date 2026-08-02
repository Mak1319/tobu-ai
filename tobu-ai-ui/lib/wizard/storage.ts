/**
 * sessionStorage helpers for wizard → live handoff.
 * Keys: wizard:{chatId} and wizard:{chatId}:selection
 */

export type WizardHashState = {
  fileHash?: string
  mdKey?: string
}

export type WizardSelectionState = {
  fileHash?: string
  selectedSubject?: string
  selectedTopics?: string[]
}

function wizardKey(chatId: string) {
  return `wizard:${chatId}`
}

function selectionKey(chatId: string) {
  return `wizard:${chatId}:selection`
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota / private mode
  }
}

export function readWizardHash(chatId: string): WizardHashState | null {
  return readJson<WizardHashState>(wizardKey(chatId))
}

export function writeWizardHash(chatId: string, data: WizardHashState) {
  const prev = readWizardHash(chatId) ?? {}
  writeJson(wizardKey(chatId), { ...prev, ...data })
}

export function readWizardSelection(
  chatId: string,
): WizardSelectionState | null {
  return readJson<WizardSelectionState>(selectionKey(chatId))
}

export function writeWizardSelection(
  chatId: string,
  data: WizardSelectionState,
) {
  writeJson(selectionKey(chatId), data)
}
