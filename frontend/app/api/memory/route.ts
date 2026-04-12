import { NextRequest, NextResponse } from 'next/server'
import {
  savePersonContext,
  saveEpisodeContext,
  searchMemory,
  listPeople,
  listEpisodes,
} from '@/lib/nia'
import { listProfiles } from '@/lib/recognition-store'
import type { RecognitionProfile } from '@/lib/recognition-types'
import type { Person, Episode } from '@/lib/types'

function isPidLike(value: string | undefined): boolean {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized.startsWith('pid_')
}

function normalizeName(value: string | undefined): string {
  return String(value || '').trim().toLowerCase()
}

function isPlaceholderName(value: string | undefined): boolean {
  const normalized = normalizeName(value)
  return (
    !normalized ||
    normalized === 'new contact' ||
    normalized === 'unknown' ||
    normalized === 'n/a' ||
    normalized.startsWith('pid_')
  )
}

function pickName(a: string, b: string): string {
  if (!isPlaceholderName(a) && isPlaceholderName(b)) return a
  if (!isPlaceholderName(b) && isPlaceholderName(a)) return b
  return b.length > a.length ? b : a
}

function pickLonger(a: string, b: string): string {
  const left = (a || '').trim()
  const right = (b || '').trim()
  return right.length > left.length ? right : left
}

function isoOrZero(value: string | undefined): string {
  return value && value.trim() ? value : '1970-01-01T00:00:00.000Z'
}

function profileToPerson(profile: RecognitionProfile): Person {
  return {
    person_id: profile.person_id,
    name: profile.name || profile.person_id,
    where_met: profile.where_met || '',
    summary: profile.summary || '',
    open_loops: Array.isArray(profile.open_loops) ? profile.open_loops : [],
    last_seen: profile.last_seen || profile.updated_at || new Date().toISOString(),
  }
}

function mergePerson(a: Person, b: Person): Person {
  const latestSeen =
    isoOrZero(b.last_seen).localeCompare(isoOrZero(a.last_seen)) > 0
      ? b.last_seen
      : a.last_seen
  return {
    ...a,
    ...b,
    person_id: a.person_id,
    name: pickName(a.name, b.name),
    where_met: pickLonger(a.where_met, b.where_met),
    summary: pickLonger(a.summary, b.summary),
    open_loops: Array.from(
      new Set([...(a.open_loops || []), ...(b.open_loops || [])].filter(Boolean))
    ),
    last_seen: latestSeen,
  }
}

function mergePeopleSources(memoryPeople: Person[], recognitionPeople: Person[]): Person[] {
  const byId = new Map<string, Person>()
  const byName = new Map<string, string[]>()

  const indexName = (name: string, id: string) => {
    const norm = normalizeName(name)
    if (!norm) return
    const existing = byName.get(norm) || []
    if (!existing.includes(id)) existing.push(id)
    byName.set(norm, existing)
  }

  for (const person of memoryPeople) {
    byId.set(person.person_id, person)
    indexName(person.name, person.person_id)
  }

  for (const person of recognitionPeople) {
    const existingById = byId.get(person.person_id)
    if (existingById) {
      byId.set(person.person_id, mergePerson(existingById, person))
      continue
    }

    const norm = normalizeName(person.name)
    if (norm) {
      const ids = byName.get(norm) || []
      const sameName = ids
        .map((id) => byId.get(id))
        .filter((entry): entry is Person => Boolean(entry))
      const pidLikeCandidate = sameName.find((entry) =>
        isPidLike(entry.person_id) || isPidLike(person.person_id)
      )
      if (pidLikeCandidate) {
        byId.set(
          pidLikeCandidate.person_id,
          mergePerson(pidLikeCandidate, person)
        )
        continue
      }
    }

    byId.set(person.person_id, person)
    indexName(person.name, person.person_id)
  }

  return Array.from(byId.values()).sort((a, b) => {
    const seenCompare = isoOrZero(b.last_seen).localeCompare(isoOrZero(a.last_seen))
    if (seenCompare !== 0) return seenCompare
    return (a.name || '').localeCompare(b.name || '')
  })
}

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
      const [people, profiles] = await Promise.all([
        listPeople(limit),
        listProfiles(),
      ])
      const recognitionPeople = profiles.map(profileToPerson)
      const merged = mergePeopleSources(people, recognitionPeople).slice(0, limit)
      return NextResponse.json({ people: merged })
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
