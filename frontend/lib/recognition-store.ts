import { mkdir, readFile, rm, unlink, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import type { ExtractionResult } from '@/lib/types'
import type {
  FaceEmbeddingRecord,
  FaceFrameRecord,
  MatchResponse,
  RecognitionEpisode,
  RecognitionProfile,
  RecognitionStoreData,
} from '@/lib/recognition-types'

const STORE_DIR = path.join(process.cwd(), '.data')
const STORE_PATH = path.join(STORE_DIR, 'recognition-store.json')
const FACE_FRAMES_DIR = path.join(STORE_DIR, 'face-frames')
const STABLE_EMBEDDING_DIM = 128
const STABLE_EMBEDDING_MODEL = 'face-apijs-face-recognition-net'
const STABLE_EMBEDDING_VERSION = '1'
const DEFAULT_STORE: RecognitionStoreData = {
  profiles: {},
  faces: [],
  episodes: [],
}
const MIN_VECTOR_LENGTH = 8
const MAX_FACE_RECORDS = 500
const MAX_PROFILE_FACE_FRAMES = 20
const MAX_EPISODES = 500
const MAX_TOPICS = 6
const MAX_OPEN_LOOPS = 12

async function ensureStore(): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true })
  try {
    await readFile(STORE_PATH, 'utf8')
  } catch {
    await writeFile(STORE_PATH, JSON.stringify(DEFAULT_STORE, null, 2), 'utf8')
  }
}

function normalizeVector(vector: number[]): number[] {
  return vector.filter((value) => Number.isFinite(value))
}

function dedupeStrings(values: string[], max: number): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  ).slice(0, max)
}

function safePersonFolderName(personId: string): string {
  return personId.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
}

function normalizeFaceRecord(raw: unknown): FaceEmbeddingRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>

  const embeddingRaw = Array.isArray(row.embedding) ? row.embedding : []
  const embedding = normalizeVector(embeddingRaw.map((value) => Number(value)))

  if (embedding.length < MIN_VECTOR_LENGTH) return null

  const source: FaceEmbeddingRecord['source'] =
    row.source === 'faceapi_128' ? 'faceapi_128' : 'legacy'
  const embeddingDim =
    typeof row.embedding_dim === 'number' && Number.isFinite(row.embedding_dim)
      ? row.embedding_dim
      : embedding.length

  return {
    id: typeof row.id === 'string' ? row.id : randomUUID(),
    person_id: typeof row.person_id === 'string' ? row.person_id : '',
    embedding,
    quality:
      typeof row.quality === 'number' && Number.isFinite(row.quality)
        ? row.quality
        : 1,
    source,
    embedding_dim: embeddingDim,
    embedding_model:
      typeof row.embedding_model === 'string'
        ? row.embedding_model
        : source === 'faceapi_128'
          ? STABLE_EMBEDDING_MODEL
          : 'legacy',
    embedding_version:
      typeof row.embedding_version === 'string'
        ? row.embedding_version
        : source === 'faceapi_128'
          ? STABLE_EMBEDDING_VERSION
          : 'legacy',
    created_at:
      typeof row.created_at === 'string'
        ? row.created_at
        : new Date().toISOString(),
  }
}

function normalizeEpisode(raw: unknown): RecognitionEpisode | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const personId = typeof row.person_id === 'string' ? row.person_id : ''
  if (!personId) return null

  return {
    episode_id: typeof row.episode_id === 'string' ? row.episode_id : randomUUID(),
    person_id: personId,
    transcript: typeof row.transcript === 'string' ? row.transcript : '',
    topics: Array.isArray(row.topics)
      ? row.topics.map((x) => String(x)).filter(Boolean)
      : [],
    promises: Array.isArray(row.promises)
      ? row.promises.map((x) => String(x)).filter(Boolean)
      : [],
    next_actions: Array.isArray(row.next_actions)
      ? row.next_actions.map((x) => String(x)).filter(Boolean)
      : [],
    summary: typeof row.summary === 'string' ? row.summary : '',
    timestamp:
      typeof row.timestamp === 'string'
        ? row.timestamp
        : new Date().toISOString(),
    where_met: typeof row.where_met === 'string' ? row.where_met : undefined,
    last_location:
      typeof row.last_location === 'string' ? row.last_location : undefined,
  }
}

async function readStore(): Promise<RecognitionStoreData> {
  await ensureStore()
  try {
    const raw = await readFile(STORE_PATH, 'utf8')
    const parsed = JSON.parse(raw) as Partial<RecognitionStoreData> & {
      faces?: unknown[]
      episodes?: unknown[]
    }

    const faces = Array.isArray(parsed.faces)
      ? parsed.faces
          .map(normalizeFaceRecord)
          .filter((item): item is FaceEmbeddingRecord => !!item)
      : []

    const episodes = Array.isArray(parsed.episodes)
      ? parsed.episodes
          .map(normalizeEpisode)
          .filter((item): item is RecognitionEpisode => !!item)
      : []

    return {
      profiles: parsed.profiles || {},
      faces,
      episodes,
    }
  } catch {
    return { ...DEFAULT_STORE }
  }
}

