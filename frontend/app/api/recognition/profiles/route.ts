import { NextResponse } from 'next/server'
import { getProfile, upsertProfile } from '@/lib/recognition-store'

function isPlaceholderName(value: string | undefined | null): boolean {
  const normalized = String(value || '').trim().toLowerCase()
  return (
    !normalized ||
    normalized === 'new contact' ||
    normalized === 'unknown' ||
    normalized === 'n/a' ||
    normalized.startsWith('pid_')
  )
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const person_id = String(body.person_id || '').trim()
    const requestedName = String(body.name || '').trim()

    if (!person_id || !requestedName) {
      return NextResponse.json(
        { error: 'person_id and name are required' },
        { status: 400 }
      )
    }

    const existing = await getProfile(person_id)
    const incomingConfirmed =
      typeof body.name_confirmed === 'boolean' ? body.name_confirmed : undefined
    const shouldProtectExistingName =
      !!existing &&
      existing.name_confirmed &&
      isPlaceholderName(requestedName) &&
      !isPlaceholderName(existing.name)
    const name = shouldProtectExistingName ? existing.name : requestedName

    const last_location = body.last_location ? String(body.last_location) : undefined
    const where_met = body.where_met ? String(body.where_met) : last_location

    const profile = await upsertProfile({
      person_id,
      name,
      name_confirmed: shouldProtectExistingName ? existing?.name_confirmed : incomingConfirmed,
      where_met,
      summary: body.summary ? String(body.summary) : '',
      open_loops: Array.isArray(body.open_loops)
        ? body.open_loops.map((x: unknown) => String(x))
        : [],
      last_location,
      recent_topics: Array.isArray(body.recent_topics)
        ? body.recent_topics.map((x: unknown) => String(x))
        : undefined,
      last_conversation_summary: body.last_conversation_summary
        ? String(body.last_conversation_summary)
        : undefined,
      last_seen: body.last_seen ? String(body.last_seen) : undefined,
    })

    return NextResponse.json({ profile })
  } catch (err) {
    console.error('profile create error:', err)
    return NextResponse.json({ error: 'create profile failed' }, { status: 500 })
  }
}
