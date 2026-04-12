import { NextResponse } from 'next/server'
import {
  createCalendarEvent,
  createGmailDraft,
  createTask,
} from '@/lib/google'
import type { ActionProposal } from '@/lib/actions'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/actions/execute
// { user: string, proposal: ActionProposal }
// Dispatches to the right google helper and returns the resulting url/id.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      user?: string
      proposal?: ActionProposal
    }
    const user = body.user?.trim()
    if (!user) {
      return NextResponse.json({ error: 'missing user' }, { status: 400 })
    }
    const p = body.proposal
    if (!p) {
      return NextResponse.json({ error: 'missing proposal' }, { status: 400 })
    }

    if (p.kind === 'calendar') {
      const event = await createCalendarEvent(user, {
        summary: p.summary,
        description: p.description,
        startIso: p.startIso,
        endIso: p.endIso,
        attendees: p.attendeeEmails,
        withMeet: p.withMeet,
      })
      return NextResponse.json({
        kind: 'calendar',
        id: event.id,
        htmlLink: event.htmlLink,
        meetUrl: event.meetUrl,
      })
    }

    if (p.kind === 'email_draft') {
      const draft = await createGmailDraft(user, {
        to: p.to,
        subject: p.subject,
        body: p.body,
      })
      return NextResponse.json({
        kind: 'email_draft',
        id: draft.id,
        messageId: draft.messageId,
      })
    }

    if (p.kind === 'task') {
      const task = await createTask(user, {
        title: p.title,
        notes: p.notes,
        dueIso: p.dueIso || undefined,
      })
      return NextResponse.json({ kind: 'task', id: task.id, title: task.title })
    }

    return NextResponse.json(
      { error: `unknown proposal kind: ${(p as { kind: string }).kind}` },
      { status: 400 },
    )
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'execute failed' },
      { status: 500 },
    )
  }
}
