'use client'

import { useCallback, useRef, useState } from 'react'
import type { TranscriptChunk } from '@/lib/types'

const CHUNK_INTERVAL_MS = 4_000
const MIN_AUDIO_SIZE_BYTES = 1_000
const RETRY_DELAY_MS = 500
const FLUSH_WAIT_STEP_MS = 100
const FLUSH_WAIT_MAX_MS = 8_000

type SpeechRecognitionResult = {
  isFinal: boolean
  0?: { transcript?: string }
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: SpeechRecognitionResult[]
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

type RealtimeEventPayload = {
  type?: string
  item_id?: string
  delta?: string
  transcript?: string
}

const REALTIME_TRANSCRIPTION_URL = 'https://api.openai.com/v1/realtime?intent=transcription'

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
}

function getSupportedMimeType(): string {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const type of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return 'audio/webm'
}

function normalizeMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(';')[0]?.trim()
  if (!normalized) return 'audio/webm'
  if (normalized === 'audio/x-m4a') return 'audio/m4a'
  return normalized
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

function mergeTranscripts(a: string, b: string): string {
  const left = a.trim()
  const right = b.trim()
  if (!left) return right
  if (!right) return left
  if (left.includes(right)) return left
  if (right.includes(left)) return right
  return `${left} ${right}`
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'transcription failed'
}

