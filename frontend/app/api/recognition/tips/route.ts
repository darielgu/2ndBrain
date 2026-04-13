import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import {
  bestEpisodeSummaryForPerson,
  findPersonByPersonId,
  searchMemory,
} from '@/lib/nia'
import { getProfile } from '@/lib/recognition-store'

export const runtime = 'nodejs'

const AGENT_LINE_SYSTEM_PROMPT =
  'write one short line the user can say next. one sentence, under 14 words, concrete, no fluff, no invention.'

function fallbackAgentLine(input: {
  name?: string
  open_loop?: string
}): string {
  const name = String(input.name || 'there').trim()
  const openLoop = String(input.open_loop || '').trim()
  if (openLoop) return `say: hey ${name}, i still owe you ${openLoop}.`
  return `say: hey ${name}, good to see you again.`
}

async function buildAgentLine(input: {
  name?: string
  summary?: string
  open_loop?: string
  last_conversation_summary?: string
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return fallbackAgentLine(input)

  try {
    const openai = new OpenAI({ apiKey })
    const model = process.env.OPENAI_MEMORY_MODEL || 'gpt-4o-mini'
    const prompt = [
      `name: ${input.name || 'unknown'}`,
      `summary: ${input.summary || ''}`,
      `open_loop: ${input.open_loop || ''}`,
      `last_conversation_summary: ${input.last_conversation_summary || ''}`,
    ].join('\n')

    const response = await openai.responses.create({
      model,
      instructions: AGENT_LINE_SYSTEM_PROMPT,
      input: prompt,
    })
    const line =
      typeof response.output_text === 'string'
        ? response.output_text.trim()
        : ''
    return line || fallbackAgentLine(input)
  } catch {
    return fallbackAgentLine(input)
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const personId = String(url.searchParams.get('person_id') || '').trim()

    if (!personId) {
      return NextResponse.json({ error: 'person_id is required' }, { status: 400 })
    }

    const personMatch = await findPersonByPersonId(personId)
    if (!personMatch) {
      return NextResponse.json({ error: 'person not found in nia' }, { status: 404 })
    }

    const person = personMatch.person
    const localProfile = await getProfile(personId)
    const related = await searchMemory(personId.replace(/_/g, ' '), 20)
    const lastSummary = bestEpisodeSummaryForPerson(related, personId)
    const agentLine = await buildAgentLine({
      name: person.name,
      summary: person.summary,
      open_loop: person.open_loops?.[0],
      last_conversation_summary: lastSummary,
    })

    return NextResponse.json({
      tip: {
        person_id: person.person_id,
        name: person.name,
        where_met: person.where_met,
        summary: person.summary,
        open_loops: person.open_loops,
        last_conversation_summary: lastSummary,
        last_seen: person.last_seen,
        last_location: localProfile?.last_location || '',
        agent_line: agentLine,
      },
    })
  } catch (err) {
    console.error('nia tips error:', err)
    return NextResponse.json(
      { error: 'failed to load nia tips' },
      { status: 502 }
    )
  }
}
