'use client'

import { RecordingProvider } from '@/components/recording-provider'
import { SessionPanel } from '@/components/session-panel'

export default function SessionPage() {
  return (
    <div className="space-y-4">
      <div className="border border-border bg-background/40 p-3">
        <p className="text-xs tracking-widest text-muted-foreground">secondbrain / session</p>
        <h1 className="mt-1 text-2xl lowercase tracking-tight md:text-3xl">start session</h1>
      </div>

      <RecordingProvider>
        <SessionPanel />
      </RecordingProvider>
    </div>
  )
}
