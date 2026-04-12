import { NextResponse } from 'next/server'
import { createCalendarEvent } from '@/lib/google'

export const runtime = 'nodejs'

// POST /api/google/event
// { user, summary, description?, startIso, endIso, attendees?, timeZone?, withMeet? }
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      user?: string
      summary?: string
      description?: string
      startIso?: string
      endIso?: string
      attendees?: string[]
      timeZone?: string
      withMeet?: boolean
    }
    if (!body.user || !body.summary || !body.startIso || !body.endIso) {
      return NextResponse.json(
        { error: 'user, summary, startIso, endIso required' },
        { status: 400 },
      )
    }
    const event = await createCalendarEvent(body.user, {
      summary: body.summary,
      description: body.description,
      startIso: body.startIso,
      endIso: body.endIso,
      attendees: body.attendees,
      timeZone: body.timeZone,
      withMeet: body.withMeet ?? true,
    })
    return NextResponse.json({ event })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'event create failed' },
      { status: 500 },
    )
  }
}
