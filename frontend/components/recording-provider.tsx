'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useScreenRecorder } from '@/hooks/use-screen-recorder'

type ScreenRecorderReturn = ReturnType<typeof useScreenRecorder>

const RecordingContext = createContext<ScreenRecorderReturn | null>(null)

export function RecordingProvider({ children }: { children: ReactNode }) {
  const recorder = useScreenRecorder()
  return (
    <RecordingContext.Provider value={recorder}>
      {children}
    </RecordingContext.Provider>
  )
}

export function useRecording(): ScreenRecorderReturn {
  const ctx = useContext(RecordingContext)
  if (!ctx) {
    throw new Error('useRecording must be used within <RecordingProvider>')
  }
  return ctx
}
