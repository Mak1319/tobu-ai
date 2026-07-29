"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import WizardLayout from "../_wizard/layout"
import Step1Page from "../_wizard/step-1/page"
import Step2Layout from "../_wizard/step-2/layout"
import Step2Page1 from "../_wizard/step-2/1/page"
import Step2Page2 from "../_wizard/step-2/2/page"
import Step3Page from "../_wizard/step-3/page"

export default function ChatDetailPage({
  params,
}: {
  params: Promise<{ chatId: string }>
}) {
  const { chatId } = use(params)
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [currentSubstep, setCurrentSubstep] = useState(1)

  const handleUploadComplete = () => {
    setCurrentStep(2)
  }

  const launchVoice = () => {
    router.push(`/chat/${chatId}/live`)
  }

  const renderStep = () => {
    if (currentStep === 1) {
      return <Step1Page chatId={chatId} onUploadComplete={handleUploadComplete} />
    }
    if (currentStep === 2) {
      return (
        <Step2Layout>
          {currentSubstep === 1 ? (
            <Step2Page1
              onNext={() => {
                setCurrentSubstep(2)
              }}
            />
          ) : (
            <Step2Page2
              onFinish={() => {
                setCurrentStep(3)
                setCurrentSubstep(1)
              }}
            />
          )}
        </Step2Layout>
      )
    }
    if (currentStep === 3) {
      return <Step3Page chatId={chatId} onLaunchVoice={launchVoice} />
    }
    return null
  }

  return (
    <div className="flex flex-col h-full">
      <WizardLayout>
        {/* Stepper - only shows for step 2 substeps */}
        {currentStep === 2 && (
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                currentSubstep >= 1
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}>
                1
              </div>
              <span className={`text-sm ${currentSubstep >= 1 ? "" : "text-muted-foreground"}`}>
                Model
              </span>
            </div>
            <div className="w-8 h-px bg-border" />
            <div className="flex items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                currentSubstep >= 2
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}>
                2
              </div>
              <span className={`text-sm ${currentSubstep >= 2 ? "" : "text-muted-foreground"}`}>
                Parameters
              </span>
            </div>
          </div>
        )}

        <div className="flex-1 py-4">
          {renderStep()}
        </div>
      </WizardLayout>
    </div>
  )
}