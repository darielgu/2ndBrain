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
- extract ONLY: people involved, key topics, explicit promises, next actions, and per-person contact fields if explicitly stated.
- people: max 3. include name, brief role/context, prose_summary, and contact fields when stated.
- IMPORTANT: if a "speaker (the user)" name is provided in the user message, that person is the app's user — do NOT include them in people[]. people[] is the user's CONTACTS, not the user themselves. match case-insensitively and tolerate small spelling variants.
- topics: 1-3 key topics discussed
- promises: ONLY explicit, verbatim commitments. if no promise was made, return an empty array. do NOT infer or assume promises
- next_actions: max 3 concrete follow-ups or next steps mentioned
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

important:
- if transcript is short/noisy, still provide the best non-empty episode_prose you can from available evidence.
- if nothing concrete is available for a field, return empty arrays (not null) and keep prose conservative.

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

/**
 * Rewrite spoken email addresses in a transcript into real addresses so the
 * extraction LLM sees them as normal emails instead of fragmented letters.
 *
 * Handles:
 *   "D-A-R-I-E-L-G-U-T-I-E-R-R-E-Z @gmail.com"     → "darielgutierrez@gmail.com"
 *   "D-A-R-I-E-L-G-U-T-I-E-R-R-E-Z\n@gmail.com"   → "darielgutierrez@gmail.com"
 *   "jane at acme dot com"                         → "jane@acme.com"
 *   "jane dot smith at acme dot com"               → "jane.smith@acme.com"
 *   "J-A-N-E at acme dot com"                      → "jane@acme.com"
 *
 * Conservative: requires a recognizable TLD for "word at word dot word"
 * patterns so "meet at 6pm" or "stay at that hotel" aren't reshaped.
 */
export function reconstructSpokenEmails(transcript: string): string {
  let out = transcript

  // Pattern A1: letter-spelling directly followed by @domain (no interruption)
  // "A-B-C-D @gmail.com"
  out = out.replace(
    /((?:[A-Za-z]-){2,}[A-Za-z])\s*@\s*([A-Za-z0-9-]+(?:\.[A-Za-z]{2,}){1,3})/g,
    (_, spelled: string, domain: string) => {
      const local = spelled.replace(/-/g, '').toLowerCase()
      return `${local}@${domain.toLowerCase()}`
    },
  )

  // Pattern A2: letter-spelling, then a speaker label ("\nName: "), then @domain.
  // This happens when the domain lands in the next speaker's turn:
  //   person2: Yeah. D-A-R-I-E-L-G-U-T-I-E-R-R-E-Z
  //   daniel gutierrez: @gmail.com
  out = out.replace(
    /((?:[A-Za-z]-){2,}[A-Za-z])[\s.]*\n[a-zA-Z][\w\s]{0,40}:\s*@\s*([A-Za-z0-9-]+(?:\.[A-Za-z]{2,}){1,3})/g,
    (_, spelled: string, domain: string) => {
      const local = spelled.replace(/-/g, '').toLowerCase()
      return `${local}@${domain.toLowerCase()}`
    },
  )

  // Pattern B: letter-by-letter + "at" word + "dot" word
  // "A-B-C at gmail dot com"
  out = out.replace(
    /((?:[A-Za-z]-){2,}[A-Za-z])\s+(?:at|@)\s+([A-Za-z0-9-]+)\s+(?:dot|\.)\s+([A-Za-z]{2,10})\b/gi,
    (_, spelled: string, domain: string, tld: string) => {
      const local = spelled.replace(/-/g, '').toLowerCase()
      return `${local}@${domain.toLowerCase()}.${tld.toLowerCase()}`
    },
  )

  // Pattern C: word "dot" word "at" word "dot" word
  // "jane dot smith at acme dot com"
  out = out.replace(
    /\b([A-Za-z][A-Za-z0-9]*)\s+(?:dot|\.)\s+([A-Za-z][A-Za-z0-9]*)\s+(?:at|@)\s+([A-Za-z][A-Za-z0-9-]*)\s+(?:dot|\.)\s+([A-Za-z]{2,10})\b/gi,
    (match, a: string, b: string, c: string, d: string) => {
      const tld = d.toLowerCase()
      if (!KNOWN_TLDS.has(tld)) return match
      return `${a.toLowerCase()}.${b.toLowerCase()}@${c.toLowerCase()}.${tld}`
    },
  )

  // Pattern D: word "at" word "dot" word (simplest form)
  // "jane at acme dot com" → "jane@acme.com"
  // "c-s-h-e-a-t-89 at gmail dot com" → "csheat89@gmail.com" (dashes stripped)
  out = out.replace(
    /\b([A-Za-z][A-Za-z0-9._-]{1,40})\s+(?:at|@)\s+([A-Za-z][A-Za-z0-9-]{1,40})\s+(?:dot|\.)\s+([A-Za-z]{2,10})\b/gi,
    (match, local: string, domain: string, tld: string) => {
      const tldLower = tld.toLowerCase()
      if (!KNOWN_TLDS.has(tldLower)) return match
      if (FALSE_POSITIVE_LOCALS.has(local.toLowerCase())) return match
      // Strip dashes from letter-spelled locals like "c-s-h-e-a-t-89".
      // Detects: all characters are alphanumeric singles separated by dashes.
      let cleanLocal = local.toLowerCase()
      if (/^(?:[a-z0-9]-)+[a-z0-9]+$/i.test(local)) {
        cleanLocal = local.replace(/-/g, '').toLowerCase()
      }
      return `${cleanLocal}@${domain.toLowerCase()}.${tldLower}`
    },
  )

  return out
}

const KNOWN_TLDS = new Set([
  'com',
  'net',
  'org',
  'io',
  'co',
  'ai',
  'app',
  'dev',
  'me',
  'edu',
  'gov',
  'us',
  'uk',
  'ca',
  'de',
  'fr',
  'au',
  'jp',
  'in',
  'cn',
  'xyz',
  'tv',
  'info',
  'biz',
  'tech',
])

// Words commonly preceded by "at ... dot ..." that AREN'T people giving
// email addresses — skip these to avoid false positives.
const FALSE_POSITIVE_LOCALS = new Set([
  'meet',
  'stay',
  'arrive',
  'be',
  'see',
  'look',
  'go',
  'come',
  'get',
])

export async function extractMemory(
  transcript: string,
  opts: { speakerName?: string } = {},
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

  // Pre-normalize spoken emails ("d-a-r-i-l at gmail dot com" → the literal
  // address) so the extraction llm doesn't need to reconstruct them itself.
  const normalized = reconstructSpokenEmails(transcript)

  const speakerLine = opts.speakerName
    ? `speaker (the user): ${opts.speakerName} — exclude this person from people[].\n\n`
    : ''

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${speakerLine}extract structured memory from this transcript (spoken emails have been pre-normalized to real addresses — use them verbatim):\n\n${normalized}`,
        },
      ],
      temperature: 0.1,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return fallback
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

    const speakerKey = (opts.speakerName || '').trim().toLowerCase()
    const people = (parsed.people || [])
      .filter((p) => {
        if (!p?.name) return false
        if (!speakerKey) return true
        return p.name.trim().toLowerCase() !== speakerKey
      })
      .slice(0, 3)
      .map((p) => ({
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
