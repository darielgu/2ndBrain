'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Mic, ScanFace, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MatchCandidate, MatchResponse, RecognitionProfile } from '@/lib/recognition-types'

const RECOGNITION_INTERVAL_MS = 2500
const RECOGNITION_MIN_REQUEST_GAP_MS = 2200
const DEFAULT_RECOGNITION_THRESHOLD = 0.62
const FRAME_CAPTURE_COOLDOWN_MS = 12_000
const RECOGNITION_CREATE_GRACE_MS = 12_000
const NO_CANDIDATE_BEFORE_CREATE = 3
const STABLE_LOW_CONFIDENCE_AUTO_RESOLVE = 3
const LOW_CONFIDENCE_AUTO_RESOLVE_MIN = 0.44
const ENROLLMENT_TARGET_FRAMES = 12
const ENROLLMENT_SAMPLE_GAP_MS = 500
const ENROLLMENT_MAX_WINDOW_MS = 12_000

const HUMAN_MODEL_BASE_PATH = 'https://vladmandic.github.io/human/models'
const FACE_API_MODEL_BASE = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'

type FaceResultLike = {
  score?: number
}

type HumanLike = {
  load: () => Promise<void>
  warmup: () => Promise<void>
  detect: (input: HTMLVideoElement) => Promise<{ face?: FaceResultLike[] }>
}

type FaceApiLike = {
  nets: {
    tinyFaceDetector: { loadFromUri: (uri: string) => Promise<void> }
    faceLandmark68TinyNet: { loadFromUri: (uri: string) => Promise<void> }
    faceRecognitionNet: { loadFromUri: (uri: string) => Promise<void> }
  }
  TinyFaceDetectorOptions: new (opts?: { inputSize?: number; scoreThreshold?: number }) => unknown
  detectSingleFace: (
    input: HTMLVideoElement | HTMLCanvasElement,
    options?: unknown
  ) => {
    withFaceLandmarks: (useTiny?: boolean) => {
      withFaceDescriptor: () => Promise<{ descriptor?: Float32Array } | null>
    }
  }
}

type RecognitionStatus =
  | 'idle'
  | 'recognizing'
  | 'low_confidence'
  | 'resolved'
  | 'creating_profile'
  | 'error'

interface LiveRecognitionPanelProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  active: boolean
  transcript: string
  isTranscribing: boolean
  overlay?: boolean
  onProfileChange?: (profile: RecognitionProfile | null) => void
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
  })
  return Promise.race([task, timeout])
}

function sanitizeName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'new contact'
  return trimmed
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ')
}

function isPlaceholderName(value: string | undefined | null): boolean {
  const normalized = sanitizeName(value || '').toLowerCase()
  return (
    !normalized ||
    normalized === 'new contact' ||
    normalized === 'unknown' ||
    normalized === 'n/a' ||
    normalized.startsWith('pid_')
  )
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
    if (!clean) continue
    const wordCount = clean.split(' ').length
    if (wordCount > 4) continue
    return toTitleCase(clean)
  }

  return ''
}

function canRefineName(profile: RecognitionProfile | null, nextName: string): boolean {
  if (!profile) return false
  if (profile.name_confirmed) return false
  const normalized = sanitizeName(nextName).toLowerCase()
  if (!normalized || normalized === 'new contact') return false
  const current = sanitizeName(profile.name).toLowerCase()
  return normalized !== current
}

function createPid(): string {
  return `pid_${Date.now().toString(36)}`
}

function formatLocation(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

type GeoSnapshot = {
  place: string
  coords: string
}

function isGenericWhereMet(value: string | undefined): boolean {
  const normalized = (value || '').trim().toLowerCase()
  return (
    !normalized ||
    normalized === 'unknown' ||
    normalized === 'live recognition' ||
    normalized === 'live webcam session'
  )
}

function resolveWhereMet(current: string | undefined, location: GeoSnapshot | null): string {
  if (location?.place && isGenericWhereMet(current)) return location.place
  return current || location?.place || 'live webcam session'
}

async function getCurrentLocation(): Promise<GeoSnapshot | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 60_000,
      })
    })
    const lat = position.coords.latitude
    const lon = position.coords.longitude
    const coords = formatLocation(
      position.coords.latitude,
      position.coords.longitude
    )
    let place = coords

    try {
      const res = await fetch(
        `/api/geocode/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`
      )
      if (res.ok) {
        const json = (await res.json()) as { place?: string }
        const nextPlace = String(json.place || '').trim()
        if (nextPlace) place = nextPlace
      }
    } catch {
      // Coordinates still provide a precise fallback when reverse geocoding fails.
    }

    return { place, coords }
  } catch {
    return null
  }
}

function buildPersonPayload(profile: RecognitionProfile) {
  const nowLabel = new Date().toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const narrative = `${profile.name} was recognized in a live webcam session on ${nowLabel}. They were met at ${profile.where_met || 'an unknown place'} and the current summary is ${profile.summary || 'not yet captured'}. Last contact location: ${profile.last_location || 'not captured'}.`

  return {
    person_id: profile.person_id,
    name: profile.name,
    where_met: profile.where_met,
    summary: profile.summary,
    open_loops: profile.open_loops,
    last_seen: new Date().toISOString(),
    notes: [
      narrative,
      profile.last_conversation_summary || '',
    ].filter(Boolean),
    prose: narrative,
  }
}

function formatLastMet(profile: RecognitionProfile | null): string {
  if (!profile) return 'unknown'
  const where = String(profile.where_met || '').trim()
  if (where) return where
  if (profile.last_seen) {
    try {
      return new Date(profile.last_seen).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    } catch {
      return profile.last_seen
    }
  }
  return 'unknown'
}

