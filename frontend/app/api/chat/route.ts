import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { searchMemory, type NiaSearchResult } from '@/lib/nia'

export const runtime = 'nodejs'
export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

type ChatRole = 'user' | 'assistant'
type ChatMessage = { role: ChatRole; text: string }

const SYSTEM_PROMPT = `you are secondbrain memory chat.
use only provided memory context.
be short and direct: 1-2 sentences, lowercase.
never invent people, events, or promises.
if memory is missing, say that plainly.`

function formatMemoryContext(results: NiaSearchResult[]): string {
  if (results.length === 0) return 'no relevant memory found.'
  return results
    .slice(0, 8)
    .map((r, i) => {
      const meta = r.metadata || {}
      const tag = Array.isArray(r.tags) ? r.tags.join(', ') : ''
      return `#${i + 1} [${tag}] ${r.title || 'untitled'}\nsummary: ${r.summary || ''}\ncontent: ${r.content || ''}\nmetadata: ${JSON.stringify(meta)}`
    })
    .join('\n\n')
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      messages = [],
      personIds = [],
    } = body as { messages: ChatMessage[]; personIds?: string[] }

    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const query = lastUser?.text?.trim() || ''

    if (!query) {
      return NextResponse.json(
        { error: 'no user message' },
        { status: 400 },
      )
    }

    // Build a search query that biases toward selected people if any.
    const scopedQuery =
      personIds.length > 0 ? `${personIds.join(' ')} ${query}` : query

    let memoryResults: NiaSearchResult[] = []
    try {
      memoryResults = await searchMemory(scopedQuery, 12)
    } catch (err) {
      console.error('nia search failed:', err)
    }

    // If personIds are set, prefer results whose tags or metadata match.
    const filtered =
      personIds.length > 0
        ? memoryResults.filter((r) => {
            const tags = Array.isArray(r.tags) ? r.tags : []
            const meta = r.metadata as Record<string, unknown> | null
            const metaPid =
              meta && typeof meta.person_id === 'string' ? meta.person_id : ''
            const metaPids =
              meta && Array.isArray(meta.person_ids)
                ? (meta.person_ids as unknown[]).filter(
                    (v): v is string => typeof v === 'string',
                  )
                : []
            return (
              personIds.some((pid) => tags.includes(pid)) ||
              personIds.includes(metaPid) ||
              metaPids.some((pid) => personIds.includes(pid))
            )
          })
        : memoryResults

    const context = formatMemoryContext(
      filtered.length > 0 ? filtered : memoryResults,
    )

    const history = messages.slice(-10).map((m) => ({
      role: m.role,
      content: m.text,
    })) as { role: ChatRole; content: string }[]

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'system',
          content: `memory context retrieved from nia:\n\n${context}`,
        },
        ...history,
      ],
    })

    const reply =
      completion.choices[0]?.message?.content?.trim() ||
      'no answer could be formed from memory.'

    const citations = (filtered.length > 0 ? filtered : memoryResults)
      .slice(0, 4)
      .map((r) => ({
        id: r.id,
        title: r.title,
        tags: r.tags,
      }))

    return NextResponse.json({ reply, citations })
  } catch (err) {
    console.error('chat error:', err)
    return NextResponse.json(
      { error: 'chat failed' },
      { status: 500 },
    )
  }
}
