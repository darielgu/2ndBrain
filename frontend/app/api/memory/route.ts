import { NextRequest, NextResponse } from 'next/server'
import {
  savePersonContext,
  saveEpisodeContext,
  searchMemory,
  listPeople,
  listEpisodes,
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

// GET:
//   ?type=person   → list all people stored by secondbrain (sorted newest)
//   ?type=episode  → list all episodes (sorted newest)
//   ?q=<query>     → semantic search across all contexts
export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type')
    const limit = parseInt(
      request.nextUrl.searchParams.get('limit') || '100',
      10
    )

    if (type === 'person') {
      const people = await listPeople(limit)
      return NextResponse.json({ people })
    }

    if (type === 'episode') {
      const episodes = await listEpisodes(limit)
      return NextResponse.json({ episodes })
    }

    const q = request.nextUrl.searchParams.get('q') || ''
    if (!q) {
      return NextResponse.json(
        { error: 'query parameter "q" or "type" required' },
        { status: 400 }
      )
    }

    const results = await searchMemory(q, limit)
    return NextResponse.json({ results })
  } catch (err) {
    console.error('memory GET error:', err)
    return NextResponse.json(
      { error: 'failed to fetch memory' },
      { status: 500 }
    )
  }
}
