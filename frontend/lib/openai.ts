import OpenAI from 'openai'
import type { ExtractionResult, TranscriptSegment } from './types'

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
- extract ONLY: people involved, key topics, explicit promises, next actions
- people: max 3. include name, brief role/context, and a prose_summary (see below)
- topics: 1-3 key topics discussed
- promises: ONLY explicit, verbatim commitments. if no promise was made, return an empty array. do NOT infer or assume promises
- next_actions: max 3 concrete next steps mentioned
- prefer precision over recall — "boring but correct" over "smart but wrong"

prose writing:
- prose_summary (per person): 2-4 sentences describing this specific person based ONLY on what the transcript reveals. include their role, what they work on, any relevant facts, and what was promised to or by them. write naturally, as if describing them to a friend. use their name. do NOT invent details.
- episode_prose (whole conversation): 3-5 sentences describing the interaction. mention who was there, what was discussed, any promises made, and next steps. write naturally. do NOT invent details.

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
}