export async function getRecognitionStoreSnapshot(): Promise<RecognitionStoreData> {
  return readStore()
}

export async function resetRecognitionStore(): Promise<void> {
  await ensureStore()
  await writeFile(STORE_PATH, JSON.stringify(DEFAULT_STORE, null, 2), 'utf8')
  await rm(FACE_FRAMES_DIR, { recursive: true, force: true }).catch(() => {
    // Best-effort cleanup of captured face frames.
  })
}

async function saveStore(data: RecognitionStoreData): Promise<void> {
  await ensureStore()
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2), 'utf8')
}

function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < MIN_VECTOR_LENGTH) return 0

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function averageVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return []
  const dim = vectors[0].length
  if (dim < MIN_VECTOR_LENGTH) return []
  const acc = new Array(dim).fill(0)
  for (const vector of vectors) {
    if (vector.length !== dim) continue
    for (let i = 0; i < dim; i++) acc[i] += vector[i]
  }
  return acc.map((value) => value / vectors.length)
}

export async function upsertProfile(input: {
  person_id: string
  name: string
  name_confirmed?: boolean
  where_met?: string
  summary?: string
  open_loops?: string[]
  last_location?: string
  recent_topics?: string[]
  last_conversation_summary?: string
  last_seen?: string
}): Promise<RecognitionProfile> {
  const store = await readStore()
  const now = new Date().toISOString()
  const existing = store.profiles[input.person_id]

  const profile: RecognitionProfile = {
    person_id: input.person_id,
    name: input.name || existing?.name || input.person_id,
    name_confirmed:
      typeof input.name_confirmed === 'boolean'
        ? input.name_confirmed
        : existing?.name_confirmed || false,
    where_met: input.where_met || existing?.where_met || 'unknown',
    summary: input.summary || existing?.summary || '',
    open_loops: dedupeStrings(
      [
        ...(input.open_loops || []),
        ...(existing?.open_loops || []),
      ],
      MAX_OPEN_LOOPS
    ),
    last_location: input.last_location || existing?.last_location || '',
    recent_topics: dedupeStrings(
      [
        ...(input.recent_topics || []),
        ...(existing?.recent_topics || []),
      ],
      MAX_TOPICS
    ),
    last_conversation_summary:
      input.last_conversation_summary || existing?.last_conversation_summary || '',
    face_frames: existing?.face_frames || [],
    conversation_count: existing?.conversation_count || 0,
    last_seen: input.last_seen || existing?.last_seen || now,
    created_at: existing?.created_at || now,
    updated_at: now,
  }

  store.profiles[input.person_id] = profile
  await saveStore(store)
  return profile
}

export async function getProfile(
  person_id: string
): Promise<RecognitionProfile | null> {
  const store = await readStore()
  return store.profiles[person_id] || null
}

export async function deleteProfile(person_id: string): Promise<boolean> {
  const store = await readStore()
  const existingProfile = store.profiles[person_id]
  if (!existingProfile) return false

  delete store.profiles[person_id]
  store.faces = store.faces.filter((face) => face.person_id !== person_id)
  store.episodes = store.episodes.filter((episode) => episode.person_id !== person_id)
  await saveStore(store)

  const personDir = path.join(FACE_FRAMES_DIR, safePersonFolderName(person_id))
  await rm(personDir, { recursive: true, force: true }).catch(() => {
    // Best-effort cleanup of captured face frames for the deleted profile.
  })

  return true
}

export async function getRecentEpisodesForPerson(
  person_id: string,
  limit: number = 5
): Promise<RecognitionEpisode[]> {
  const store = await readStore()
  return store.episodes
    .filter((episode) => episode.person_id === person_id)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit)
}

export async function listProfiles(): Promise<RecognitionProfile[]> {
  const store = await readStore()
  return Object.values(store.profiles).sort((a, b) =>
    (b.last_seen || b.updated_at).localeCompare(a.last_seen || a.updated_at)
  )
}

export async function listEpisodes(limit?: number): Promise<RecognitionEpisode[]> {
  const store = await readStore()
  const ordered = [...store.episodes].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp)
  )
  if (typeof limit === 'number' && limit > 0) {
    return ordered.slice(0, limit)
  }
  return ordered
}

export async function listActiveLoops(limit: number = 12): Promise<string[]> {
  const profiles = await listProfiles()
  const loops = dedupeStrings(
    profiles.flatMap((profile) => profile.open_loops || []),
    limit
  )
  return loops
}

