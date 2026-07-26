export default function Step3Page() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Step 3: Review & Create</h1>
      <p className="text-muted-foreground">Review your configuration and create the chat.</p>

      <div className="space-y-4 mt-4 p-4 border rounded-lg">
        <h2 className="font-medium">Configuration Summary</h2>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Chat Name: My Chat</p>
          <p>Model: GPT-4</p>
          <p>Temperature: 0.7</p>
          <p>Max Tokens: 1000</p>
        </div>
      </div>
    </div>
  )
}
