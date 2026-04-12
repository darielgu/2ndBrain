import { NextResponse } from 'next/server'
import { getGoogleAccount } from '@/lib/db'
import { serializeAccount } from '@/lib/google'

export const runtime = 'nodejs'

// GET /api/auth/google/status?user=<slug>
export async function GET(request: Request) {
  const url = new URL(request.url)
  const user = url.searchParams.get('user')?.trim()
  if (!user) {
    return NextResponse.json({ connected: false })
  }
  const row = getGoogleAccount(user)
  if (!row) {
    return NextResponse.json({ connected: false })
  }
  return NextResponse.json({ connected: true, account: serializeAccount(row) })
}