export async function addConversationEpisode(input: {
  person_id: string
  transcript: string
  extraction: ExtractionResult
  where_met?: string
  last_location?: string
}): Promise<{ profile: RecognitionProfile; episode: RecognitionEpisode }> {
  const store = await readStore()
  const now = new Date().toISOString()
  const existing = store.profiles[input.person_id]

  const summary =
    input.extraction.episode_prose?.trim() ||
    input.transcript.trim().slice(0, 280) ||
    'conversation captured.'

  const episode: RecognitionEpisode = {
    episode_id: `ep_${Date.now()}_${randomUUID().slice(0, 8)}`,
    person_id: input.person_id,
    transcript: input.transcript,
    topics: dedupeStrings(input.extraction.topics || [], 3),
    promises: dedupeStrings(input.extraction.promises || [], 5),
    next_actions: dedupeStrings(input.extraction.next_actions || [], 5),
    summary,
    timestamp: now,
    where_met: input.where_met || existing?.where_met,
    last_location: input.last_location || existing?.last_location,
  }

  const extractedPersonSummary = dedupeStrings(
    (input.extraction.people || [])
      .map((person) => String(person.prose_summary || '').trim())
      .filter(Boolean),
    1
  )[0]
  const extractedRoleSummary = dedupeStrings(
    (input.extraction.people || [])
      .map((person) => String(person.role_or_context || '').trim())
      .filter(Boolean),
    1
  )[0]
  const resolvedSummary =
    extractedPersonSummary ||
    extractedRoleSummary ||
    existing?.summary ||
    summary

  const updatedProfile: RecognitionProfile = {
    person_id: input.person_id,
    name: existing?.name || input.person_id,
    name_confirmed: existing?.name_confirmed || false,
    where_met: input.where_met || existing?.where_met || 'unknown',
    summary: resolvedSummary,
    open_loops: dedupeStrings(
      [
        ...(existing?.open_loops || []),
        ...episode.promises,
        ...episode.next_actions,
      ],
      MAX_OPEN_LOOPS
    ),
    last_location: input.last_location || existing?.last_location || '',
    recent_topics: dedupeStrings(
      [
        ...episode.topics,
        ...(existing?.recent_topics || []),
      ],
      MAX_TOPICS
    ),
    last_conversation_summary: episode.summary,
    conversation_count: (existing?.conversation_count || 0) + 1,
    last_seen: now,
    created_at: existing?.created_at || now,
    updated_at: now,
  }

  store.profiles[input.person_id] = updatedProfile
  store.episodes = [episode, ...store.episodes].slice(0, MAX_EPISODES)
  await saveStore(store)

  return {
    profile: updatedProfile,
    episode,
  }
}

export async function enrollFaceEmbedding(input: {
  person_id: string
  embedding?: number[]
  quality?: number
}): Promise<FaceEmbeddingRecord> {
  const embedding = normalizeVector(Array.isArray(input.embedding) ? input.embedding : [])

  if (embedding.length < MIN_VECTOR_LENGTH) {
    throw new Error('embedding too short')
  }

  const store = await readStore()
  const record: FaceEmbeddingRecord = {
    id: randomUUID(),
    person_id: input.person_id,
    embedding,
    quality: input.quality ?? 1,
    source: embedding.length === STABLE_EMBEDDING_DIM ? 'faceapi_128' : 'legacy',
    embedding_dim: embedding.length,
    embedding_model:
      embedding.length === STABLE_EMBEDDING_DIM
        ? STABLE_EMBEDDING_MODEL
        : 'legacy',
    embedding_version:
      embedding.length === STABLE_EMBEDDING_DIM
        ? STABLE_EMBEDDING_VERSION
        : 'legacy',
    created_at: new Date().toISOString(),
  }

  store.faces = [record, ...store.faces].slice(0, MAX_FACE_RECORDS)
  await saveStore(store)
  return record
}

