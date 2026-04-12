// --- Core data model (shared between screen + webcam pipelines) ---

export interface Person {
  person_id: string
  name: string
  where_met: string
  summary: string
  open_loops: string[]
  last_seen: string // ISO timestamp
  /**
   * Accumulated prose observations from each session, one entry per
   * encounter. Used to rebuild the content paragraph on updates so that
   * semantic search benefits from the full history.
   */
  notes?: string[]
  /**
   * Latest LLM-generated prose paragraph describing this person. Used as
   * the initial content for a freshly-created Nia context and kept in sync
   * on updates.
   */
  prose?: string
  /**
   * base64 data URL of a cropped face thumbnail. Captured passively from
   * screen recordings (meet grid tiles) so the webcam-side recognition
   * pipeline has an enrollment image to match against next time.
   */
  face_image?: string
  nia_context_id?: string
  // --- manual enrichment fields (user-entered contact + social links) ---
  email?: string
  job_title?: string
  company?: string
  linkedin_url?: string
  instagram?: string
  twitter?: string // X / twitter handle or url
  manual_notes?: string
}

export interface Episode {
  episode_id: string
  person_ids: string[]
  topics: string[] // 1-3
  promises: string[] // verbatim, may be empty
  next_actions: string[]
  timestamp: string // ISO timestamp
  source: 'screen' | 'webcam'
  /**
   * LLM-generated natural-language description of the conversation.
   * Stored as the content field on the Nia context for semantic search.
   */
  prose?: string
  nia_context_id?: string
}

// What GPT-4o returns from a transcript
export interface ExtractionResult {
  people: {
    name: string
    role_or_context?: string
    /**
     * Natural-language paragraph describing this person, suitable for
     * embedding in a memory index. 2-4 sentences.
     */
    prose_summary: string
  }[] // max 3
  topics: string[] // 1-3
  promises: string[] // verbatim, empty if none
  next_actions: string[] // max 3
  /**
   * Natural-language description of the whole episode — who was there,
   * what was discussed, what was promised, next steps. 3-5 sentences.
   */
  episode_prose: string
}

// --- Recording state ---

export type RecordingStatus = 'idle' | 'recording' | 'processing' | 'error'

export interface TranscriptSegment {
  speaker: string // e.g. "person1", "person2"
  text: string
}

export interface TranscriptChunk {
  text: string
  timestamp: number
  chunk_index: number
  /**
   * Speaker-segmented view of this chunk. Produced by a post-transcription
   * LLM pass that splits the raw text into turns with consistent labels
   * across chunks. May be absent if segmentation failed — callers should
   * fall back to `text`.
   */
  segments?: TranscriptSegment[]
}

// --- Vision pipeline (screen recording → Meet face detection) ---

/**
 * A single frame captured off the screen-share video track during a
 * recording session. t_ms is milliseconds since recording start — used
 * to align frames with audio chunks for speaker label remapping.
 * width/height are the dimensions of the JPEG in the blob; bboxes
 * returned from vision analysis are relative to these dimensions.
 */
export interface SampledFrame {
  t_ms: number
  blob: Blob
  width: number
  height: number
}

/**
 * Bounding box in pixels, relative to the frame's width/height.
 * [x, y, w, h] matches the format we ask GPT-4o vision to return.
 */
export type BBox = [number, number, number, number]

/**
 * One speaker detected in a single frame. active=true means they had
 * the Meet "active speaker" border at capture time. tile_bbox is the
 * whole participant tile (face + name strip), normalized to [0, 1];
 * the client derives a face-region crop from the top portion of it.
 */
export interface DetectedPerson {
  name: string
  tile_bbox: BBox
  active: boolean
}

/**
 * Vision-analysis result for a single frame.
 */
export interface FrameAnalysis {
  t_ms: number
  is_meet: boolean
  detections: DetectedPerson[]
}

/**
 * Final per-person visual record after frame analysis + cropping.
 * face_image is a base64 data URL (image/jpeg) ready to persist.
 */
export interface VisualPerson {
  name: string
  face_image: string
  active_frame_count: number
}
