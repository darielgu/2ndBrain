import OpenAI from 'openai'
import type { ExtractionResult } from './types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// --- Transcribe audio using Whisper ---
export async function transcribeAudio(audioFile: File): Promise<string> {
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
