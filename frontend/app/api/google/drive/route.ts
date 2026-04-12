import { NextResponse } from 'next/server'
import { listDriveFiles, getDriveDocText } from '@/lib/google'

export const runtime = 'nodejs'

// GET /api/google/drive?user=<slug>&q=<drive-query>&fileId=<id>
// - fileId present → return exported plain text for a google doc
// - otherwise → list files matching q
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const user = url.searchParams.get('user')?.trim()
    if (!user) return NextResponse.json({ error: 'missing user' }, { status: 400 })

    const fileId = url.searchParams.get('fileId')?.trim()
    if (fileId) {
      const text = await getDriveDocText(user, fileId)
      return NextResponse.json({ fileId, text })
    }

    const q = url.searchParams.get('q') || 'trashed = false'
    const files = await listDriveFiles(user, { query: q })
    return NextResponse.json({ files })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'drive failed' },
      { status: 500 },
    )
  }
}
