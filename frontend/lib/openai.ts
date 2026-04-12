import OpenAI from 'openai'
import type {
  BBox,
  ExtractionResult,
  FrameAnalysis,
  TranscriptSegment,
} from './types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// --- Transcribe audio using gpt-4o-transcribe ---
// Domain vocabulary helps disambiguate proper nouns and jargon.
const TRANSCRIBE_BASE_PROMPT =
  'conversation for secondbrain, a real-world memory layer powered by nia. speakers may mention: secondbrain, nia, episodes, promises, open loops, next actions, person, people, recognition.'

export async function transcribeAudio(
  audioFile: File,
  priorContext?: string
): Promise<string> {
  // Rolling context window: the tail of the transcript so far gives the
  // model cross-chunk continuity, which whisper otherwise lacks.
  const prompt = priorContext
    ? `${TRANSCRIBE_BASE_PROMPT} prior: ${priorContext.slice(-400)}`
    : TRANSCRIBE_BASE_PROMPT

  const response = await openai.audio.transcriptions.create({
    model: 'gpt-4o-transcribe',
    file: audioFile,
    language: 'en',
    prompt,
  })
  return response.text
}

// --- Split transcribed text into speaker turns ---
// gpt-4o-transcribe doesn't do diarization, so we do a cheap post-process
// pass with gpt-4o-mini to approximate speaker turns from linguistic cues
// (pronouns, question/answer flow, topic shifts). Prior context lets the
// labels stay consistent across 30s chunks.

const SEGMENT_SYSTEM_PROMPT = `you split transcribed conversation text into speaker turns. you never invent words — only segment what's there.

rules:
- output json: { "segments": [{ "speaker": "person1" | "person2" | ..., "text": "..." }] }
- labels are always the literal string "person" + a 1-indexed number (person1, person2, person3). never use real names.
- infer speaker shifts from linguistic cues: question/answer pairing, first/second-person switches, tone shifts, direct address.
- if the text is one continuous monologue, return a single segment.
- reuse labels from prior_context when the same speaker continues. if prior_context ends on person2 and this chunk starts with an answer to a question person2 asked, it is likely person1 responding.
- never drop words — concatenating every segment's text should reproduce the input (whitespace-normalized).
- precision over cleverness. if unsure, keep it as one segment under the most-recent label.`

export async function segmentSpeakers(
  text: string,
  priorContext?: {
    known_speakers: string[]
    last_segment?: TranscriptSegment
  }
): Promise<TranscriptSegment[]> {
  const trimmed = text.trim()
  if (!trimmed) return []

  const contextBlock = priorContext
    ? `prior_context: known_speakers=${JSON.stringify(
        priorContext.known_speakers
      )}${
        priorContext.last_segment
          ? ` last_segment=${JSON.stringify(priorContext.last_segment)}`
          : ''
      }`
    : 'prior_context: none (this is the first chunk)'

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SEGMENT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${contextBlock}\n\nsplit this chunk into speaker turns:\n\n${trimmed}`,
        },
      ],
      temperature: 0,
    })

    const content = response.choices[0]?.message?.content
    if (!content) return [{ speaker: 'person1', text: trimmed }]

    const parsed = JSON.parse(content) as {
      segments?: TranscriptSegment[]
    }
    const segments = (parsed.segments || [])
      .map((s) => ({
        speaker: typeof s.speaker === 'string' ? s.speaker : 'person1',
        text: typeof s.text === 'string' ? s.text.trim() : '',
      }))
      .filter((s) => s.text.length > 0)

    return segments.length > 0
      ? segments
      : [{ speaker: 'person1', text: trimmed }]
  } catch (err) {
    console.error('speaker segmentation failed:', err)
    return [{ speaker: 'person1', text: trimmed }]
  }
}

// --- Extract structured memory from transcript using GPT-4o ---

const EXTRACTION_SYSTEM_PROMPT = `you are a memory extraction agent for secondbrain. given a conversation transcript, extract structured data AND write natural-language prose suitable for a memory index.

rules (strict):
- extract ONLY: people involved, key topics, explicit promises, next actions, and per-person contact fields if explicitly stated.
- people: max 3. include name, brief role/context, prose_summary, and contact fields when stated.
- topics: 1-3 key topics discussed
- promises: ONLY explicit, verbatim commitments. if no promise was made, return an empty array. do NOT infer or assume promises
- next_actions: max 3 concrete next steps mentioned
- prefer precision over recall — "boring but correct" over "smart but wrong"

contact fields (per person — CRITICAL rules):
- only populate email / job_title / company / linkedin_url / phone when the person EXPLICITLY states it in the transcript.
- do NOT guess from context, do NOT infer from a company domain, do NOT fabricate.
- if a field wasn't stated, omit it entirely from the json (don't include the key at all).

