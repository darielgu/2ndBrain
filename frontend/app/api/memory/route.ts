import { NextRequest, NextResponse } from 'next/server'
import {
  savePersonContext,
  saveEpisodeContext,
  searchMemory,
} from '@/lib/nia'
import type { Person, Episode } from '@/lib/types'

// POST: Save a person or episode to Nia
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { type, data } = body as {
      type: 'person' | 'episode'
      data: Person | Episode
    }

    let id: string
    if (type === 'person') {
      id = await savePersonContext(data as Person)
    } else if (type === 'episode') {
      id = await saveEpisodeContext(data as Episode)
    } else {
      return NextResponse.json(
        { error: 'type must be "person" or "episode"' },
        { status: 400 }
      )
    }

    return NextResponse.json({ id })
  } catch (err) {
    console.error('memory save error:', err)
    return NextResponse.json(
      { error: 'failed to save memory' },
      { status: 500 }
    )
  }
}

// GET: Search memories via Nia semantic search
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q') || ''
    const limit = parseInt(
      request.nextUrl.searchParams.get('limit') || '20',
      10
    )

    if (!q) {
      return NextResponse.json(
        { error: 'query parameter "q" required' },
        { status: 400 }
      )
    }

    const results = await searchMemory(q, limit)
    return NextResponse.json({ results })
  } catch (err) {
    console.error('memory search error:', err)
    return NextResponse.json({ results: [] })
  }
}