export async function addFaceFrameToProfile(input: {
  person_id: string
  jpegBuffer: Buffer
  confidence?: number
  source?: 'auto_resolved' | 'manual_confirmed'
  signature?: number[]
}): Promise<FaceFrameRecord> {
  const store = await readStore()
  const profile = store.profiles[input.person_id]
  if (!profile) {
    throw new Error(`profile not found: ${input.person_id}`)
  }

  const personDirName = safePersonFolderName(input.person_id)
  const personDir = path.join(FACE_FRAMES_DIR, personDirName)
  await mkdir(personDir, { recursive: true })

  const now = new Date().toISOString()
  const frameId = randomUUID()
  const fileName = `${Date.now()}_${frameId.slice(0, 8)}.jpg`
  const absPath = path.join(personDir, fileName)
  await writeFile(absPath, input.jpegBuffer)

  const relPath = path.join('.data', 'face-frames', personDirName, fileName)
  const nextFrame: FaceFrameRecord = {
    id: frameId,
    person_id: input.person_id,
    path: relPath,
    captured_at: now,
    confidence: input.confidence,
    source: input.source || 'auto_resolved',
    signature: Array.isArray(input.signature)
      ? normalizeVector(input.signature.map((v) => Number(v))).slice(0, 64)
      : undefined,
  }

  const existingFrames = profile.face_frames || []
  const merged = [nextFrame, ...existingFrames]
  const kept = merged.slice(0, MAX_PROFILE_FACE_FRAMES)
  const removed = merged.slice(MAX_PROFILE_FACE_FRAMES)

  store.profiles[input.person_id] = {
    ...profile,
    face_frames: kept,
    updated_at: now,
  }
  await saveStore(store)

  for (const frame of removed) {
    const framePath = frame.path || ''
    if (!framePath) continue
    const abs = path.isAbsolute(framePath)
      ? framePath
      : path.join(process.cwd(), framePath)
    await unlink(abs).catch(() => {
      // Best effort cleanup of pruned files.
    })
  }

  return nextFrame
}

export async function matchEmbedding(input: {
  embedding?: number[]
  threshold?: number
}): Promise<MatchResponse> {
  const query = normalizeVector(Array.isArray(input.embedding) ? input.embedding : [])

  const threshold = input.threshold ?? 0.62
  const store = await readStore()

  if (query.length !== STABLE_EMBEDDING_DIM || store.faces.length === 0) {
    return { match: null, candidates: [] }
  }

  const personVectors = new Map<string, number[]>()
  for (const face of store.faces) {
    if (face.source !== 'faceapi_128') continue
    if (face.embedding.length !== STABLE_EMBEDDING_DIM) continue
    const existing = personVectors.get(face.person_id) || []
    existing.push(cosineSimilarity(query, face.embedding))
    personVectors.set(face.person_id, existing)
  }

  const candidates = Array.from(personVectors.entries())
    .map(([person_id, scores]) => {
      const topK = [...scores].sort((a, b) => b - a).slice(0, 5)
      const avgTopK =
        topK.length > 0 ? topK.reduce((sum, v) => sum + v, 0) / topK.length : 0
      const personEmbeddings = store.faces
        .filter((face) => face.person_id === person_id && face.source === 'faceapi_128')
        .map((face) => face.embedding)
        .filter((emb) => emb.length === STABLE_EMBEDDING_DIM)
      const centroid = averageVector(personEmbeddings)
      const centroidScore =
        centroid.length === STABLE_EMBEDDING_DIM
          ? cosineSimilarity(query, centroid)
          : 0
      const confidence = 0.6 * centroidScore + 0.4 * avgTopK
      const profile = store.profiles[person_id]
      return {
        person_id,
        name: profile?.name || person_id,
        confidence,
        where_met: profile?.where_met,
        summary: profile?.summary,
        open_loops: profile?.open_loops,
        last_location: profile?.last_location,
        conversation_count: profile?.conversation_count || 0,
        recent_topics: profile?.recent_topics || [],
        last_conversation_summary: profile?.last_conversation_summary || '',
      }
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)

  const top = candidates[0] || null
  const second = candidates[1] || null
  const margin = top && second ? top.confidence - second.confidence : 1
  return {
    match: top && top.confidence >= threshold && margin >= 0.04 ? top : null,
    candidates,
  }
}

export async function seedDemoProfiles(): Promise<void> {
  const store = await readStore()
  if (Object.keys(store.profiles).length > 0) return

  const now = new Date().toISOString()
  store.profiles = {
    maya_001: {
      person_id: 'maya_001',
      name: 'Maya',
      name_confirmed: true,
      where_met: 'hackathon',
      summary: 'works on voice infra',
      open_loops: ['send repo'],
      last_location: '',
      conversation_count: 1,
      recent_topics: ['voice infra'],
      last_conversation_summary: 'You discussed voice infrastructure and promised to send the repo link.',
      last_seen: now,
      created_at: now,
      updated_at: now,
    },
    elijah_001: {
      person_id: 'elijah_001',
      name: 'Elijah',
      name_confirmed: true,
      where_met: 'co-working loft',
      summary: 'shipping a wearables prototype',
      open_loops: ['intro to camera ml lead'],
      last_location: '',
      conversation_count: 1,
      recent_topics: ['camera latency'],
      last_conversation_summary: 'You discussed wearables camera latency and a possible intro.',
      last_seen: now,
      created_at: now,
      updated_at: now,
    },
  }

  await saveStore(store)
}
