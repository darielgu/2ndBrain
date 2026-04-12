'use client'

import { useCallback, useRef, useState } from 'react'
import type {
  RecordingStatus,
  TranscriptChunk,
  ExtractionResult,
} from '@/lib/types'

const CHUNK_INTERVAL_MS = 15_000 // 15 seconds per chunk

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
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chunkIndexRef = useRef(0)
  const transcriptRef = useRef('')
  // Track in-flight transcription requests
  const pendingRef = useRef(0)
  const [isTranscribing, setIsTranscribing] = useState(false)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (mediaRecorderRef.current?.state !== 'inactive') {
      try {
        mediaRecorderRef.current?.stop()
      } catch {}
    }
    mediaRecorderRef.current = null
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

      // Check if we actually got audio tracks
      const audioTracks = displayStream.getAudioTracks()
      if (audioTracks.length === 0) {
        setError(
          'no audio track captured. make sure to check "share audio" in the browser dialog.'
        )
        // Still allow recording for video preview, just no transcription
      }

      streamRef.current = displayStream
      setStream(displayStream)

      // Listen for user stopping the share via browser UI
      displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        stopRecording()
      })

      // Set up audio recording if audio tracks available
      if (audioTracks.length > 0) {
        const audioStream = new MediaStream(audioTracks)
        const mimeType = getSupportedMimeType()
        const recorder = new MediaRecorder(audioStream, { mimeType })

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            const index = chunkIndexRef.current++
            transcribeChunk(e.data, index)
          }
        }

        mediaRecorderRef.current = recorder
        recorder.start(CHUNK_INTERVAL_MS)
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
  }, [cleanup, transcribeChunk])

  const stopRecording = useCallback(async () => {
    // Stop the media recorder (triggers final ondataavailable)
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
    error,
    stream,
    isTranscribing,
    startRecording,
    stopRecording,
  }
}
