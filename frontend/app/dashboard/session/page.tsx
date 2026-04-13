'use client'

import { RecordingProvider } from '@/components/recording-provider'
import { SessionPanel } from '@/components/session-panel'

export default function SessionPage() {
  return (
    <div className="micro-stagger space-y-4">
      <div className="border border-border bg-background/40 px-4 py-4 md:px-5 md:py-5">
        <h1 className="text-xl tracking-tight text-foreground md:text-2xl">Start Session</h1>
      </div>

      <RecordingProvider>
        <SessionPanel />
      </RecordingProvider>
    </div>
  )
}
