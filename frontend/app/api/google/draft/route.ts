import { NextResponse } from 'next/server'
import { createGmailDraft } from '@/lib/google'

export const runtime = 'nodejs'

// POST /api/google/draft { user, to, subject, body }
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      user?: string
      to?: string
      subject?: string
      body?: string
    }
    if (!body.user || !body.to || !body.subject || !body.body) {
      return NextResponse.json(
        { error: 'user, to, subject, body required' },
        { status: 400 },
      )
    }
    const draft = await createGmailDraft(body.user, {
      to: body.to,
      subject: body.subject,
      body: body.body,
    })
    return NextResponse.json({ draft })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'draft failed' },
      { status: 500 },
    )
  }
}
