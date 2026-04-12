import type {
  BBox,
  FrameAnalysis,
  SampledFrame,
  TranscriptChunk,
  VisualPerson,
} from './types'

// Client-side vision pipeline: runs after stopRecording. Takes the ring
// of sampled JPEG frames + their analyses from /api/vision-analyze,
// produces cropped face thumbnails per unique person, and maps the
// audio transcript's generic speaker labels (person1/person2) to the
// real names detected on screen.

const VISION_BATCH_SIZE = 6
// Number of /api/vision-analyze requests allowed in flight at once.
// Each request fans out to VISION_BATCH_SIZE parallel gpt-4o-mini calls
// on the server, so the effective concurrency at OpenAI is
// VISION_BATCH_CONCURRENCY * VISION_BATCH_SIZE (default 24).
const VISION_BATCH_CONCURRENCY = 4
// Hard cap on frames sent to vision. Long recordings are subsampled
// evenly down to this count so total latency stays bounded regardless
// of session length. At 60 frames spread over N minutes, each detection
// represents one snapshot every N/60 minutes — plenty to catch active
// speaker handoffs for the label remap.
const MAX_FRAMES_FOR_VISION = 60
// Thumbnail width used for persisted face crops. 256px is enough for a
// recognisable preview and keeps the base64 payload around ~15-25kb.
const FACE_THUMB_WIDTH = 256
// Mapping guardrails: a visual name needs at least this many active
// appearances during an audio chunk before it's allowed to claim a
// speaker label, otherwise single-frame glitches could pollute labels.
const MIN_VOTES_FOR_LABEL = 2

// --- Upload loop ---------------------------------------------------------

export async function analyzeFrames(
  frames: SampledFrame[],
  onProgress?: (done: number, total: number) => void
): Promise<FrameAnalysis[]> {
  if (frames.length === 0) return []

  // Subsample down to MAX_FRAMES_FOR_VISION before uploading. Picks an
  // evenly-spaced set so temporal coverage stays uniform across the
  // whole recording no matter how long it ran.
  const selected = evenlySubsample(frames, MAX_FRAMES_FOR_VISION)

  // Convert blobs to data URLs. Sequential to avoid spiking memory.
  const payloads: Array<{ t_ms: number; data_url: string }> = []
  for (const f of selected) {
    try {
      const data_url = await blobToDataUrl(f.blob)
      payloads.push({ t_ms: f.t_ms, data_url })
    } catch (err) {
      console.error('blob→data_url failed:', err)
    }
  }

  // Slice into network batches.
  const batches: Array<Array<{ t_ms: number; data_url: string }>> = []
  for (let i = 0; i < payloads.length; i += VISION_BATCH_SIZE) {
    batches.push(payloads.slice(i, i + VISION_BATCH_SIZE))
  }

  // Worker-pool over batches. VISION_BATCH_CONCURRENCY workers pull
  // from a shared cursor so stragglers don't stall the pack.
  const results: FrameAnalysis[] = []
  let cursor = 0
  let done = 0
  const totalFrames = payloads.length

  async function worker() {
    while (true) {
      const myIdx = cursor++
      if (myIdx >= batches.length) return
      const batch = batches[myIdx]
      try {
        const res = await fetch('/api/vision-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frames: batch }),
        })
        const parsed = (await res.json()) as { analyses?: FrameAnalysis[] }
        if (Array.isArray(parsed.analyses)) {
          results.push(...parsed.analyses)
        }
      } catch (err) {
        console.error('vision batch failed:', err)
      }
      done += batch.length
      onProgress?.(done, totalFrames)
    }
  }

  const workerCount = Math.min(VISION_BATCH_CONCURRENCY, batches.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  results.sort((a, b) => a.t_ms - b.t_ms)
  return results
}

function evenlySubsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr
  const out: T[] = []
  const step = arr.length / max
  for (let i = 0; i < max; i++) {
    out.push(arr[Math.floor(i * step)])
  }
  return out
}

// --- Face crop builder ---------------------------------------------------

interface CropCandidate {
  name: string
  frame: SampledFrame
  tile_bbox: BBox
  tile_area: number
  active_count: number
  total_count: number
}

export async function buildVisualPeople(
  frames: SampledFrame[],
  analyses: FrameAnalysis[]
): Promise<VisualPerson[]> {
  const frameByTs = new Map<number, SampledFrame>()
  for (const f of frames) frameByTs.set(f.t_ms, f)

  // Pick the largest tile as each person's representative crop — larger
  // tile = better face resolution after scaling to the thumbnail width.
  const byName = new Map<string, CropCandidate>()
  for (const analysis of analyses) {
    const frame = frameByTs.get(analysis.t_ms)
    if (!frame) continue
    for (const det of analysis.detections) {
      const name = normalizeName(det.name)
      if (!name || name === 'you') continue
      const [, , w, h] = det.tile_bbox
      const tileArea = w * h
      const existing = byName.get(name)
      if (!existing) {
        byName.set(name, {
          name,
          frame,
          tile_bbox: det.tile_bbox,
          tile_area: tileArea,
          active_count: det.active ? 1 : 0,
          total_count: 1,
        })
      } else {
        existing.total_count += 1
        if (det.active) existing.active_count += 1
        if (tileArea > existing.tile_area) {
          existing.frame = frame
          existing.tile_bbox = det.tile_bbox
          existing.tile_area = tileArea
        }
      }
    }
  }

  const out: VisualPerson[] = []
  for (const cand of byName.values()) {
    try {
      const face_image = await cropFaceFromFrame(cand.frame, cand.tile_bbox)
      out.push({
        name: cand.name,
        face_image,
        active_frame_count: cand.active_count,
      })
    } catch (err) {
      console.error('face crop failed for', cand.name, err)
    }
  }
  return out
}

