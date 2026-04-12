import { NextResponse } from 'next/server'
import { deleteGoogleAccount } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { user?: string }
  const user = body.user?.trim()
  if (!user) {
    return NextResponse.json({ error: 'missing user' }, { status: 400 })
  }
  deleteGoogleAccount(user)
  return NextResponse.json({ disconnected: true })
}
