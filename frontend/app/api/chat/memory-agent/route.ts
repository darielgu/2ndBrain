import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { filterResultsByPersonIds, searchMemory } from '@/lib/nia'

type MemoryAgentRequest = {
  message?: string
  selected_people?: string[]
}

type SearchToolArgs = {
  query?: string
  limit?: number
  person_ids?: string[]
}

type Citation = {
  context_id: string
  title: string
}

const SYSTEM_PROMPT = [
  'you are secondbrain memory chat.',
  'ground answers only in nia tool results.',
  'be short and direct: 1-2 sentences, lowercase.',
  'if evidence is missing, say so plainly.',
  'never invent promises or events.',
].join(' ')

const SEARCH_TOOL = {
  type: 'function' as const,
  name: 'search_memory',
  description: 'Search Nia indexed memory contexts for people, episodes, promises, and follow-ups.',
  strict: true,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural-language memory query to search for.' },
      limit: { type: 'number', description: 'Max results to return (1-20).' },
      person_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of person IDs to scope results.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
}

function normalizePersonIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  return ids.map((id) => String(id).trim()).filter(Boolean)
}

function parseToolArgs(raw: string): SearchToolArgs {
  try {
    const parsed = JSON.parse(raw) as SearchToolArgs
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function runSearchTool(
  args: SearchToolArgs,
  selectedPeople: string[]
): Promise<{ query: string; results: Array<Record<string, unknown>> }> {
  const query = String(args.query || '').trim()
  const mergedPersonIds = Array.from(
    new Set([...selectedPeople, ...normalizePersonIds(args.person_ids)])
  )
  const limit = Math.min(20, Math.max(1, Number(args.limit || 8)))

  if (!query) return { query: '', results: [] }

  const results = await searchMemory(query, limit)
  const filtered = filterResultsByPersonIds(results, mergedPersonIds)

  return {
    query,
    results: filtered.slice(0, limit).map((result) => ({
      id: result.id,
      title: result.title,
      summary: result.summary,
      tags: result.tags,
      metadata: result.metadata,
      updated_at: result.updated_at,
    })),
  }
}

function extractFunctionCalls(response: any): Array<{ name: string; call_id: string; arguments: string }> {
  const output = Array.isArray(response?.output) ? response.output : []
  return output
    .filter((item: any) => item?.type === 'function_call')
    .map((item: any) => ({
      name: String(item?.name || ''),
      call_id: String(item?.call_id || item?.id || ''),
      arguments: String(item?.arguments || '{}'),
    }))
    .filter((call: { name: string; call_id: string; arguments: string }) => Boolean(call.call_id) && Boolean(call.name))
}

function collectCitationsFromToolResult(
  toolResult: { results: Array<Record<string, unknown>> },
  sink: Map<string, Citation>
) {
  for (const row of toolResult.results) {
    const id = typeof row.id === 'string' ? row.id : ''
    if (!id || sink.has(id)) continue
    sink.set(id, {
      context_id: id,
      title: typeof row.title === 'string' ? row.title : 'untitled',
    })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MemoryAgentRequest
    const message = String(body.message || '').trim()
    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is missing' }, { status: 500 })
    }

    const selectedPeople = normalizePersonIds(body.selected_people)
    const openai = new OpenAI({ apiKey })
    const model = process.env.OPENAI_MEMORY_MODEL || 'gpt-4o-mini'

    let response: any = await openai.responses.create({
      model,
      instructions: SYSTEM_PROMPT,
      input: selectedPeople.length > 0
        ? `Selected people scope: ${selectedPeople.join(', ')}\n\nUser question: ${message}`
        : `User question: ${message}`,
      tools: [SEARCH_TOOL],
      tool_choice: 'auto',
    })

    const citationsMap = new Map<string, Citation>()

    for (let step = 0; step < 3; step++) {
      const calls = extractFunctionCalls(response)
      if (calls.length === 0) break

      const toolOutputs: Array<{ type: 'function_call_output'; call_id: string; output: string }> = []

      for (const call of calls) {
        if (call.name !== 'search_memory') continue
        const args = parseToolArgs(call.arguments)
        const toolResult = await runSearchTool(args, selectedPeople)
        collectCitationsFromToolResult(toolResult, citationsMap)

        toolOutputs.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify(toolResult),
        })
      }

      if (toolOutputs.length === 0) break

      response = await openai.responses.create({
        model,
        instructions: SYSTEM_PROMPT,
        previous_response_id: response.id,
        input: toolOutputs,
        tools: [SEARCH_TOOL],
        tool_choice: 'auto',
      })
    }

    const answer =
      typeof response?.output_text === 'string' && response.output_text.trim()
        ? response.output_text.trim()
        : 'no reliable memory evidence found for that yet.'

    return NextResponse.json({
      answer,
      citations: Array.from(citationsMap.values()).slice(0, 6),
    })
  } catch (err) {
    console.error('memory agent error:', err)
    return NextResponse.json(
      { error: 'memory agent failed' },
      { status: 500 }
    )
  }
}
