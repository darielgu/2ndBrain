'use client'

import { useCallback, useRef, useState } from 'react'
import type {
  RecordingStatus,
  TranscriptChunk,
  ExtractionResult,
  VisualPerson,
} from '@/lib/types'

const CHUNK_INTERVAL_MS = 15_000 // 15 seconds per chunk

// Mix multiple MediaStreams' audio tracks into one stream via the Web Audio
// API. Needed to combine mic + tab audio so whisper hears both the user
// and the other side of the call.
function mixAudioStreams(
  ctx: AudioContext,
  sources: MediaStream[],
): MediaStream {
  const destination = ctx.createMediaStreamDestination()
  for (const src of sources) {
    if (src.getAudioTracks().length === 0) continue
    const node = ctx.createMediaStreamSource(src)
    node.connect(destination)
  }
  return destination.stream
}

function getSupportedMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ]
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return 'audio/webm'
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('ogg') || mimeType.includes('oga')) return 'ogg'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3') || mimeType.includes('mpga')) return 'mp3'
  if (mimeType.includes('flac')) return 'flac'
  if (mimeType.includes('m4a')) return 'm4a'
  return 'webm'
}

export function canCaptureSystemAudio(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    /Chrome|Edg/.test(navigator.userAgent)
  )
}

export function useScreenRecorder() {
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [chunks, setChunks] = useState<TranscriptChunk[]>([])
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null)
  const [visualPeople] = useState<VisualPerson[]>([])
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chunkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chunkIndexRef = useRef(0)
  const transcriptRef = useRef('')
  // True while we're actively rolling chunks. Flipped to false in stop so
  // the last onstop doesn't start a new recorder.
  const recordingActiveRef = useRef(false)
  // Track in-flight transcription requests
  const pendingRef = useRef(0)
  const [isTranscribing, setIsTranscribing] = useState(false)

  const cleanup = useCallback(() => {
    recordingActiveRef.current = false
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (chunkTimeoutRef.current) {
      clearTimeout(chunkTimeoutRef.current)
      chunkTimeoutRef.current = null
    }
    if (mediaRecorderRef.current?.state !== 'inactive') {
      try {
        mediaRecorderRef.current?.stop()
      } catch {}
    }
    mediaRecorderRef.current = null
    audioStreamRef.current = null
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop())
      micStreamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setStream(null)
  }, [])

  const transcribeChunk = useCallback(async (blob: Blob, index: number) => {
    // Skip empty chunks
    if (blob.size < 1000) return

    pendingRef.current++
    setIsTranscribing(true)

    try {
      const formData = new FormData()
      const ext = extensionForMimeType(blob.type || 'audio/webm')
      formData.append('audio', blob, `chunk-${index}.${ext}`)

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || `transcription failed (${res.status})`)
      }
      const { text } = (await res.json()) as { text?: string }

      if (text) {
        transcriptRef.current += (transcriptRef.current ? ' ' : '') + text
        setCurrentTranscript(transcriptRef.current)
        setChunks((prev) => [
          ...prev,
          { text, timestamp: Date.now(), chunk_index: index },
        ])
      }
    } catch (err) {
      console.error(`chunk ${index} transcription failed:`, err)
    } finally {
      pendingRef.current--
      if (pendingRef.current === 0) setIsTranscribing(false)
    }
  }, [])

  const startChunkCycle = useCallback(() => {
    if (!recordingActiveRef.current) return
    const audioStream = audioStreamRef.current
    if (!audioStream) return

    const mimeType = getSupportedMimeType()
    const recorder = new MediaRecorder(audioStream, { mimeType })
    const dataChunks: Blob[] = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) dataChunks.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(dataChunks, { type: mimeType })
      if (blob.size > 0) {
        const index = chunkIndexRef.current++
        transcribeChunk(blob, index)
      }
      // Immediately start the next cycle if we're still recording. This
      // keeps audio coverage seamless across chunk boundaries.
      if (recordingActiveRef.current) {
        startChunkCycle()
      }
    }

    mediaRecorderRef.current = recorder
    recorder.start()

    chunkTimeoutRef.current = setTimeout(() => {
      if (recorder.state !== 'inactive') {
        recorder.stop()
      }
    }, CHUNK_INTERVAL_MS)
  }, [transcribeChunk])

  const startRecording = useCallback(async () => {
    setError(null)
    setChunks([])
    setCurrentTranscript('')
    setExtraction(null)
    setElapsed(0)
    transcriptRef.current = ''
    chunkIndexRef.current = 0

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })

      const displayAudioTracks = displayStream.getAudioTracks()
      const hasDisplayAudio = displayAudioTracks.length > 0

      streamRef.current = displayStream
      setStream(displayStream)

      // Listen for user stopping the share via browser UI
      displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        stopRecording()
      })

      // Also grab the mic so whisper hears the user's own voice, not just
      // whatever the shared tab outputs. If the user denies mic, we fall
      // back to display audio only.
      let micStream: MediaStream | null = null
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        })
        micStreamRef.current = micStream
      } catch {
        // Mic denied — continue with display audio only.
      }
      const hasMic = !!micStream && micStream.getAudioTracks().length > 0

      if (!hasDisplayAudio && !hasMic) {
        setError(
          'no audio captured. enable "share audio" in the browser dialog, or allow mic access.',
        )
      } else if (!hasDisplayAudio) {
        setError(
          'system audio not shared — recording mic only. tick "share audio" next time to capture both.',
        )
      } else if (!hasMic) {
        setError(
          'mic not available — recording system audio only. allow mic access to capture your voice.',
        )
      }

      if (hasDisplayAudio || hasMic) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext
        const audioContext = new AudioCtx()
        audioContextRef.current = audioContext

        const sources: MediaStream[] = []
        if (hasDisplayAudio) {
          sources.push(new MediaStream(displayAudioTracks))
        }
        if (hasMic && micStream) {
          sources.push(micStream)
        }
        // Mix so a single MediaRecorder captures both. The stop/restart
        // cycle below guarantees each resulting webm has its own header
        // so whisper can decode every chunk (not just the first).
        const mixedStream = mixAudioStreams(audioContext, sources)
        audioStreamRef.current = mixedStream
        recordingActiveRef.current = true
        startChunkCycle()
      }

      // Start elapsed timer
      setElapsed(0)
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1)
      }, 1000)

      setStatus('recording')
    } catch {
      setError('screen share cancelled or denied.')
      cleanup()
    }
  }, [cleanup, startChunkCycle])

  const stopRecording = useCallback(async () => {
    // Flip the rolling-chunk flag FIRST so the in-flight recorder's onstop
    // transcribes its final blob but doesn't start a new cycle.
    recordingActiveRef.current = false
    if (chunkTimeoutRef.current) {
      clearTimeout(chunkTimeoutRef.current)
      chunkTimeoutRef.current = null
    }
    // Stop the media recorder (triggers final onstop → last transcribe)
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop()
    }

    cleanup()
    setStatus('processing')

    // Wait a beat for any final chunk transcription to finish
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const fullTranscript = transcriptRef.current

    if (!fullTranscript.trim()) {
      setStatus('idle')
      return null
    }

    try {
      // Extract structured memory
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: fullTranscript }),
      })
      const extractionResult: ExtractionResult = await extractRes.json()
      setExtraction(extractionResult)

      const now = new Date().toISOString()

      // Save episode to Nia (no dedupe — each conversation is its own episode)
      const episode = {
        episode_id: `ep_${Date.now()}`,
        person_ids: extractionResult.people.map(
          (p) => p.name.toLowerCase().replace(/\s+/g, '_')
        ),
        topics: extractionResult.topics,
        promises: extractionResult.promises,
        next_actions: extractionResult.next_actions,
        timestamp: now,
        source: 'screen' as const,
        prose: extractionResult.episode_prose,
      }

      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'episode', data: episode }),
      }).catch((err) => console.error('failed to save episode:', err))

      // Save each person to Nia (dedupe handled server-side in savePersonContext)
      for (const person of extractionResult.people) {
        const personData = {
          person_id: person.name.toLowerCase().replace(/\s+/g, '_'),
          name: person.name.toLowerCase(),
          where_met: 'screen recording',
          summary: person.role_or_context || '',
          open_loops: extractionResult.promises,
          last_seen: now,
          // Seed notes with this session's prose. On first save it becomes
          // the initial content; on dedupe it gets appended to existing notes
          // and the content is regenerated from the merged history.
          notes: person.prose_summary ? [person.prose_summary] : [],
          prose: person.prose_summary,
          // Contact fields captured from transcript (only set when extractor
          // found them explicitly stated). upsertPerson uses COALESCE so
          // undefined values don't clobber existing profile data.
          email: person.email,
          job_title: person.job_title,
          company: person.company,
          linkedin_url: person.linkedin_url,
        }

        await fetch('/api/memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'person', data: personData }),
        }).catch((err) => console.error('failed to save person:', err))
      }

      setStatus('idle')
      return extractionResult
    } catch (err) {
      console.error('extraction/save failed:', err)
      setError('memory extraction failed. transcript was still captured.')
      setStatus('error')
      return null
    }
  }, [cleanup])

  return {
    status,
    elapsed,
    chunks,
    currentTranscript,
    extraction,
    visualPeople,
    error,
    stream,
    isTranscribing,
    startRecording,
    stopRecording,
  }
}
