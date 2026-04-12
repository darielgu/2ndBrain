export interface RecognitionProfile {
  person_id: string
  name: string
  name_confirmed?: boolean
  where_met: string
  summary: string
  open_loops: string[]
  last_location?: string
  conversation_count?: number
  recent_topics?: string[]
  last_conversation_summary?: string
  last_seen?: string
  face_frames?: FaceFrameRecord[]
  created_at: string
  updated_at: string
}

export interface FaceFrameRecord {
  id: string
  person_id: string
  path: string
  captured_at: string
  confidence?: number
  source?: 'auto_resolved' | 'manual_confirmed'
  signature?: number[]
}

export interface MatchCandidate {
  person_id: string
  name: string
  confidence: number
  where_met?: string
  summary?: string
  open_loops?: string[]
  last_location?: string
  conversation_count?: number
  recent_topics?: string[]
  last_conversation_summary?: string
  nia_tip?: string
}

export interface RecognitionEpisode {
  episode_id: string
  person_id: string
  transcript: string
  topics: string[]
  promises: string[]
  next_actions: string[]
  summary: string
  timestamp: string
  where_met?: string
  last_location?: string
}

export interface MatchResponse {
  match: MatchCandidate | null
  candidates: MatchCandidate[]
}

export interface FaceEmbeddingRecord {
  id: string
  person_id: string
  embedding: number[]
  quality: number
  source?: 'faceapi_128' | 'legacy'
  embedding_dim?: number
  embedding_model?: string
  embedding_version?: string
  created_at: string
}

export interface RecognitionStoreData {
  profiles: Record<string, RecognitionProfile>
  faces: FaceEmbeddingRecord[]
  episodes: RecognitionEpisode[]
}