export function useWebcamAudioTranscript() {
  const [chunks, setChunks] = useState<TranscriptChunk[]>([])
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [durableTranscript, setDurableTranscript] = useState('')
  const [liveTranscript, setLiveTranscript] = useState('')
  const [interimLiveTranscript, setInterimLiveTranscript] = useState('')
  const [isChunkUploading, setIsChunkUploading] = useState(false)
  const [isLiveListening, setIsLiveListening] = useState(false)
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false)
  const [lastTranscribeError, setLastTranscribeError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef(0)
  const activeRef = useRef(false)
  const chunkIndexRef = useRef(0)
  const durableTranscriptRef = useRef('')
  const liveFinalTranscriptRef = useRef('')
  const interimLiveTranscriptRef = useRef('')
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const speechRestartingRef = useRef(false)
  const stopPromiseResolverRef = useRef<(() => void) | null>(null)
  const recorderStopInFlightRef = useRef(false)
  const realtimePcRef = useRef<RTCPeerConnection | null>(null)
  const realtimeDcRef = useRef<RTCDataChannel | null>(null)
  const realtimeInterimByItemRef = useRef<Map<string, string>>(new Map())
  const usingRealtimeRef = useRef(false)

  const syncCurrentTranscript = useCallback(() => {
    const merged = mergeTranscripts(
      mergeTranscripts(durableTranscriptRef.current, liveFinalTranscriptRef.current),
      interimLiveTranscriptRef.current
    )
    setCurrentTranscript(merged)
  }, [])

  const addChunkText = useCallback((text: string, index: number) => {
    if (!text) return
    durableTranscriptRef.current = mergeTranscripts(durableTranscriptRef.current, text)
    setDurableTranscript(durableTranscriptRef.current)
    setChunks((prev) => [
      ...prev,
      { text, timestamp: Date.now(), chunk_index: index },
    ])
    syncCurrentTranscript()
  }, [syncCurrentTranscript])

  const transcribeChunk = useCallback(async (blob: Blob, index: number, attempt: number = 1) => {
    if (blob.size < MIN_AUDIO_SIZE_BYTES) return

    pendingRef.current += 1
    setIsChunkUploading(true)
    setLastTranscribeError(null)

    try {
      const formData = new FormData()
      const mimeType = normalizeMimeType(blob.type || 'audio/webm')
      const ext = extensionForMimeType(mimeType)
      formData.append('audio', new File([blob], `webcam-chunk-${index}.${ext}`, { type: mimeType }))

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errorPayload = (await res.json().catch(() => ({}))) as {
          error?: string
          retryable?: boolean
        }
        const message = errorPayload.error || `transcription failed (${res.status})`
        if (attempt < 2 && errorPayload.retryable !== false) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
          await transcribeChunk(blob, index, attempt + 1)
          return
        }
        setLastTranscribeError(message)
        return
      }

      const json = (await res.json()) as { text?: string }
      const text = json.text?.trim() || ''
      if (text) addChunkText(text, index)
    } catch (err) {
      const message = getErrorMessage(err)
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        await transcribeChunk(blob, index, attempt + 1)
        return
      }
      setLastTranscribeError(message)
      console.error('webcam chunk transcription failed:', err)
    } finally {
      pendingRef.current -= 1
      if (pendingRef.current <= 0) {
        pendingRef.current = 0
        setIsChunkUploading(false)
      }
    }
  }, [addChunkText])

  const clearChunkTimer = useCallback(() => {
    if (!chunkTimerRef.current) return
    clearTimeout(chunkTimerRef.current)
    chunkTimerRef.current = null
  }, [])

  const stopSpeechRecognition = useCallback(() => {
    const recognition = speechRecognitionRef.current
    if (!recognition) return
    recognition.onresult = null
    recognition.onerror = null
    recognition.onend = null
    try {
      recognition.stop()
    } catch {}
    speechRecognitionRef.current = null
    speechRestartingRef.current = false
    setIsLiveListening(false)
  }, [])

  const stopRealtimeTranscription = useCallback(() => {
    realtimeInterimByItemRef.current.clear()
    const dc = realtimeDcRef.current
    if (dc) {
      dc.onmessage = null
      dc.onopen = null
      dc.onclose = null
      try {
        dc.close()
      } catch {}
    }
    realtimeDcRef.current = null

    const pc = realtimePcRef.current
    if (pc) {
      try {
        pc.close()
      } catch {}
    }
    realtimePcRef.current = null

    usingRealtimeRef.current = false
    setIsRealtimeConnected(false)
  }, [])

  const scheduleNextRecorderSegmentRef = useRef<(() => void) | null>(null)

  const startRecorderSegment = useCallback(() => {
    if (usingRealtimeRef.current) return
    if (!activeRef.current || !audioStreamRef.current) return
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') return

    const recorder = new MediaRecorder(audioStreamRef.current, {
      mimeType: getSupportedMimeType(),
    })
    mediaRecorderRef.current = recorder
    let segmentBlob: Blob | null = null

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) segmentBlob = event.data
    }

    recorder.onstop = () => {
      mediaRecorderRef.current = null
      recorderStopInFlightRef.current = false
      clearChunkTimer()
      if (stopPromiseResolverRef.current) {
        stopPromiseResolverRef.current()
        stopPromiseResolverRef.current = null
      }

      const index = chunkIndexRef.current
      chunkIndexRef.current += 1
      if (segmentBlob && segmentBlob.size >= MIN_AUDIO_SIZE_BYTES) {
        void transcribeChunk(segmentBlob, index)
      }

      if (activeRef.current && scheduleNextRecorderSegmentRef.current) {
        scheduleNextRecorderSegmentRef.current()
      }
    }

    recorder.start()
    chunkTimerRef.current = setTimeout(() => {
      if (recorder.state !== 'recording') return
      try {
        recorder.requestData()
      } catch {}
      recorder.stop()
    }, CHUNK_INTERVAL_MS)
  }, [clearChunkTimer, transcribeChunk])

  const scheduleNextRecorderSegment = useCallback(() => {
    if (!activeRef.current) return
    setTimeout(() => {
      if (activeRef.current) startRecorderSegment()
    }, 30)
  }, [startRecorderSegment])

  scheduleNextRecorderSegmentRef.current = scheduleNextRecorderSegment

  const startSpeechRecognition = useCallback(() => {
    if (usingRealtimeRef.current) return
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return

    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      let interimText = ''
      let finalText = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i]?.[0]?.transcript?.trim() || ''
        if (!chunk) continue
        if (event.results[i].isFinal) finalText = mergeTranscripts(finalText, chunk)
        else interimText = mergeTranscripts(interimText, chunk)
      }

      if (finalText) {
        liveFinalTranscriptRef.current = mergeTranscripts(
          liveFinalTranscriptRef.current,
          finalText
        )
        interimLiveTranscriptRef.current = ''
        setInterimLiveTranscript('')
        const idx = chunkIndexRef.current
        chunkIndexRef.current += 1
        setChunks((prev) => [
          ...prev,
          { text: finalText, timestamp: Date.now(), chunk_index: idx },
        ])
      }

      interimLiveTranscriptRef.current = interimText
      setInterimLiveTranscript(interimText)
      const displayLive = mergeTranscripts(liveFinalTranscriptRef.current, interimText)
      setLiveTranscript(displayLive)
      syncCurrentTranscript()
    }

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        setError('microphone speech recognition permission denied.')
      }
    }

    recognition.onend = () => {
      setIsLiveListening(false)
      if (!activeRef.current) return
      if (speechRestartingRef.current) return
      speechRestartingRef.current = true
      setTimeout(() => {
        speechRestartingRef.current = false
        if (!activeRef.current || !speechRecognitionRef.current) return
        try {
          speechRecognitionRef.current.start()
          setIsLiveListening(true)
        } catch {}
      }, 150)
    }

    speechRecognitionRef.current = recognition
    try {
      recognition.start()
      setIsLiveListening(true)
    } catch {}
  }, [syncCurrentTranscript])

  const handleRealtimeEvent = useCallback((payload: RealtimeEventPayload) => {
    const type = payload.type || ''
    const itemId = payload.item_id || ''

    if (type === 'conversation.item.input_audio_transcription.delta') {
      const delta = String(payload.delta || '')
      if (!delta) return
      const prev =
        (itemId ? realtimeInterimByItemRef.current.get(itemId) : undefined) ||
        interimLiveTranscriptRef.current
      const next = `${prev}${delta}`.trim()
      if (itemId) realtimeInterimByItemRef.current.set(itemId, next)
      interimLiveTranscriptRef.current = next
      setInterimLiveTranscript(next)
      setLiveTranscript(mergeTranscripts(liveFinalTranscriptRef.current, next))
      syncCurrentTranscript()
      return
    }

    if (type === 'conversation.item.input_audio_transcription.completed') {
      const completed = String(payload.transcript || '').trim()
      if (!completed) return
      liveFinalTranscriptRef.current = mergeTranscripts(liveFinalTranscriptRef.current, completed)
      if (itemId) realtimeInterimByItemRef.current.delete(itemId)
      interimLiveTranscriptRef.current = ''
      setInterimLiveTranscript('')
      const idx = chunkIndexRef.current
      chunkIndexRef.current += 1
      setChunks((prev) => [
        ...prev,
        { text: completed, timestamp: Date.now(), chunk_index: idx },
      ])
      setLiveTranscript(liveFinalTranscriptRef.current)
      syncCurrentTranscript()
    }
  }, [syncCurrentTranscript])

  const startRealtimeTranscription = useCallback(async (audioStream: MediaStream): Promise<boolean> => {
    try {
      const sessionRes = await fetch('/api/realtime/transcription-session', {
        method: 'POST',
      })
      if (!sessionRes.ok) return false
      const sessionJson = (await sessionRes.json()) as { client_secret?: string }
      const clientSecret = String(sessionJson.client_secret || '')
      if (!clientSecret) return false

      const track = audioStream.getAudioTracks()[0]
      if (!track) return false

      const pc = new RTCPeerConnection()
      pc.addTrack(track, audioStream)
      const dc = pc.createDataChannel('oai-events')

      realtimePcRef.current = pc
      realtimeDcRef.current = dc
      usingRealtimeRef.current = true

      dc.onopen = () => {
        setIsRealtimeConnected(true)
        setIsLiveListening(true)
      }
      dc.onclose = () => {
        setIsRealtimeConnected(false)
        setIsLiveListening(false)
      }
      dc.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data || '{}')) as RealtimeEventPayload
          handleRealtimeEvent(payload)
        } catch {
          // ignore malformed realtime events
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const sdpResponse = await fetch(REALTIME_TRANSCRIPTION_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      })
      if (!sdpResponse.ok) {
        stopRealtimeTranscription()
        return false
      }

      const answerSdp = await sdpResponse.text()
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      })

      return true
    } catch (err) {
      console.error('realtime transcription init failed:', err)
      stopRealtimeTranscription()
      return false
    }
  }, [handleRealtimeEvent, stopRealtimeTranscription])

  const stop = useCallback(() => {
    activeRef.current = false
    clearChunkTimer()
    stopSpeechRecognition()
    stopRealtimeTranscription()

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      recorderStopInFlightRef.current = true
      const stopPromise = new Promise<void>((resolve) => {
        stopPromiseResolverRef.current = resolve
      })
      try {
        mediaRecorderRef.current.requestData()
      } catch {}
      mediaRecorderRef.current.stop()
      void stopPromise.finally(() => {
        stopPromiseResolverRef.current = null
      })
    }
    mediaRecorderRef.current = null

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop())
      audioStreamRef.current = null
    }
  }, [clearChunkTimer, stopRealtimeTranscription, stopSpeechRecognition])

  const waitForFlush = useCallback(async () => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < FLUSH_WAIT_MAX_MS) {
      const recorderDone =
        !recorderStopInFlightRef.current &&
        (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive')
      const pendingDone = pendingRef.current === 0
      if (recorderDone && pendingDone) break
      await new Promise((resolve) => setTimeout(resolve, FLUSH_WAIT_STEP_MS))
    }
    syncCurrentTranscript()
    const finalTranscript = mergeTranscripts(
      mergeTranscripts(durableTranscriptRef.current, liveFinalTranscriptRef.current),
      interimLiveTranscriptRef.current
    )
    return { finalTranscript }
  }, [syncCurrentTranscript])

  const stopAndFlush = useCallback(async () => {
    stop()
    return waitForFlush()
  }, [stop, waitForFlush])

  const startFromStream = useCallback(
    (stream: MediaStream) => {
      stop()
      setError(null)
      setLastTranscribeError(null)
      setChunks([])
      setCurrentTranscript('')
      setDurableTranscript('')
      setLiveTranscript('')
      setInterimLiveTranscript('')
      durableTranscriptRef.current = ''
      liveFinalTranscriptRef.current = ''
      interimLiveTranscriptRef.current = ''
      chunkIndexRef.current = 0
      pendingRef.current = 0
      setIsChunkUploading(false)
      setIsRealtimeConnected(false)
      usingRealtimeRef.current = false

      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) {
        setError('no microphone track available for live transcription.')
        return
      }

      const audioOnly = new MediaStream(audioTracks.map((track) => track.clone()))
      audioStreamRef.current = audioOnly
      activeRef.current = true
      void startRealtimeTranscription(audioOnly).then((started) => {
        if (started) return
        usingRealtimeRef.current = false
        startSpeechRecognition()
        startRecorderSegment()
      })
    },
    [startRealtimeTranscription, startRecorderSegment, startSpeechRecognition, stop]
  )

  return {
    chunks,
    currentTranscript,
    durableTranscript,
    liveTranscript,
    interimLiveTranscript,
    isTranscribing: isChunkUploading,
    isChunkUploading,
    isLiveListening,
    isRealtimeConnected,
    lastTranscribeError,
    error,
    startFromStream,
    stop,
    stopAndFlush,
  }
}
