import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { searchMemory } from '@/lib/nia'

export const runtime = 'nodejs'
export const maxDuration = 60

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
  date?: string
}

type ToolSearchResult = {
  query: string
  results: Array<Record<string, unknown>>
}

type StreamEmit = (event: string, payload: Record<string, unknown>) => void

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
    required: ['query', 'limit', 'person_ids'],
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

function sseEncode(event: string, payload: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
}

function chunkAssistantText(text: string): string[] {
  const tokens = text.match(/\S+\s*/g) || []
  if (tokens.length === 0) return [text]

  const chunks: string[] = []
  let buffer = ''
  for (const token of tokens) {
    buffer += token
    if (buffer.length >= 24) {
      chunks.push(buffer)
      buffer = ''
    }
  }
  if (buffer) chunks.push(buffer)
  return chunks.length > 0 ? chunks : [text]
}

async function runSearchTool(
  args: SearchToolArgs,
  selectedPeople: string[]
): Promise<ToolSearchResult> {
  const query = String(args.query || '').trim()
  const limit = Math.min(20, Math.max(1, Number(args.limit || 8)))

  if (!query) return { query: '', results: [] }

  // Person scope is treated as soft bias (via prompt/query shaping), not
  // a hard post-filter, to avoid false negatives from name/id mismatches.
  const scopedQuery =
    selectedPeople.length > 0 ? `${selectedPeople.join(' ')} ${query}` : query
  const results = await searchMemory(scopedQuery, limit)

  return {
    query,
    results: results.slice(0, limit).map((result) => ({
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
  toolResult: ToolSearchResult,
  sink: Map<string, Citation>
) {
  for (const row of toolResult.results) {
    const id = typeof row.id === 'string' ? row.id : ''
    if (!id || sink.has(id)) continue
    const metadata = row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : null
    const rawDate =
      (typeof row.updated_at === 'string' ? row.updated_at : '') ||
      (typeof row.created_at === 'string' ? row.created_at : '') ||
      (metadata && typeof metadata.timestamp === 'string' ? metadata.timestamp : '') ||
      (metadata && typeof metadata.last_seen === 'string' ? metadata.last_seen : '')
    sink.set(id, {
      context_id: id,
      title: typeof row.title === 'string' ? row.title : 'untitled',
      date: rawDate || undefined,
    })
  }
}

function dedupeCitationsByTitle(citations: Citation[]): Citation[] {
  const byTitle = new Map<string, Citation>()

  for (const citation of citations) {
    const key = citation.title.trim().toLowerCase()
    if (!key) continue

    const existing = byTitle.get(key)
    if (!existing) {
      byTitle.set(key, citation)
      continue
    }

    const nextDate = citation.date || ''
    const currentDate = existing.date || ''
    const keepNext = nextDate.localeCompare(currentDate) > 0
    if (keepNext) byTitle.set(key, citation)
  }

  return Array.from(byTitle.values())
}

async function executeMemoryAgent(params: {
  message: string
  selectedPeople: string[]
  emit?: StreamEmit
}): Promise<{ answer: string; citations: Citation[] }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing')
  }

  const openai = new OpenAI({ apiKey })
  const model = process.env.OPENAI_MEMORY_MODEL || 'gpt-4o-mini'
  const { message, selectedPeople, emit } = params

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

      emit?.('tool_call_started', {
        id: call.call_id,
        name: call.name,
        arguments: args,
      })

      let toolResult: ToolSearchResult = { query: String(args.query || ''), results: [] }
      let callError: string | null = null

      try {
        toolResult = await runSearchTool(args, selectedPeople)
        collectCitationsFromToolResult(toolResult, citationsMap)
      } catch (err) {
        callError = err instanceof Error ? err.message : 'tool call failed'
      }

      emit?.('tool_call_finished', {
        id: call.call_id,
        name: call.name,
        ok: callError === null,
        error: callError,
        result_count: toolResult.results.length,
        result_preview: toolResult.results
          .slice(0, 3)
          .map((row) => ({
            id: row.id,
            title: row.title,
            summary: row.summary,
          })),
        citation_ids: toolResult.results
          .map((row) => (typeof row.id === 'string' ? row.id : ''))
          .filter(Boolean),
      })

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

  return {
    answer,
    citations: dedupeCitationsByTitle(Array.from(citationsMap.values())).slice(0, 6),
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MemoryAgentRequest
    const message = String(body.message || '').trim()
    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    const selectedPeople = normalizePersonIds(body.selected_people)
    const url = new URL(request.url)
    const wantsStream =
      url.searchParams.get('stream') === '1' ||
      (request.headers.get('accept') || '').includes('text/event-stream')

    if (!wantsStream) {
      const result = await executeMemoryAgent({ message, selectedPeople })
      return NextResponse.json(result)
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start: async (controller) => {
        const emit: StreamEmit = (event, payload) => {
          controller.enqueue(encoder.encode(sseEncode(event, payload)))
        }

        try {
          const result = await executeMemoryAgent({
            message,
            selectedPeople,
            emit,
          })

          for (const chunk of chunkAssistantText(result.answer)) {
            emit('assistant_delta', { text: chunk })
          }

          emit('assistant_done', {
            answer: result.answer,
            citations: result.citations,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'memory agent failed'
          emit('error', { message })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    console.error('memory agent error:', err)
    return NextResponse.json(
      { error: 'memory agent failed' },
      { status: 500 }
    )
  }
}
