import { NextResponse } from 'next/server'
import { ingestGmail, ingestCalendar, ingestContacts } from '@/lib/ingest'

export const runtime = 'nodejs'
export const maxDuration = 300

type IngestSource = 'gmail' | 'calendar' | 'contacts'

// POST /api/ingest  { user: string, sources?: IngestSource[], gmailDays?: number }
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      user?: string
      sources?: IngestSource[]
      gmailDays?: number
      gmailMax?: number
    }
    const user = body.user?.trim()
    if (!user) {
      return NextResponse.json({ error: 'missing user' }, { status: 400 })
    }
    const sources: IngestSource[] =
      body.sources && body.sources.length > 0
        ? body.sources
        : ['gmail', 'calendar', 'contacts']

    const results: Record<string, unknown> = {}

    if (sources.includes('contacts')) {
      try {
        results.contacts = await ingestContacts(user)
      } catch (err) {
        results.contacts = { error: errMsg(err) }
      }
    }
    if (sources.includes('calendar')) {
      try {
        results.calendar = await ingestCalendar(user)
      } catch (err) {
        results.calendar = { error: errMsg(err) }
      }
    }
    if (sources.includes('gmail')) {
      try {
        results.gmail = await ingestGmail(user, {
          days: body.gmailDays ?? 14,
          maxResults: body.gmailMax ?? 20,
        })
      } catch (err) {
        results.gmail = { error: errMsg(err) }
      }
    }

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    return NextResponse.json({ error: errMsg(err) }, { status: 500 })
  }
}

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : 'unknown error'
}