function buildNiaAgentLine(profile: RecognitionProfile | null): string {
  if (!profile) return 'say: good to see you.'
  const name = profile.name || 'there'
  const openLoop = profile.open_loops?.[0]
  const summary = (profile.summary || '').trim()
  if (openLoop) {
    return `say: hey ${name}, i still owe you ${openLoop}.`
  }
  if (summary) {
    return `say: hey ${name}, good to see you again.`
  }
  return `say: hey ${name}, great to reconnect.`
}

async function extractNameFromTranscript(transcript: string): Promise<string> {
  const cleanedTranscript = transcript.trim()
  if (!cleanedTranscript) return 'new contact'

  const extractRes = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript: cleanedTranscript }),
  })

  if (!extractRes.ok) return 'new contact'

  const extracted = (await extractRes.json()) as {
    people?: { name?: string }[]
  }

  const candidateName = extracted.people?.[0]?.name || ''
  return sanitizeName(candidateName)
}

function signatureFromVideo(video: HTMLVideoElement): number[] {
  const canvas = document.createElement('canvas')
  const width = 64
  const height = 64
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []

  ctx.drawImage(video, 0, 0, width, height)
  const data = ctx.getImageData(0, 0, width, height).data

  const cells = 4
  const signature: number[] = []
  const cellW = Math.floor(width / cells)
  const cellH = Math.floor(height / cells)

  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      let sum = 0
      let count = 0
      const startX = x * cellW
      const startY = y * cellH
      for (let yy = startY; yy < startY + cellH; yy++) {
        for (let xx = startX; xx < startX + cellW; xx++) {
          const i = (yy * width + xx) * 4
          const r = data[i] / 255
          const g = data[i + 1] / 255
          const b = data[i + 2] / 255
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
          sum += lum
          count++
        }
      }
      signature.push(count > 0 ? sum / count : 0)
    }
  }

  return signature
}

function frameDataUrlFromVideo(video: HTMLVideoElement): string | null {
  const width = video.videoWidth
  const height = video.videoHeight
  if (width === 0 || height === 0) return null

  const targetWidth = Math.min(640, width)
  const targetHeight = Math.max(1, Math.round((targetWidth / width) * height))
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(video, 0, 0, targetWidth, targetHeight)
  return canvas.toDataURL('image/jpeg', 0.78)
}

function hasVisibleFrame(signature: number[]): boolean {
  if (signature.length === 0) return false
  const mean = signature.reduce((sum, value) => sum + value, 0) / signature.length
  const variance =
    signature.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    signature.length
  // Keep this permissive; lighting can be poor in demos.
  if (mean < 0.005) return false
  if (variance < 0.000001) return false
  return true
}

const HUMAN_CONFIG = {
  backend: 'webgl',
  modelBasePath: HUMAN_MODEL_BASE_PATH,
  face: {
    enabled: true,
    detector: {
      enabled: true,
      maxDetected: 1,
      rotation: false,
    },
    description: { enabled: true },
    mesh: { enabled: false },
    iris: { enabled: false },
    emotion: { enabled: false },
    antispoof: { enabled: false },
    liveness: { enabled: false },
    attention: { enabled: false },
  },
  hand: { enabled: false },
  body: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
}

