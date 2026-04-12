import OpenAI from 'openai'
import type { BBox, ExtractionResult, FrameAnalysis } from './types'

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

// --- Transcribe audio using Whisper ---
export async function transcribeAudio(audioFile: File): Promise<string> {
  const openai = getOpenAIClient()
  if (!openai) return ''

  const response = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file: audioFile,
  })
  return response.text
}

// --- Extract structured memory from transcript using GPT-4o ---

const EXTRACTION_SYSTEM_PROMPT = `you are a memory extraction agent for secondbrain. given a conversation transcript, extract structured data AND write natural-language prose suitable for a memory index.

rules (strict):
- extract ONLY: people involved, key topics, explicit promises, next actions
- people: max 3. include name, brief role/context, and a prose_summary (see below)
- topics: 1-3 key topics discussed
- promises: ONLY explicit, verbatim commitments. if no promise was made, return an empty array. do NOT infer or assume promises
- next_actions: max 3 concrete follow-ups or next steps mentioned
- prefer precision over recall — "boring but correct" over "smart but wrong"

prose writing:
- prose_summary (per person): 2-4 sentences describing this specific person based ONLY on what the transcript reveals. include their role, what they work on, any relevant facts, and what was promised to or by them. write naturally, as if describing them to a friend. use their name. do NOT invent details.
- episode_prose (whole conversation): 3-5 sentences describing the interaction. mention who was there, what was discussed, any promises made, and next steps. write naturally. do NOT invent details.

important:
- if transcript is short/noisy, still provide the best non-empty episode_prose you can from available evidence.
- if nothing concrete is available for a field, return empty arrays (not null) and keep prose conservative.

return valid json matching this exact schema:
{
  "people": [
    {
      "name": "string",
      "role_or_context": "string or null",
      "prose_summary": "2-4 sentence prose paragraph about this person"
    }
  ],
  "topics": ["string"],
  "promises": ["string"],
  "next_actions": ["string"],
  "episode_prose": "3-5 sentence prose paragraph about the whole conversation"
}`

export async function extractMemory(
  transcript: string
): Promise<ExtractionResult> {
  const fallback: ExtractionResult = {
    people: [],
    topics: ['unknown'],
    promises: [],
    next_actions: [],
    episode_prose: '',
  }

  const openai = getOpenAIClient()
  if (!openai) {
    return fallback
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `extract structured memory from this transcript:\n\n${transcript}`,
        },
      ],
      temperature: 0.1,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return fallback
    }

    const parsed = JSON.parse(content) as ExtractionResult

    // Normalize people entries — ensure each has a prose_summary
    const people = (parsed.people || []).slice(0, 3).map((p) => ({
      name: p.name,
      role_or_context: p.role_or_context,
      prose_summary: p.prose_summary || '',
    }))

    return {
      people,
      topics: (parsed.topics || []).slice(0, 3),
      promises: parsed.promises || [],
      next_actions: (parsed.next_actions || []).slice(0, 3),
      episode_prose: parsed.episode_prose || '',
    }
  } catch (err) {
    console.error('extractMemory fallback due to OpenAI error:', err)
    return fallback
  }
}

const MEET_VISION_SYSTEM_PROMPT = `you are a computer vision agent analyzing a screenshot. return only valid json:
{
  "is_meet": boolean,
  "detections": [
    { "name": string, "tile_bbox": [number, number, number, number], "active": boolean }
  ]
}
for tile_bbox use normalized [x,y,w,h] in range [0,1]. at most one active=true.`

function clamp01(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

function parseBBox(raw: unknown): BBox | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  const [x, y, w, h] = raw.map(clamp01) as [number, number, number, number]
  if (w <= 0 || h <= 0) return null
  return [x, y, w, h]
}

export async function analyzeMeetFrame(
  dataUrl: string,
  t_ms: number
): Promise<FrameAnalysis> {
  const fallback: FrameAnalysis = { t_ms, is_meet: false, detections: [] }
  const openai = getOpenAIClient()
  if (!openai) return fallback

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: MEET_VISION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'analyze this frame' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ] as unknown as string,
        },
      ],
      temperature: 0,
    })
    const content = response.choices[0]?.message?.content
    if (!content) return fallback
    const parsed = JSON.parse(content) as {
      is_meet?: boolean
      detections?: Array<{ name?: string; tile_bbox?: unknown; active?: boolean }>
    }
    const detections = (parsed.detections || [])
      .map((d) => {
        const name = (d.name || '').trim()
        const tile_bbox = parseBBox(d.tile_bbox)
        if (!name || !tile_bbox) return null
        return { name, tile_bbox, active: !!d.active }
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .slice(0, 9)

    return {
      t_ms,
      is_meet: !!parsed.is_meet,
      detections,
    }
  } catch (err) {
    console.error('analyzeMeetFrame fallback due to OpenAI error:', err)
    return fallback
  }
}