EMAILS — TRANSCRIPTION HANDLING (very important):
speech-to-text writes emails phonetically. reconstruct them:
- "jane at acme dot com" → "jane@acme.com"
- "j dash smith at acme dot com" → "j-smith@acme.com"
- "jane underscore smith at acme" → "jane_smith@acme.com" (only if the tld is also stated)
- "D-A-R-I-L at punchai dot com" (letter-spelling) → "daril@punchai.com"
- do not auto-correct spelling. if someone spells "D-A-R-I-L" letter-by-letter, use that exact sequence, do NOT change it to "daryl" even if that's a more common spelling.
- require a recognizable domain ending (dot com / dot io / dot co / .edu / etc) — if the tld is missing, omit the field.
- the address must have a clearly-identifiable local-part and domain. ambiguous mentions like "email me" without an address → omit.
- if the same person states TWO different emails in the same transcript, use the LAST one stated (they're likely correcting themselves).

NAMES:
- when a speaker spells their name letter-by-letter ("D-A-R-I-L"), use that exact spelling as the name. do not normalize to a more common variant.
- use the spelled form even if it disagrees with an earlier mention that was transcribed auto-correctively.

OTHER CONTACT FIELDS:
- linkedin_url: full url or clear handle only.
- phone: reconstruct "four one five" → "415"; digits only.

prose writing:
- prose_summary (per person): 2-4 sentences describing this specific person based ONLY on what the transcript reveals. include their role, what they work on, any relevant facts, and what was promised to or by them. write naturally, as if describing them to a friend. use their name. do NOT invent details.
- episode_prose (whole conversation): 3-5 sentences describing the interaction. mention who was there, what was discussed, any promises made, and next steps. write naturally. do NOT invent details.

return valid json matching this exact schema:
{
  "people": [
    {
      "name": "string",
      "role_or_context": "string or null",
      "prose_summary": "2-4 sentence prose paragraph about this person",
      "email": "optional — only if explicitly said",
      "job_title": "optional — only if explicitly said",
      "company": "optional — only if explicitly said",
      "linkedin_url": "optional — only if explicitly said",
      "phone": "optional — only if explicitly said"
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
    return {
      people: [],
      topics: ['unknown'],
      promises: [],
      next_actions: [],
      episode_prose: '',
    }
  }

  const parsed = JSON.parse(content) as ExtractionResult

  // Normalize people entries — ensure each has a prose_summary and only
  // carry contact fields that were explicitly set (no empty-string keys).
  const validEmail = (e?: string): string | undefined => {
    if (!e || typeof e !== 'string') return undefined
    const trimmed = e.trim()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : undefined
  }
  const nonEmpty = (s?: string): string | undefined => {
    if (!s || typeof s !== 'string') return undefined
    const trimmed = s.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  const people = (parsed.people || []).slice(0, 3).map((p) => ({
    name: p.name,
    role_or_context: p.role_or_context,
    prose_summary: p.prose_summary || '',
    email: validEmail(p.email),
    job_title: nonEmpty(p.job_title),
    company: nonEmpty(p.company),
    linkedin_url: nonEmpty(p.linkedin_url),
    phone: nonEmpty(p.phone),
  }))

  return {
    people,
    topics: (parsed.topics || []).slice(0, 3),
    promises: parsed.promises || [],
    next_actions: (parsed.next_actions || []).slice(0, 3),
    episode_prose: parsed.episode_prose || '',
  }
}

// --- Vision: Google Meet frame analysis ---
// Sampled frames from screen recordings are sent here one at a time.
// Returns the detected participants + who (if anyone) is the active
// speaker in this frame. Bboxes are normalized to [0, 1] because models
// handle normalized coords more consistently than raw pixels.

const MEET_VISION_SYSTEM_PROMPT = `you are a computer vision agent analyzing a screenshot. return only valid json matching this schema:

{
  "is_meet": boolean,
  "detections": [
    { "name": string, "tile_bbox": [number, number, number, number], "active": boolean }
  ]
}

instructions:
1. determine if this is a google meet video call screenshot. look for: grid of video tiles, participant name labels, meet ui bar. if not, return is_meet=false and detections=[].
2. if it is google meet: for each visible participant tile with a readable name:
   - "name": exactly as shown in the name label (preserve case and spacing). if you only see a "you" label, use the literal string "you".
   - "tile_bbox": [x, y, w, h] normalized to [0, 1] where (0,0) is top-left and (1,1) is bottom-right. tightly enclose the participant's video tile including the name label strip at the bottom.
   - "active": true only if this tile has a visible colored border (typically blue) indicating they are the currently active speaker. at most one tile should have active=true. if no tile clearly shows an active-speaker border, set active=false for all.
3. only include tiles where the name is clearly legible. skip tiles where you can't read the name.
4. return at most 9 detections.
5. precision over recall — skip ambiguous tiles rather than guess names.`

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
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: MEET_VISION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'analyze this frame and return the json.',
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl, detail: 'low' },
            },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 600,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return { t_ms, is_meet: false, detections: [] }
    }

    const parsed = JSON.parse(content) as {
      is_meet?: boolean
      detections?: Array<{
        name?: unknown
        tile_bbox?: unknown
        active?: unknown
      }>
    }

    if (!parsed.is_meet) {
      return { t_ms, is_meet: false, detections: [] }
    }

    const detections = (parsed.detections || [])
      .map((d) => {
        const bbox = parseBBox(d.tile_bbox)
        const name = typeof d.name === 'string' ? d.name.trim() : ''
        if (!bbox || !name) return null
        return {
          name,
          tile_bbox: bbox,
          active: d.active === true,
        }
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .slice(0, 9)

    // Enforce "at most one active per frame" in case the model slipped.
    let sawActive = false
    for (const d of detections) {
      if (d.active) {
        if (sawActive) d.active = false
        else sawActive = true
      }
    }

    return { t_ms, is_meet: true, detections }
  } catch (err) {
    console.error('vision analyze failed:', err)
    return { t_ms, is_meet: false, detections: [] }
  }
}
