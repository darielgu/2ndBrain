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

type SessionMode = 'idle' | 'webcam' | 'screen'

export function SessionPanel({
  onModeChange,
}: {
  onModeChange?: (mode: SessionMode) => void
}) {
  const [mode, setMode] = useState<SessionMode>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    onModeChange?.(mode)
  }, [mode, onModeChange])

  const stopSession = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setMode('idle')
    setElapsed(0)
    setError(null)
  }, [])

  const startSession = useCallback(
    async (type: 'webcam' | 'screen') => {
      setError(null)
      try {
        let stream: MediaStream
        if (type === 'webcam') {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          })
        } else {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
          })
        }
        streamRef.current = stream
        setMode(type)

        // Handle screen share ended via browser UI
        if (type === 'screen') {
          stream
            .getVideoTracks()[0]
            .addEventListener('ended', stopSession)
        }

        // Start elapsed timer
        setElapsed(0)
        timerRef.current = setInterval(() => {
          setElapsed((prev) => prev + 1)
        }, 1000)
      } catch {
        setError(
          type === 'webcam'
            ? 'camera access denied. check browser permissions.'
            : 'screen share cancelled or denied.'
        )
      }
    },
    [stopSession]
  )

  // Attach stream to video element when mode changes
  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [mode])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
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

  if (mode === 'idle') {
    return (
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
              onClick={() => startSession('webcam')}
              className="group border border-border bg-secondary/30 p-6 text-left transition-colors hover:border-accent hover:bg-accent/5"
            >
              <Camera className="mb-3 h-8 w-8 text-muted-foreground transition-colors group-hover:text-accent" />
              <p className="text-sm lowercase">webcam</p>
              <p className="mt-1 text-xs lowercase text-muted-foreground">
                in-person interaction. face recognition enabled.
              </p>
            </button>
            <button
              onClick={() => startSession('screen')}
              className="group border border-border bg-secondary/30 p-6 text-left transition-colors hover:border-accent hover:bg-accent/5"
            >
              <Monitor className="mb-3 h-8 w-8 text-muted-foreground transition-colors group-hover:text-accent" />
              <p className="text-sm lowercase">screen capture</p>
              <p className="mt-1 text-xs lowercase text-muted-foreground">
                online interaction. capture meetings, calls, chats.
              </p>
            </button>
          </div>
          {error && (
            <p className="mt-3 text-xs lowercase text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
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
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse bg-red-500" />
              <span className="font-mono text-xs lowercase text-muted-foreground">
                {formatTime(elapsed)}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 rounded-none border-border px-3 text-xs lowercase hover:border-destructive hover:text-destructive"
              onClick={stopSession}
            >
              <Square className="h-3 w-3" />
              end session
            </Button>
          </div>
        </div>
        <CardDescription className="text-xs lowercase">
          {mode === 'webcam'
            ? 'capturing in-person interaction. face recognition active.'
            : 'capturing screen activity. analyzing online interaction.'}
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
      </CardContent>
    </Card>
  )
}