export function LiveRecognitionPanel({
  videoRef,
  active,
  transcript,
  isTranscribing,
  overlay = false,
  onProfileChange,
}: LiveRecognitionPanelProps) {
  const [status, setStatus] = useState<RecognitionStatus>('idle')
  const [mockMode, setMockMode] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confidence, setConfidence] = useState<number | null>(null)
  const [candidates, setCandidates] = useState<MatchCandidate[]>([])
  const [profile, setProfile] = useState<RecognitionProfile | null>(null)
  const [inferredName, setInferredName] = useState<string>('')
  const [streamName, setStreamName] = useState('')
  const [streamContext, setStreamContext] = useState('')
  const [streamOpenLoop, setStreamOpenLoop] = useState('')
  const [enrichmentSyncing, setEnrichmentSyncing] = useState(false)
  const [collapsed, setCollapsed] = useState(overlay)

  const runningRef = useRef(false)
  const lastAnnouncedRef = useRef<string | null>(null)
  const statusRef = useRef<RecognitionStatus>('idle')
  const lastRequestAtRef = useRef(0)
  const humanRef = useRef<HumanLike | null>(null)
  const humanInitRef = useRef<Promise<void> | null>(null)
  const faceApiRef = useRef<FaceApiLike | null>(null)
  const faceApiInitRef = useRef<Promise<void> | null>(null)
  const conversationSyncInFlightRef = useRef(false)
  const lastSyncedTranscriptLenRef = useRef(0)
  const lastSyncedPersonRef = useRef<string | null>(null)
  const lastNameNetworkExtractAtRef = useRef(0)
  const lastNameNetworkExtractLenRef = useRef(0)
  const lastFrameCaptureAtRef = useRef<Record<string, number>>({})
  const enrichmentInFlightRef = useRef<Set<string>>(new Set())
  const tipsFetchedPersonIdsRef = useRef<Set<string>>(new Set())
  const recognitionSessionStartAtRef = useRef(0)
  const noCandidateStreakRef = useRef(0)
  const stableTopCandidateRef = useRef<{ personId: string; streak: number } | null>(null)

  const loadHuman = useCallback(async () => {
    if (humanRef.current) return
    if (!humanInitRef.current) {
      humanInitRef.current = (async () => {
        const mod = await import('@vladmandic/human')
        const HumanCtor = mod.Human as unknown as new (
          config: typeof HUMAN_CONFIG
        ) => HumanLike
        const human = new HumanCtor(HUMAN_CONFIG)
        await human.load()
        await human.warmup()
        humanRef.current = human
      })()
    }
    await humanInitRef.current
  }, [])

  const loadFaceApi = useCallback(async () => {
    if (faceApiRef.current) return
    if (!faceApiInitRef.current) {
      faceApiInitRef.current = (async () => {
        const tf = await import('@tensorflow/tfjs-core')
        await import('@tensorflow/tfjs-backend-webgl')
        await tf.setBackend('webgl').catch(() => tf.setBackend('cpu'))
        await tf.ready()
        const mod = await import('@vladmandic/face-api')
        const faceapi = mod as unknown as FaceApiLike
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_BASE),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_API_MODEL_BASE),
          faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_BASE),
        ])
        faceApiRef.current = faceapi
      })()
    }
    await faceApiInitRef.current
  }, [])

  const clearStream = useCallback(() => {
    setStreamName('')
    setStreamContext('')
    setStreamOpenLoop('')
  }, [])

  const streamProfile = useCallback(async (nextProfile: RecognitionProfile) => {
    clearStream()
    setStreamName(nextProfile.name)
    await wait(220)
    const locationLine = nextProfile.last_location
      ? ` • location ${nextProfile.last_location}`
      : ''
    setStreamContext(
      [nextProfile.where_met, nextProfile.summary].filter(Boolean).join(' • ') + locationLine
    )
    await wait(220)
    setStreamOpenLoop(nextProfile.open_loops?.[0] || 'no open loop yet')
  }, [clearStream])

  const syncConversationMemory = useCallback(async () => {
    if (!profile || conversationSyncInFlightRef.current) return
    const trimmed = transcript.trim()
    if (trimmed.length < 120) return

    if (lastSyncedPersonRef.current !== profile.person_id) {
      lastSyncedPersonRef.current = profile.person_id
      lastSyncedTranscriptLenRef.current = 0
    }

    if (trimmed.length - lastSyncedTranscriptLenRef.current < 280) return
    conversationSyncInFlightRef.current = true
    const prevLen = lastSyncedTranscriptLenRef.current
    lastSyncedTranscriptLenRef.current = trimmed.length

    try {
      const res = await fetch('/api/recognition/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_id: profile.person_id,
          name: profile.name,
          name_confirmed: profile.name_confirmed,
          where_met: profile.where_met,
          summary: profile.summary,
          open_loops: profile.open_loops,
          last_location: profile.last_location,
          transcript: trimmed,
        }),
      })

      if (!res.ok) {
        lastSyncedTranscriptLenRef.current = prevLen
        return
      }

      const json = (await res.json()) as { profile?: RecognitionProfile }
      if (json.profile) {
        setProfile(json.profile)
        await streamProfile(json.profile)
      }
    } catch (err) {
      console.error('conversation sync failed:', err)
      lastSyncedTranscriptLenRef.current = prevLen
    } finally {
      conversationSyncInFlightRef.current = false
    }
  }, [profile, streamProfile, transcript])

  const announce = useCallback((nextProfile: RecognitionProfile) => {
    if (!ttsEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return
    }
    const firstLoop = nextProfile.open_loops?.[0]
    if (!firstLoop) return
    if (lastAnnouncedRef.current === nextProfile.person_id) return

    const utterance = new SpeechSynthesisUtterance(
      `That's ${nextProfile.name}. You owe ${firstLoop}.`
    )
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    lastAnnouncedRef.current = nextProfile.person_id
  }, [ttsEnabled])

  const fetchProfile = useCallback(async (personId: string): Promise<RecognitionProfile | null> => {
    const res = await fetch(`/api/recognition/profiles/${personId}`)
    if (!res.ok) return null
    const json = (await res.json()) as { profile?: RecognitionProfile }
    return json.profile || null
  }, [])

  const fetchNiaTips = useCallback(
    async (personId: string): Promise<Partial<RecognitionProfile> | null> => {
      const res = await fetch(
        `/api/recognition/tips?person_id=${encodeURIComponent(personId)}`
      )
      if (!res.ok) return null
      const json = (await res.json()) as {
        tip?: {
          name?: string
          where_met?: string
          summary?: string
          open_loops?: string[]
          last_conversation_summary?: string
          last_seen?: string
          last_location?: string
        }
      }
      if (!json.tip) return null
      return {
        name: json.tip.name || undefined,
        where_met: json.tip.where_met || undefined,
        summary: json.tip.summary || undefined,
        open_loops: json.tip.open_loops || undefined,
        last_conversation_summary: json.tip.last_conversation_summary || undefined,
        last_seen: json.tip.last_seen || undefined,
        last_location: json.tip.last_location || undefined,
      }
    },
    []
  )

  const saveProfileToMemory = useCallback(async (nextProfile: RecognitionProfile) => {
    await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'person',
        data: buildPersonPayload(nextProfile),
      }),
    }).catch((err) => {
      console.error('save person to memory failed:', err)
    })
  }, [])

  const enrollFaceVectors = useCallback(
    async (
      nextProfile: RecognitionProfile,
      embeddings: number[],
      signature?: number[]
    ) => {
    if (embeddings.length < 8) return
    await fetch('/api/recognition/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person_id: nextProfile.person_id,
        name: nextProfile.name,
        name_confirmed: nextProfile.name_confirmed,
        where_met: nextProfile.where_met,
        summary: nextProfile.summary,
        open_loops: nextProfile.open_loops,
        last_location: nextProfile.last_location,
        embedding: embeddings,
        signature,
        quality: 1,
      }),
    })
    },
    []
  )

  const upsertLocation = useCallback(async (nextProfile: RecognitionProfile, location: GeoSnapshot | null) => {
    if (!location) return nextProfile
    const nextWhereMet = resolveWhereMet(nextProfile.where_met, location)
    const res = await fetch('/api/recognition/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person_id: nextProfile.person_id,
        name: nextProfile.name,
        name_confirmed: nextProfile.name_confirmed,
        where_met: nextWhereMet,
        summary: nextProfile.summary,
        open_loops: nextProfile.open_loops,
        last_location: location.coords,
      }),
    })
    if (!res.ok) return nextProfile
    const json = (await res.json()) as { profile?: RecognitionProfile }
    return json.profile || nextProfile
  }, [])

  const extractEmbedding = useCallback(async (video: HTMLVideoElement) => {
    try {
      await loadHuman()
      await loadFaceApi()
      const human = humanRef.current
      const faceapi = faceApiRef.current
      if (!human || !faceapi) return []

      const humanResult = await human.detect(video)
      if (!humanResult.face || humanResult.face.length === 0) return []

      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: 224,
        scoreThreshold: 0.4,
      })
      const detection = await faceapi
        .detectSingleFace(video, options)
        .withFaceLandmarks(true)
        .withFaceDescriptor()

      const descriptor = detection?.descriptor
      if (!descriptor) return []
      const vector = Array.from(descriptor).filter((value) => Number.isFinite(value))
      if (vector.length !== 128) return []
      return vector
    } catch (err) {
      console.error('face embedding extraction failed:', err)
      return []
    }
  }, [loadFaceApi, loadHuman])

  const collectEnrollmentEmbeddings = useCallback(async (
    video: HTMLVideoElement,
    seedEmbedding: number[]
  ): Promise<number[][]> => {
    const collected: number[][] = []
    if (seedEmbedding.length === 128) {
      collected.push(seedEmbedding)
    }
    const startedAt = Date.now()
    while (
      active &&
      collected.length < ENROLLMENT_TARGET_FRAMES &&
      Date.now() - startedAt < ENROLLMENT_MAX_WINDOW_MS
    ) {
      await wait(ENROLLMENT_SAMPLE_GAP_MS)
      const next = await extractEmbedding(video)
      if (next.length !== 128) continue
      const duplicate = collected.some((row) => {
        let dot = 0
        let normA = 0
        let normB = 0
        for (let i = 0; i < 128; i++) {
          dot += row[i] * next[i]
          normA += row[i] * row[i]
          normB += next[i] * next[i]
        }
        if (normA === 0 || normB === 0) return false
        const cosine = dot / (Math.sqrt(normA) * Math.sqrt(normB))
        return cosine > 0.9995
      })
      if (!duplicate) collected.push(next)
    }
    return collected
  }, [active, extractEmbedding])

  const captureProfileFrame = useCallback(async (
    nextProfile: RecognitionProfile,
    confidenceValue: number | null,
    source: 'auto_resolved' | 'manual_confirmed'
  ) => {
    const video = videoRef.current
    if (!video) return

    const now = Date.now()
    const lastCaptured = lastFrameCaptureAtRef.current[nextProfile.person_id] || 0
    if (now - lastCaptured < FRAME_CAPTURE_COOLDOWN_MS) return

    if (
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return
    }

    const signature = signatureFromVideo(video)
    if (!hasVisibleFrame(signature)) return

    const frameDataUrl = frameDataUrlFromVideo(video)
    if (!frameDataUrl) return

    lastFrameCaptureAtRef.current[nextProfile.person_id] = now
    try {
      await fetch('/api/recognition/frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_id: nextProfile.person_id,
          frame_data_url: frameDataUrl,
          confidence: confidenceValue,
          source,
          signature,
        }),
      })
    } catch (err) {
      console.error('frame capture upload failed:', err)
    }
  }, [videoRef])

  const createProfileFromTranscript = useCallback(async (embedding: number[], signature: number[]): Promise<RecognitionProfile> => {
    setStatus('creating_profile')
    const heuristicName = extractNameHeuristic(transcript)
    const extractedName =
      inferredName ||
      heuristicName ||
      (await extractNameFromTranscript(transcript).catch(() => 'new contact'))
    const location = await getCurrentLocation()
    const person_id = createPid()
    const whereMet = resolveWhereMet(undefined, location)

    const createRes = await fetch('/api/recognition/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person_id,
        name: extractedName,
        name_confirmed: false,
        where_met: whereMet,
        summary: 'created from live recognition fallback',
        open_loops: [],
        last_location: location?.coords || '',
      }),
    })

    if (!createRes.ok) {
      throw new Error('failed to create profile')
    }

    const created = (await createRes.json()) as { profile: RecognitionProfile }
    const profileWithLocation = await upsertLocation(created.profile, location)
    if (embedding.length === 128) {
      await enrollFaceVectors(profileWithLocation, embedding, signature)
    }
    await saveProfileToMemory(profileWithLocation)
    return profileWithLocation
  }, [enrollFaceVectors, inferredName, saveProfileToMemory, transcript, upsertLocation])

  const resolveCandidate = useCallback(async (
    candidate: MatchCandidate,
    embedding: number[],
    signature: number[],
    source: 'auto_resolved' | 'manual_confirmed' = 'auto_resolved'
  ) => {
    setError(null)
    setStatus('recognizing')

    let nextProfile = candidate.person_id
      ? await fetchProfile(candidate.person_id)
      : null

    if (!nextProfile && candidate.person_id) {
      const seededLocation = await getCurrentLocation()
      const createRes = await fetch('/api/recognition/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_id: candidate.person_id,
          name: candidate.name,
          name_confirmed: true,
          where_met: resolveWhereMet(candidate.where_met, seededLocation),
          summary: candidate.summary || '',
          open_loops: candidate.open_loops || [],
          last_location: seededLocation?.coords || '',
        }),
      })
      if (createRes.ok) {
        const created = (await createRes.json()) as { profile: RecognitionProfile }
        nextProfile = created.profile
      }
    }

    if (!nextProfile) {
      nextProfile = await createProfileFromTranscript(embedding, signature)
    }

    const resolvedProfile: RecognitionProfile = {
      ...nextProfile,
      where_met: candidate.where_met || nextProfile.where_met,
      summary: candidate.summary || nextProfile.summary,
      open_loops: candidate.open_loops || nextProfile.open_loops,
      last_conversation_summary:
        candidate.last_conversation_summary || nextProfile.last_conversation_summary,
    }

    setProfile(resolvedProfile)
    setInferredName('')
    if (overlay) setCollapsed(false)
    setConfidence(candidate.confidence)
    console.info('[recognition] ui_resolved', {
      person_id: resolvedProfile.person_id,
      confidence: candidate.confidence,
      source,
    })
    await streamProfile(resolvedProfile)
    announce(resolvedProfile)
    setCandidates([])
    setStatus('resolved')

    if (enrichmentInFlightRef.current.has(resolvedProfile.person_id)) return
    enrichmentInFlightRef.current.add(resolvedProfile.person_id)
    setEnrichmentSyncing(true)

    void (async () => {
      try {
        console.info('[recognition] enrich_started', {
          person_id: resolvedProfile.person_id,
        })
        const shouldFetchTips =
          Boolean(candidate.person_id) &&
          candidate.person_id === resolvedProfile.person_id &&
          !tipsFetchedPersonIdsRef.current.has(resolvedProfile.person_id)
        const [location, niaTips] = await Promise.all([
          withTimeout(getCurrentLocation(), 1100, 'geocode').catch(() => null),
          shouldFetchTips
            ? withTimeout(fetchNiaTips(resolvedProfile.person_id), 1500, 'nia tips').catch(() => null)
            : Promise.resolve(null),
        ])
        if (niaTips && shouldFetchTips) {
          tipsFetchedPersonIdsRef.current.add(resolvedProfile.person_id)
        }
        console.info('[recognition] tips_completed', {
          person_id: resolvedProfile.person_id,
          has_tips: Boolean(niaTips),
        })

        const profileWithLocation = await withTimeout(
          upsertLocation(resolvedProfile, location),
          2000,
          'profile location upsert'
        ).catch(() => resolvedProfile)

        const enrichedProfile: RecognitionProfile = {
          ...profileWithLocation,
          name: niaTips?.name || profileWithLocation.name,
          where_met: niaTips?.where_met || profileWithLocation.where_met,
          summary: niaTips?.summary || profileWithLocation.summary,
          open_loops: niaTips?.open_loops || profileWithLocation.open_loops,
          last_conversation_summary:
            niaTips?.last_conversation_summary ||
            profileWithLocation.last_conversation_summary,
          last_seen: niaTips?.last_seen || profileWithLocation.last_seen,
          last_location: niaTips?.last_location || profileWithLocation.last_location,
        }

        setProfile(enrichedProfile)
        await streamProfile(enrichedProfile)

        await Promise.allSettled([
          withTimeout((async () => {
            const video = videoRef.current
            if (!video) return
            const vectors = await collectEnrollmentEmbeddings(video, embedding)
            if (vectors.length === 0) return
            await fetch('/api/recognition/enroll', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                person_id: enrichedProfile.person_id,
                name: enrichedProfile.name,
                name_confirmed: enrichedProfile.name_confirmed,
                where_met: enrichedProfile.where_met,
                summary: enrichedProfile.summary,
                open_loops: enrichedProfile.open_loops,
                last_location: enrichedProfile.last_location,
                embeddings: vectors,
                signature,
                quality: 1,
              }),
            })
          })(), 14_000, 'enroll vectors'),
          withTimeout(saveProfileToMemory(enrichedProfile), 2200, 'save memory'),
          withTimeout(
            captureProfileFrame(enrichedProfile, candidate.confidence, source),
            2200,
            'capture frame'
          ),
        ])
        console.info('[recognition] enrich_completed', {
          person_id: resolvedProfile.person_id,
        })
      } catch (err) {
        console.error('post-resolve enrichment failed:', err)
      } finally {
        enrichmentInFlightRef.current.delete(resolvedProfile.person_id)
        setEnrichmentSyncing(false)
      }
    })()
  }, [announce, captureProfileFrame, collectEnrollmentEmbeddings, createProfileFromTranscript, fetchNiaTips, fetchProfile, saveProfileToMemory, streamProfile, upsertLocation, videoRef])

  const runRecognition = useCallback(async () => {
    if (runningRef.current || !active || !videoRef.current) return
    const now = Date.now()
    if (now - lastRequestAtRef.current < RECOGNITION_MIN_REQUEST_GAP_MS) return

    const video = videoRef.current
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return
    }

    runningRef.current = true
    lastRequestAtRef.current = now
    if (recognitionSessionStartAtRef.current === 0) {
      recognitionSessionStartAtRef.current = now
    }
    setError(null)
    setStatus('recognizing')

    try {
      const signature = signatureFromVideo(video)
      if (!hasVisibleFrame(signature)) {
        // Wait for better frame lighting instead of hard-failing the session.
        return
      }
      const embedding = mockMode ? [] : await extractEmbedding(video)
      const res = await fetch('/api/recognition/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embedding,
          threshold: DEFAULT_RECOGNITION_THRESHOLD,
          mockMode,
        }),
      })

      if (!res.ok) {
        throw new Error('recognition request failed')
      }

      const result = (await res.json()) as MatchResponse
      console.info('[recognition] match_received', {
        has_match: Boolean(result.match),
        candidates: result.candidates?.length || 0,
      })
      const topCandidates = (result.candidates || []).slice(0, 3)
      setCandidates(topCandidates)

      if (result.match) {
        noCandidateStreakRef.current = 0
        stableTopCandidateRef.current = null
        await resolveCandidate(result.match, embedding, signature, 'auto_resolved')
        return
      }

      if (topCandidates.length > 0) {
        noCandidateStreakRef.current = 0
        const top = topCandidates[0]
        setConfidence(top.confidence)
        if (top.person_id) {
          const prev = stableTopCandidateRef.current
          if (prev?.personId === top.person_id) {
            stableTopCandidateRef.current = { personId: top.person_id, streak: prev.streak + 1 }
          } else {
            stableTopCandidateRef.current = { personId: top.person_id, streak: 1 }
          }

          const stable = stableTopCandidateRef.current
          if (
            stable &&
            stable.streak >= STABLE_LOW_CONFIDENCE_AUTO_RESOLVE &&
            top.confidence >= LOW_CONFIDENCE_AUTO_RESOLVE_MIN
          ) {
            await resolveCandidate(top, embedding, signature, 'auto_resolved')
            return
          }
        }
        setStatus('low_confidence')
        return
      }

      stableTopCandidateRef.current = null
      noCandidateStreakRef.current += 1
      const elapsed = now - recognitionSessionStartAtRef.current
      if (
        elapsed < RECOGNITION_CREATE_GRACE_MS ||
        noCandidateStreakRef.current < NO_CANDIDATE_BEFORE_CREATE
      ) {
        setStatus('recognizing')
        return
      }

      const created = await createProfileFromTranscript(embedding, signature)
      await captureProfileFrame(created, null, 'auto_resolved')
      setProfile(created)
      setInferredName('')
      if (overlay) setCollapsed(false)
      setConfidence(null)
      await streamProfile(created)
      announce(created)
      setCandidates([])
      setStatus('resolved')
      void (async () => {
        try {
          const videoEl = videoRef.current
          if (!videoEl) return
          const vectors = await collectEnrollmentEmbeddings(videoEl, embedding)
          if (vectors.length === 0) return
          await fetch('/api/recognition/enroll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              person_id: created.person_id,
              name: created.name,
              name_confirmed: created.name_confirmed,
              where_met: created.where_met,
              summary: created.summary,
              open_loops: created.open_loops,
              last_location: created.last_location,
              embeddings: vectors,
              signature,
              quality: 1,
            }),
          })
        } catch (err) {
          console.error('fallback profile enrollment failed:', err)
        }
      })()
    } catch (err) {
      console.error(err)
      setError('recognition failed. try again.')
      setStatus('error')
    } finally {
      runningRef.current = false
    }
  }, [active, announce, captureProfileFrame, collectEnrollmentEmbeddings, createProfileFromTranscript, extractEmbedding, mockMode, overlay, resolveCandidate, streamProfile, videoRef])

  const statusLabel = useMemo(() => {
    if (enrichmentSyncing && status === 'resolved') return 'identity resolved • syncing tips/memory'
    if (status === 'recognizing') return 'recognition in progress'
    if (status === 'creating_profile') return 'creating profile from live transcript'
    if (status === 'low_confidence') return 'low confidence - confirm identity'
    if (status === 'resolved') return 'identity resolved'
    if (status === 'error') return 'recognition error'
    return 'waiting for recognition'
  }, [enrichmentSyncing, status])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    onProfileChange?.(profile)
  }, [onProfileChange, profile])

  useEffect(() => {
    if (!active || mockMode) return
    Promise.all([loadHuman(), loadFaceApi()]).catch((err) => {
      console.error('face model initialization failed:', err)
      setError('face model init failed, using fallback matching')
    })
  }, [active, loadFaceApi, loadHuman, mockMode])

  useEffect(() => {
    if (!overlay) setCollapsed(false)
  }, [overlay])

  useEffect(() => {
    if (!active) return
    if (profile?.person_id) return
    const trimmed = transcript.trim()
    if (trimmed.length < 20) return

    const heuristicName = extractNameHeuristic(trimmed)
    if (heuristicName) {
      setInferredName(heuristicName)
      if (canRefineName(profile, heuristicName)) {
        fetch('/api/recognition/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            person_id: profile?.person_id,
            name: heuristicName,
            name_confirmed: false,
            where_met: profile?.where_met,
            summary: profile?.summary,
            open_loops: profile?.open_loops || [],
            last_location: profile?.last_location || '',
          }),
        })
          .then(async (res) => {
            if (!res.ok) return
            const json = (await res.json()) as { profile?: RecognitionProfile }
            if (json.profile) setProfile(json.profile)
          })
          .catch((err) => console.error('profile name refinement failed:', err))
      }
      return
    }

    const now = Date.now()
    if (trimmed.length - lastNameNetworkExtractLenRef.current < 120) return
    if (now - lastNameNetworkExtractAtRef.current < 6_000) return

    const timeout = setTimeout(() => {
      lastNameNetworkExtractAtRef.current = Date.now()
      lastNameNetworkExtractLenRef.current = trimmed.length
      extractNameFromTranscript(trimmed)
        .then((name) => {
          if (name && !isPlaceholderName(name)) {
            setInferredName(name)
            if (canRefineName(profile, name)) {
              fetch('/api/recognition/profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  person_id: profile?.person_id,
                  name,
                  name_confirmed: false,
                  where_met: profile?.where_met,
                  summary: profile?.summary,
                  open_loops: profile?.open_loops || [],
                  last_location: profile?.last_location || '',
                }),
              })
                .then(async (res) => {
                  if (!res.ok) return
                  const json = (await res.json()) as { profile?: RecognitionProfile }
                  if (json.profile) setProfile(json.profile)
                })
                .catch((err) => console.error('profile name refinement failed:', err))
            }
          }
        })
        .catch((err) => {
          console.error('continuous extraction failed:', err)
        })
    }, 1200)

    return () => clearTimeout(timeout)
  }, [active, profile?.person_id, profile, transcript])

  useEffect(() => {
    if (!active) {
      setStatus('idle')
      setCandidates([])
      setConfidence(null)
      setError(null)
      setProfile(null)
      setInferredName('')
      setEnrichmentSyncing(false)
      enrichmentInFlightRef.current.clear()
      tipsFetchedPersonIdsRef.current.clear()
      lastFrameCaptureAtRef.current = {}
      lastSyncedTranscriptLenRef.current = 0
      lastSyncedPersonRef.current = null
      conversationSyncInFlightRef.current = false
      lastNameNetworkExtractAtRef.current = 0
      lastNameNetworkExtractLenRef.current = 0
      recognitionSessionStartAtRef.current = 0
      noCandidateStreakRef.current = 0
      stableTopCandidateRef.current = null
      clearStream()
      return
    }

    runRecognition()

    const intervalId = setInterval(() => {
      const currentStatus = statusRef.current
      if (
        !runningRef.current &&
        currentStatus !== 'resolved' &&
        currentStatus !== 'creating_profile'
      ) {
        runRecognition()
      }
    }, RECOGNITION_INTERVAL_MS)

    return () => {
      clearInterval(intervalId)
    }
  }, [active, clearStream, runRecognition])

  useEffect(() => {
    if (!active || !profile || mockMode) return
    const timeout = setTimeout(() => {
      syncConversationMemory().catch((err) => {
        console.error('conversation memory sync error:', err)
      })
    }, 2200)
    return () => clearTimeout(timeout)
  }, [active, mockMode, profile, syncConversationMemory, transcript])

  if (overlay) {
    return (
      <div className="micro-enter flex w-full items-start justify-between gap-2">
        <Card className="w-[min(380px,48vw)] rounded-none border-white/20 bg-white/10 shadow-none backdrop-blur-md">
          <CardHeader className="gap-1 px-3 py-2">
            <CardTitle className="text-[10px] uppercase tracking-widest text-white/70">nia tips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 px-3 pb-3 text-[11px] lowercase text-white/90">
            <p className="truncate">
              <span className="text-white/65">summary:</span> {profile?.summary || 'no summary yet'}
            </p>
            <p className="truncate">
              <span className="text-white/65">open loop:</span> {profile?.open_loops?.[0] || 'no open loop'}
            </p>
            <p className="truncate">
              <span className="text-white/65">agent line:</span> {buildNiaAgentLine(profile)}
            </p>
            {error ? <p className="text-red-300">{error}</p> : null}
          </CardContent>
        </Card>

        <Card className="w-[min(340px,44vw)] rounded-none border-white/20 bg-white/10 shadow-none backdrop-blur-md">
          <CardContent className="space-y-2 px-3 py-3">
            <div className="flex items-center gap-2 border border-white/20 bg-black/25 px-2.5 py-1.5 text-[11px] lowercase text-white/85">
              <span className="relative inline-flex h-4 w-4 items-center justify-center">
                <ScanFace className="h-4 w-4 text-white" />
                {active ? (
                  <span className="micro-pulse-dot absolute -right-0.5 -top-0.5 h-1.5 w-1.5 bg-accent" />
                ) : null}
              </span>
              <span className="truncate">{statusLabel}</span>
              {confidence !== null ? (
                <span className="ml-auto font-mono text-[10px]">
                  {(confidence * 100).toFixed(1)}%
                </span>
              ) : null}
            </div>

            <div className="space-y-1.5 border border-white/20 bg-black/25 px-2.5 py-2 text-[11px] lowercase text-white/90">
              <p className="truncate">
                <span className="text-white/65">name:</span> {profile?.name || '...'}
              </p>
              <p className="truncate">
                <span className="text-white/65">last met:</span> {formatLastMet(profile)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <Card
      className={
        'rounded-none border-border bg-background/40 shadow-none'
      }
    >
      <CardHeader className={overlay ? 'gap-1 px-3 py-3' : 'gap-1 px-4 py-4'}>
        <CardTitle className="flex items-center justify-between text-sm lowercase">
          <span className="flex items-center gap-2">
            <span className="relative inline-flex h-4 w-4 items-center justify-center">
              <ScanFace className="h-4 w-4 text-accent" />
              {active ? (
                <span className="micro-pulse-dot absolute -right-0.5 -top-0.5 h-1.5 w-1.5 bg-accent" />
              ) : null}
            </span>
            {profile?.name || 'live recognition'}
          </span>
          <span className="flex items-center">
            {overlay ? (
              <button
                type="button"
                onClick={() => setCollapsed((prev) => !prev)}
                className="border border-border bg-background/50 p-1 text-muted-foreground transition-all duration-200 hover:-translate-y-px hover:text-foreground"
                aria-label={collapsed ? 'expand recognition panel' : 'collapse recognition panel'}
                title={collapsed ? 'expand' : 'collapse'}
              >
                {collapsed ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" />
                )}
              </button>
            ) : null}
          </span>
        </CardTitle>
      </CardHeader>
      {collapsed ? (
        <CardContent className="px-3 pb-3">
          <div className="flex items-center gap-2 text-[11px] lowercase text-muted-foreground">
            {(status === 'recognizing' || status === 'creating_profile') ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            ) : (
              <Mic className="h-3.5 w-3.5" />
            )}
            <span>{statusLabel}</span>
            {streamName ? <span className="ml-auto text-foreground">{streamName}</span> : null}
          </div>
        </CardContent>
      ) : (
      <CardContent className={overlay ? 'space-y-2.5 px-3 pb-3' : 'space-y-3 px-4 pb-4'}>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-none border-border px-3 text-xs lowercase"
            onClick={() => setTtsEnabled((prev) => !prev)}
          >
            {ttsEnabled ? <Volume2 className="mr-1 h-3.5 w-3.5" /> : <VolumeX className="mr-1 h-3.5 w-3.5" />}
            tts {ttsEnabled ? 'on' : 'off'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-none border-border px-3 text-xs lowercase"
            onClick={() => {
              setStatus('idle')
              setProfile(null)
              setCandidates([])
              recognitionSessionStartAtRef.current = 0
              noCandidateStreakRef.current = 0
              stableTopCandidateRef.current = null
              clearStream()
              runRecognition()
            }}
          >
            run recognition
          </Button>
        </div>

        <div className="border border-border bg-secondary/20 p-3 text-xs lowercase">
          <div className="flex items-center gap-2 text-muted-foreground">
            {(status === 'recognizing' || status === 'creating_profile') ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            ) : (
              <Mic className="h-3.5 w-3.5" />
            )}
            <span>{statusLabel}</span>
            {confidence !== null ? (
              <span className="ml-auto font-mono text-[11px]">
                {(confidence * 100).toFixed(1)}%
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            mic transcript: {isTranscribing ? 'capturing chunks' : 'idle'}
          </p>
          {inferredName && !profile ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              inferred name: {inferredName}
            </p>
          ) : null}
          {error ? <p className="mt-2 text-destructive">{error}</p> : null}
        </div>

        {status === 'low_confidence' && candidates.length > 0 ? (
          <div className="space-y-2 border border-border bg-background/40 p-3">
            <p className="text-xs lowercase text-muted-foreground">
              confidence is low. tap to confirm.
            </p>
            <div className="flex flex-wrap gap-2">
              {candidates.map((candidate) => (
                <button
                  type="button"
                  key={`${candidate.person_id || candidate.name}`}
                  onClick={() => {
                    const signature = videoRef.current
                      ? signatureFromVideo(videoRef.current)
                      : []
                    const embeddingPromise = videoRef.current
                      ? extractEmbedding(videoRef.current)
                      : Promise.resolve<number[]>([])
                    embeddingPromise.then((embedding) => {
                      resolveCandidate(candidate, embedding, signature, 'manual_confirmed').catch((err) => {
                        console.error(err)
                        setError('failed to resolve candidate')
                        setStatus('error')
                      })
                    }).catch((err) => {
                      console.error(err)
                      setError('failed to resolve candidate')
                      setStatus('error')
                    })
                  }}
                  className="border border-border bg-secondary/20 px-3 py-1 text-xs lowercase transition-colors hover:border-accent"
                >
                  {candidate.name} ({(candidate.confidence * 100).toFixed(0)}%)
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2 border border-border bg-background/50 p-3 text-xs lowercase">
          <p>
            <span className="text-muted-foreground">name:</span>{' '}
            {streamName || '...'}
          </p>
          <p>
            <span className="text-muted-foreground">context:</span>{' '}
            {streamContext || '...'}
          </p>
          <p>
            <span className="text-muted-foreground">open loop:</span>{' '}
            {streamOpenLoop || '...'}
          </p>
          {profile?.last_conversation_summary ? (
            <p>
              <span className="text-muted-foreground">last convo:</span>{' '}
              {profile.last_conversation_summary}
            </p>
          ) : null}
          {profile?.recent_topics && profile.recent_topics.length > 0 ? (
            <p>
              <span className="text-muted-foreground">recent topics:</span>{' '}
              {profile.recent_topics.slice(0, 3).join(', ')}
            </p>
          ) : null}
        </div>

        {profile ? (
          <div className="space-y-2 border border-border bg-background/60 p-3 text-xs lowercase">
            <p className="text-[11px] tracking-widest text-muted-foreground">resolved memory</p>
            <p>
              <span className="text-muted-foreground">summary:</span>{' '}
              {profile.summary || 'no summary yet'}
            </p>
            <p>
              <span className="text-muted-foreground">last convo:</span>{' '}
              {profile.last_conversation_summary || 'no last conversation yet'}
            </p>
            <p>
              <span className="text-muted-foreground">open loop:</span>{' '}
              {profile.open_loops?.[0] || 'no open loop'}
            </p>
          </div>
        ) : null}

        {profile ? (
          <div className="space-y-2">
            <p className="text-[11px] lowercase text-muted-foreground">
              active profile: {profile.person_id}
              {typeof profile.conversation_count === 'number'
                ? ` • conversations: ${profile.conversation_count}`
                : ''}
            </p>
            {!profile.name_confirmed ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-none border-border px-3 text-xs lowercase"
                onClick={async () => {
                  const res = await fetch('/api/recognition/profiles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      person_id: profile.person_id,
                      name: profile.name,
                      name_confirmed: true,
                      where_met: profile.where_met,
                      summary: profile.summary,
                      open_loops: profile.open_loops,
                      last_location: profile.last_location,
                    }),
                  })
                  if (!res.ok) return
                  const json = (await res.json()) as { profile?: RecognitionProfile }
                  if (json.profile) setProfile(json.profile)
                }}
              >
                confirm name
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
      )}
    </Card>
  )
}
