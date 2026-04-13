'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
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
import { PostCallConfirmation } from '@/components/post-call-confirmation'
import { WebcamSubtitleOverlay } from '@/components/webcam-subtitle-overlay'
import { SessionEnding } from '@/components/session-ending'
import { useRecording } from '@/components/recording-provider'
import { canCaptureSystemAudio } from '@/hooks/use-screen-recorder'
import { useWebcamAudioTranscript } from '@/hooks/use-webcam-audio-transcript'
import type { RecognitionProfile } from '@/lib/recognition-types'

const LiveRecognitionPanel = dynamic(
  () =>
    import('@/components/live-recognition-panel').then(
      (mod) => mod.LiveRecognitionPanel
    ),
  { ssr: false }
)

type SessionMode = 'idle' | 'webcam' | 'screen'

function createPid(): string {
  return `pid_${Date.now().toString(36)}`
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ')
}

function extractNameHeuristic(transcript: string): string {
  const normalized = transcript.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  const patterns = [
    /\bmy name is ([a-z][a-z' -]{1,40})\b/i,
    /\bi(?:'m| am) ([a-z][a-z' -]{1,40})\b/i,
    /\bthis is ([a-z][a-z' -]{1,40})\b/i,
    /\bcall me ([a-z][a-z' -]{1,40})\b/i,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    const candidate = match?.[1]?.trim() || ''
    if (!candidate) continue
    const clean = candidate
      .replace(/[^a-z' -]/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!clean || clean.split(' ').length > 4) continue
    return toTitleCase(clean)
  }
  return ''
}

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
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null)
  const [activeProfile, setActiveProfile] = useState<RecognitionProfile | null>(null)
  const [isSavingWebcamSession, setIsSavingWebcamSession] = useState(false)
  const [savingContactName, setSavingContactName] = useState<string>('contact')
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
  const {
    chunks: webcamTranscriptChunks,
    currentTranscript,
    durableTranscript,
    liveTranscript,
    interimLiveTranscript,
    isTranscribing,
    isLiveListening,
    isRealtimeConnected,
    lastTranscribeError,
    error: webcamAudioError,
    startFromStream,
    stop: stopWebcamTranscript,
    stopAndFlush,
  } = useWebcamAudioTranscript()

  const attachVideoPreview = useCallback(
    async (stream: MediaStream) => {
      if (!videoRef.current) return
      const videoEl = videoRef.current
      videoEl.srcObject = stream

      await new Promise<void>((resolve) => {
        const done = () => resolve()
        videoEl.onloadedmetadata = done
        videoEl.oncanplay = done
        setTimeout(done, 1200)
      })

      await videoEl.play().catch(() => {
        throw new Error('unable to autoplay camera preview')
      })
    },
    []
  )

  useEffect(() => {
    onModeChange?.(mode)
  }, [mode, onModeChange])

  // --- Webcam mode (unchanged, partner owns this) ---

  const stopWebcam = useCallback(async () => {
    const profileSnapshot = activeProfile
    const roughTranscript = currentTranscript.trim()
    const fallbackName = extractNameHeuristic(roughTranscript)
    const nextSavingName =
      (profileSnapshot?.name || fallbackName || 'contact').trim() || 'contact'

    setIsSavingWebcamSession(true)
    setSavingContactName(nextSavingName)

    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((track) => track.stop())
      webcamStreamRef.current = null
    }
    setWebcamStream(null)
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
    setActiveProfile(null)

    try {
      const flushed = await stopAndFlush()
      const finalTranscript = flushed.finalTranscript.trim()

      let profileForFinalize = profileSnapshot
      if (!profileForFinalize && finalTranscript.length > 0) {
        const inferredName = extractNameHeuristic(finalTranscript) || 'new contact'
        const provisionalId = createPid()
        try {
          const createRes = await fetch('/api/recognition/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              person_id: provisionalId,
              name: inferredName,
              name_confirmed: false,
              where_met: 'live webcam session',
              summary: '',
              open_loops: [],
              last_location: '',
            }),
          })
          if (createRes.ok) {
            const created = (await createRes.json()) as { profile?: RecognitionProfile }
            if (created.profile) {
              profileForFinalize = created.profile
              setActiveProfile(created.profile)
            }
          }
        } catch (err) {
          console.error('provisional webcam profile creation failed:', err)
        }
      }

      if (profileForFinalize?.person_id && finalTranscript.length > 0) {
        await fetch('/api/recognition/conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            person_id: profileForFinalize.person_id,
            name: profileForFinalize.name,
            name_confirmed: profileForFinalize.name_confirmed,
            where_met: profileForFinalize.where_met,
            summary: profileForFinalize.summary,
            open_loops: profileForFinalize.open_loops,
            last_location: profileForFinalize.last_location,
            transcript: finalTranscript,
            finalize: true,
          }),
        })
          .then(async (res) => {
            if (!res.ok) return
            const json = (await res.json()) as { profile?: RecognitionProfile }
            if (json.profile) setActiveProfile(json.profile)
          })
          .catch((err) => {
            console.error('webcam final memory flush failed:', err)
          })
      }
      onMemorySaved?.()
    } finally {
      setIsSavingWebcamSession(false)
    }
  }, [activeProfile, currentTranscript, onMemorySaved, stopAndFlush])

  const startWebcam = useCallback(async () => {
    setWebcamError(null)
    const clearTimer = () => {
      if (webcamTimerRef.current) {
        clearInterval(webcamTimerRef.current)
        webcamTimerRef.current = null
      }
    }

    try {
      let stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      })

      // Fallback for browsers/hardware combos where combined AV can return a dead video preview.
      if (stream.getVideoTracks().length === 0) {
        stream.getTracks().forEach((track) => track.stop())
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
      }

      if (stream.getVideoTracks().length === 0) {
        stream.getTracks().forEach((track) => track.stop())
        setWebcamError('camera stream unavailable. check camera permissions.')
        return
      }

      stream.getVideoTracks().forEach((track) => {
        track.enabled = true
      })

      webcamStreamRef.current = stream
      setWebcamStream(stream)
      await attachVideoPreview(stream)
      startFromStream(stream)
      setMode('webcam')
      setActiveProfile(null)

      setWebcamElapsed(0)
      clearTimer()
      webcamTimerRef.current = setInterval(() => {
        setWebcamElapsed((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((track) => track.stop())
        webcamStreamRef.current = null
      }
      setWebcamStream(null)
      const message =
        err instanceof Error ? err.message : 'camera access denied. check browser permissions.'
      setWebcamError(message)
    }
  }, [attachVideoPreview, startFromStream])

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
      const videoEl = videoRef.current
      videoEl.srcObject = webcamStream
      videoEl
        .play()
        .catch(() => setWebcamError('unable to autoplay camera preview. click run webcam again.'))
    } else if (mode === 'screen') {
      const videoEl = videoRef.current
      videoEl.srcObject = recorder.stream
      videoEl.play().catch(() => {
        // Screen preview autoplay can fail on some browsers; user can still continue.
      })
    } else {
      videoRef.current.srcObject = null
    }
  }, [mode, recorder.stream, webcamStream])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWebcamTranscript()
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (webcamTimerRef.current) {
        clearInterval(webcamTimerRef.current)
      }
    }
  }, [stopWebcamTranscript])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const currentElapsed = mode === 'webcam' ? webcamElapsed : recorder.elapsed
  const currentError =
    mode === 'webcam'
      ? webcamError || webcamAudioError || lastTranscribeError
      : recorder.error

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
      <div className="micro-stagger space-y-4">
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
                disabled={isSavingWebcamSession}
                className="group border border-border bg-secondary/30 p-6 text-left transition-all duration-200 hover:-translate-y-px hover:border-accent hover:bg-accent/5"
              >
                <Camera className="mb-3 h-8 w-8 text-muted-foreground transition-colors group-hover:text-accent" />
                <p className="text-sm lowercase">webcam</p>
                <p className="mt-1 text-xs lowercase text-muted-foreground">
                  in-person interaction. face recognition enabled.
                </p>
              </button>
              <button
                onClick={startScreenCapture}
                disabled={isSavingWebcamSession}
                className="group border border-border bg-secondary/30 p-6 text-left transition-all duration-200 hover:-translate-y-px hover:border-accent hover:bg-accent/5"
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

        {/* Unified post-call review: memory, profiles, calendar, email, tasks */}
        {recorder.extraction && (
          <>
            <PostCallConfirmation extraction={recorder.extraction} />
            {recorder.chunks.length > 0 && (
              <LiveTranscript
                chunks={recorder.chunks}
                isTranscribing={false}
              />
            )}
          </>
        )}
        {isSavingWebcamSession && (
          <Card className="rounded-none border-border bg-background/40 shadow-none">
            <CardContent className="flex items-center gap-2 px-4 py-4 text-sm lowercase text-muted-foreground">
              <span className="h-2 w-2 animate-pulse bg-accent" />
              <span className="animate-pulse">
                saving conversation with {savingContactName}...
              </span>
            </CardContent>
          </Card>
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
                  <span className="micro-pulse-dot h-2 w-2 bg-accent" />
                  <span className="text-[10px] lowercase text-muted-foreground">
                    transcribing
                  </span>
                </div>
              )}
              {mode === 'webcam' && (isLiveListening || isTranscribing) && (
                <div className="flex items-center gap-1.5">
                  <span className="micro-pulse-dot h-2 w-2 bg-accent" />
                  <span className="text-[10px] lowercase text-muted-foreground">
                    {isRealtimeConnected
                      ? 'realtime stt'
                      : isLiveListening
                        ? 'live stt'
                        : 'syncing chunks'}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="micro-pulse-dot h-2 w-2 bg-red-500" />
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
              ? 'capturing in-person interaction. face recognition active with live + durable stt.'
              : 'capturing screen + audio. transcribing in 15s chunks.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="micro-enter relative border border-border bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="aspect-video w-full object-contain"
            />
            {mode === 'webcam' && (
              <WebcamSubtitleOverlay
                active
                chunks={webcamTranscriptChunks}
                liveTranscript={liveTranscript}
                interimLiveTranscript={interimLiveTranscript}
                isLiveListening={isLiveListening}
                isTranscribing={isTranscribing}
              />
            )}
            {mode === 'webcam' && (
              <div className="pointer-events-none absolute left-2 right-2 top-2 z-20">
        <LiveRecognitionPanel
          active={mode === 'webcam'}
          videoRef={videoRef}
          transcript={currentTranscript}
          isTranscribing={isTranscribing || isLiveListening}
          overlay
          onProfileChange={setActiveProfile}
        />
      </div>
    )}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
              <div className="flex items-center gap-2">
                <span className="micro-pulse-dot h-1.5 w-1.5 bg-red-500" />
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
          {mode === 'webcam' && (liveTranscript || durableTranscript) && (
            <p className="mt-2 text-[11px] lowercase text-muted-foreground">
              transcript source: {liveTranscript ? 'live mic' : ''}{liveTranscript && durableTranscript ? ' + ' : ''}{durableTranscript ? 'chunk sync' : ''}
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
