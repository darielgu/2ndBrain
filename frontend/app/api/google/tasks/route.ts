import { NextResponse } from 'next/server'
import { listTasks, createTask } from '@/lib/google'

export const runtime = 'nodejs'

// GET /api/google/tasks?user=<slug>
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const user = url.searchParams.get('user')?.trim()
    if (!user) return NextResponse.json({ error: 'missing user' }, { status: 400 })
    const tasks = await listTasks(user)
    return NextResponse.json({ tasks })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'tasks list failed' },
      { status: 500 },
    )
  }
}

// POST /api/google/tasks { user, title, notes?, dueIso? }
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      user?: string
      title?: string
      notes?: string
      dueIso?: string
    }
    if (!body.user || !body.title) {
      return NextResponse.json(
        { error: 'user + title required' },
        { status: 400 },
      )
    }
    const task = await createTask(body.user, {
      title: body.title,
      notes: body.notes,
      dueIso: body.dueIso,
    })
    return NextResponse.json({ task })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'task create failed' },
      { status: 500 },
    )
  }
}
