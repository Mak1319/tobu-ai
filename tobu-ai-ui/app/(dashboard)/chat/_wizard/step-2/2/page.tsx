import { Button } from "@/components/ui/button"

interface Step2Page2Props {
  onFinish?: () => void;
}

export default function Step2Page2({ onFinish }: Step2Page2Props) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Step 2.2: Set Parameters</h1>
      <p className="text-muted-foreground">Configure the parameters for your chat.</p>

      <div className="space-y-4 mt-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Max Tokens</label>
          <input type="number" placeholder="1000" className="w-full px-3 py-2 border rounded-md" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Top P</label>
          <input type="range" min="0" max="1" step="0.1" className="w-full" />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="stream" />
          <label htmlFor="stream" className="text-sm">Enable Streaming</label>
        </div>
      </div>

      <div className="mt-4">
        <Button onClick={onFinish} className="w-full">
          Finish
        </Button>
      </div>
    </div>
  )
}
