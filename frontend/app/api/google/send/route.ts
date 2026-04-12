import { NextResponse } from 'next/server'
import { sendGmail } from '@/lib/google'

export const runtime = 'nodejs'

// POST /api/google/send
// { user, to, subject, body, replyTo? }
// Sends the email immediately — no draft fallback. Caller is responsible
// for user confirmation before hitting this.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      user?: string
      to?: string
      subject?: string
      body?: string
      replyTo?: string
    }
    if (!body.user || !body.to || !body.subject || !body.body) {
      return NextResponse.json(
        { error: 'user, to, subject, body required' },
        { status: 400 },
      )
    }
    const sent = await sendGmail(body.user, {
      to: body.to,
      subject: body.subject,
      body: body.body,
      replyTo: body.replyTo,
    })
    return NextResponse.json({ sent })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'send failed' },
      { status: 500 },
    )
  }
}
