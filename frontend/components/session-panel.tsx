'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Monitor, Square, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LiveTranscript } from '@/components/live-transcript'
import { ExtractionCard } from '@/components/extraction-card'
import { SessionEnding } from '@/components/session-ending'
import { useRecording } from '@/components/recording-provider'
import { canCaptureSystemAudio } from '@/hooks/use-screen-recorder'

type SessionMode = 'idle' | 'webcam' | 'screen'

export function SessionPanel({
  onModeChange,
  onMemorySaved,
}: {
  onModeChange?: (mode: SessionMode) => void
  onMemorySaved?: () => void
}) {
  const [mode, setMode] = useState<SessionMode>('idle')
  // Locks the UI into the ending animation from the click moment until
  // we've fully landed on the idle/extraction view — avoids flashing the
  // paused recording panel while recorder.status transitions processing→idle.
  const [isEnding, setIsEnding] = useState(false)
  const [webcamError, setWebcamError] = useState<string | null>(null)
  const [webcamElapsed, setWebcamElapsed] = useState(0)
  // Hydration-safe: only render capability warning after client mount.
  const [mounted, setMounted] = useState(false)
  const [systemAudioSupported, setSystemAudioSupported] = useState(true)

  useEffect(() => {
    setMounted(true)
    setSystemAudioSupported(canCaptureSystemAudio())
  }, [])

  const videoRef = useRef<HTMLVideoElement>(null)
  const webcamStreamRef = useRef<MediaStream | null>(null)
  const webcamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const recorder = useRecording()

  useEffect(() => {
    onModeChange?.(mode)
  }, [mode, onModeChange])

  // --- Webcam mode (unchanged, partner owns this) ---

  const stopWebcam = useCallback(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((track) => track.stop())
      webcamStreamRef.current = null
    }
    if (webcamTimerRef.current) {
      clearInterval(webcamTimerRef.current)
      webcamTimerRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setMode('idle')
    setWebcamElapsed(0)
    setWebcamError(null)
  }, [])

  const startWebcam = useCallback(async () => {
    setWebcamError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      })
      webcamStreamRef.current = stream
      setMode('webcam')

      setWebcamElapsed(0)
      webcamTimerRef.current = setInterval(() => {
        setWebcamElapsed((prev) => prev + 1)
      }, 1000)
    } catch {
      setWebcamError('camera access denied. check browser permissions.')
    }
  }, [])

  // --- Screen mode (uses the recorder hook) ---

  const startScreenCapture = useCallback(async () => {
    await recorder.startRecording()
    // Only set mode if recording actually started (no error)
    if (!recorder.error) {
      setMode('screen')
    }
  }, [recorder])

  const stopScreenCapture = useCallback(async () => {
    setIsEnding(true)
    try {
      await recorder.stopRecording()
      setMode('idle')
      onMemorySaved?.()
    } finally {
      setIsEnding(false)
    }
  }, [recorder, onMemorySaved])

  // React to recorder status — if it errors or becomes idle externally, sync UI
  useEffect(() => {
    if (mode === 'screen' && recorder.status === 'idle' && !recorder.extraction) {
      setMode('idle')
    }
  }, [mode, recorder.status, recorder.extraction])

  // Attach webcam or screen stream to video element
  useEffect(() => {
    if (!videoRef.current) return
    if (mode === 'webcam') {
      videoRef.current.srcObject = webcamStreamRef.current
    } else if (mode === 'screen') {
      videoRef.current.srcObject = recorder.stream
    } else {
      videoRef.current.srcObject = null
    }
  }, [mode, recorder.stream])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (webcamTimerRef.current) {
        clearInterval(webcamTimerRef.current)
      }
    }
  }, [])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const currentElapsed = mode === 'webcam' ? webcamElapsed : recorder.elapsed
  const currentError = mode === 'webcam' ? webcamError : recorder.error

  // --- Processing state: show the ending animation instead of the
  //     paused recording view. Lingers from click until extraction and
  //     nia writes complete, covering any async gap between
  //     recorder.status→idle and mode→idle.
  if (isEnding || recorder.status === 'processing') {
    return (
      <div className="space-y-4">
        <SessionEnding />
      </div>
    )
  }

  // --- Idle state: show two mode selection buttons ---
  if (mode === 'idle') {
    return (
      <div className="space-y-4">
        <Card className="rounded-none border-border bg-background/40 shadow-none">
          <CardHeader className="gap-1 px-4 py-4">
            <CardTitle className="flex items-center gap-2 text-sm lowercase">
              <Video className="h-4 w-4 text-muted-foreground" />
              start a session
            </CardTitle>
            <CardDescription className="text-xs lowercase">
              choose how you want to capture this interaction.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid gap-3 md:grid-cols-2">
              <button
                onClick={startWebcam}
                className="group border border-border bg-secondary/30 p-6 text-left transition-colors hover:border-accent hover:bg-accent/5"
              >
                <Camera className="mb-3 h-8 w-8 text-muted-foreground transition-colors group-hover:text-accent" />
                <p className="text-sm lowercase">webcam</p>
                <p className="mt-1 text-xs lowercase text-muted-foreground">
                  in-person interaction. face recognition enabled.
                </p>
              </button>
              <button
                onClick={startScreenCapture}
                className="group border border-border bg-secondary/30 p-6 text-left transition-colors hover:border-accent hover:bg-accent/5"
              >
                <Monitor className="mb-3 h-8 w-8 text-muted-foreground transition-colors group-hover:text-accent" />
                <p className="text-sm lowercase">screen capture</p>
                <p className="mt-1 text-xs lowercase text-muted-foreground">
                  online interaction. capture meetings, calls, chats.
                </p>
              </button>
            </div>
            {mounted && !systemAudioSupported && (
              <p className="mt-3 text-xs lowercase text-muted-foreground">
                note: system audio capture works best in chrome or edge.
              </p>
            )}
            {currentError && (
              <p className="mt-3 text-xs lowercase text-destructive">
                {currentError}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Show extraction result after a recording finishes */}
        {recorder.extraction && (
          <ExtractionCard extraction={recorder.extraction} />
        )}
      </div>
    )
  }

  // --- Active recording state ---
  return (
    <div className="space-y-4">
      <Card className="rounded-none border-border bg-background/40 shadow-none">
        <CardHeader className="gap-1 px-4 py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm lowercase">
              {mode === 'webcam' ? (
                <Camera className="h-4 w-4 text-accent" />
              ) : (
                <Monitor className="h-4 w-4 text-accent" />
              )}
              {mode === 'webcam' ? 'webcam session' : 'screen capture session'}
            </CardTitle>
            <div className="flex items-center gap-3">
              {mode === 'screen' && recorder.isTranscribing && (
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 animate-pulse bg-accent" />
                  <span className="text-[10px] lowercase text-muted-foreground">
                    transcribing
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse bg-red-500" />
                <span className="font-mono text-xs lowercase text-muted-foreground">
                  {formatTime(currentElapsed)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 rounded-none border-border px-3 text-xs lowercase hover:border-destructive hover:text-destructive"
                onClick={mode === 'webcam' ? stopWebcam : stopScreenCapture}
              >
                <Square className="h-3 w-3" />
                end session
              </Button>
            </div>
          </div>
          <CardDescription className="text-xs lowercase">
            {mode === 'webcam'
              ? 'capturing in-person interaction. face recognition active.'
              : 'capturing screen + audio. transcribing in 15s chunks.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="relative border border-border bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="aspect-video w-full object-contain"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse bg-red-500" />
                <span className="text-[10px] uppercase tracking-widest text-white/70">
                  {mode === 'webcam' ? 'live — webcam' : 'live — screen'}
                </span>
              </div>
            </div>
          </div>
          {currentError && (
            <p className="mt-3 text-xs lowercase text-destructive">
              {currentError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Live transcript only for screen mode */}
      {mode === 'screen' && (
        <LiveTranscript
          chunks={recorder.chunks}
          isTranscribing={recorder.isTranscribing}
        />
      )}
    </div>
  )
}
