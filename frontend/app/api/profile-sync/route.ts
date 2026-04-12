import { NextResponse } from 'next/server'
import { syncProfiles } from '@/lib/profile-sync'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/profile-sync
// { user: string, extractedNames: string[], existingPersonIds?: string[] }
//
// Returns a summary per person showing whether their profile is new or
// existing, plus any upcoming calendar events we have with them. Called
// automatically at the end of a session.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      user?: string
      extractedNames?: string[]
      existingPersonIds?: string[]
    }
    if (!body.user?.trim()) {
      return NextResponse.json({ error: 'missing user' }, { status: 400 })
    }
    const names = Array.isArray(body.extractedNames)
      ? body.extractedNames.filter((n) => typeof n === 'string' && n.trim())
      : []

    const existingSet = Array.isArray(body.existingPersonIds)
      ? new Set<string>(body.existingPersonIds)
      : undefined

    const results = await syncProfiles({
      user: body.user,
      extractedNames: names,
      existingPersonIdsBeforeSave: existingSet,
    })
    return NextResponse.json({ profiles: results })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'profile-sync failed' },
      { status: 500 },
    )
  }
}
