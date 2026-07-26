import { Button } from "@/components/ui/button"

interface Step2Page1Props {
  onNext?: () => void;
}

export default function Step2Page1({ onNext }: Step2Page1Props) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Step 2.1: Configure Model</h1>
      <p className="text-muted-foreground">Select the AI model for your chat.</p>

      <div className="space-y-4 mt-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Select Model</label>
          <select className="w-full px-3 py-2 border rounded-md">
            <option>GPT-4</option>
            <option>GPT-3.5 Turbo</option>
            <option>Claude 3</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Temperature</label>
          <input type="range" min="0" max="1" step="0.1" className="w-full" />
        </div>
      </div>

      <div className="mt-4">
        <Button onClick={onNext} className="w-full">
          Next
        </Button>
      </div>
    </div>
  )
}