async function cropFaceFromFrame(
  frame: SampledFrame,
  tile: BBox
): Promise<string> {
  const img = await loadImageFromBlob(frame.blob)
  const [nx, ny, nw, nh] = tile
  const tx = nx * frame.width
  const ty = ny * frame.height
  const tw = nw * frame.width
  const th = nh * frame.height

  // Face region ≈ top 65% of tile (skipping name label at the bottom),
  // central 70% horizontally (participants center themselves in-frame).
  const fw = tw * 0.7
  const fh = th * 0.65
  const fx = tx + (tw - fw) / 2
  const fy = ty + th * 0.05

  const sx = Math.max(0, Math.min(frame.width - 1, fx))
  const sy = Math.max(0, Math.min(frame.height - 1, fy))
  const sw = Math.max(1, Math.min(frame.width - sx, fw))
  const sh = Math.max(1, Math.min(frame.height - sy, fh))

  const aspect = sh / sw
  const destW = FACE_THUMB_WIDTH
  const destH = Math.max(1, Math.round(FACE_THUMB_WIDTH * aspect))

  const canvas = document.createElement('canvas')
  canvas.width = destW
  canvas.height = destH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas context unavailable')
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, destW, destH)
  return canvas.toDataURL('image/jpeg', 0.82)
}

async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err)
    }
    img.src = url
  })
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

// --- Speaker label remapping --------------------------------------------

/**
 * Maps audio speaker labels (person1/person2/...) to detected visual
 * names by correlating each audio chunk's time window against the
 * active speaker seen visually during that window. Only single-speaker
 * audio chunks contribute votes — multi-speaker chunks are ambiguous at
 * chunk-level resolution and would noise up the mapping.
 *
 * Returns the rewritten chunks (same length, segments' speaker fields
 * replaced with real names where confident) plus the raw label map for
 * downstream extraction/person-save use.
 */
export function remapChunkSpeakers(
  chunks: TranscriptChunk[],
  analyses: FrameAnalysis[],
  chunkIntervalMs: number
): { newChunks: TranscriptChunk[]; labelMap: Record<string, string> } {
  const framesByChunk = new Map<number, FrameAnalysis[]>()
  for (const a of analyses) {
    const idx = Math.floor(a.t_ms / chunkIntervalMs)
    if (!framesByChunk.has(idx)) framesByChunk.set(idx, [])
    framesByChunk.get(idx)!.push(a)
  }

  // audio_label → visual_name → vote count
  const votes = new Map<string, Map<string, number>>()

  for (const chunk of chunks) {
    const segs = chunk.segments || []
    if (segs.length === 0) continue
    const windowFrames = framesByChunk.get(chunk.chunk_index) || []
    if (windowFrames.length === 0) continue

    const activeCounts = new Map<string, number>()
    for (const a of windowFrames) {
      for (const det of a.detections) {
        if (!det.active) continue
        const name = normalizeName(det.name)
        if (!name || name === 'you') continue
        activeCounts.set(name, (activeCounts.get(name) || 0) + 1)
      }
    }
    if (activeCounts.size === 0) continue

    const uniqueAudioSpeakers = Array.from(
      new Set(segs.map((s) => s.speaker))
    )
    if (uniqueAudioSpeakers.length !== 1) continue

    const audioLabel = uniqueAudioSpeakers[0]
    if (!votes.has(audioLabel)) votes.set(audioLabel, new Map())
    const bucket = votes.get(audioLabel)!
    for (const [name, count] of activeCounts) {
      bucket.set(name, (bucket.get(name) || 0) + count)
    }
  }

  // Resolve with a greedy assignment: process audio labels by descending
  // total vote weight so the most-confident label gets first pick. A
  // visual name can only be assigned once to prevent two speakers from
  // both collapsing to the same person.
  const labelMap: Record<string, string> = {}
  const assignedVisualNames = new Set<string>()
  const orderedLabels = Array.from(votes.entries()).sort((a, b) => {
    const totalA = sum(a[1].values())
    const totalB = sum(b[1].values())
    return totalB - totalA
  })
  for (const [label, bucket] of orderedLabels) {
    const sorted = Array.from(bucket.entries()).sort((a, b) => b[1] - a[1])
    for (const [name, count] of sorted) {
      if (count < MIN_VOTES_FOR_LABEL) break
      if (assignedVisualNames.has(name)) continue
      labelMap[label] = name
      assignedVisualNames.add(name)
      break
    }
  }

  const newChunks: TranscriptChunk[] = chunks.map((chunk) => ({
    ...chunk,
    segments: chunk.segments?.map((seg) => ({
      ...seg,
      speaker: labelMap[seg.speaker] || seg.speaker,
    })),
  }))

  return { newChunks, labelMap }
}

function sum(values: Iterable<number>): number {
  let s = 0
  for (const v of values) s += v
  return s
}
