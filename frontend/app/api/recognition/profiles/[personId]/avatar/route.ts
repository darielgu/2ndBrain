import { readFile, readdir, stat } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/recognition-store'

function safePersonFolderName(personId: string): string {
  return personId.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  try {
    const { personId } = await params
    const person_id = decodeURIComponent(personId)
    const profile = await getProfile(person_id)
    const dataRoot = path.resolve(process.cwd(), '.data')
    const relPath = profile?.face_frames?.[0]?.path

    let resolved: string | null = null
    if (profile && relPath) {
      const candidate = path.resolve(process.cwd(), relPath)
      if (
        (candidate.startsWith(dataRoot + path.sep) || candidate === dataRoot) &&
        (await stat(candidate).then(() => true).catch(() => false))
      ) {
        resolved = candidate
      }
    }

    // Fallback for older/missing metadata: serve the newest face frame from disk.
    if (!resolved) {
      const personDir = path.join(dataRoot, 'face-frames', safePersonFolderName(person_id))
      const entries = await readdir(personDir)
      const jpgs = entries.filter((name) => /\.jpe?g$/i.test(name))
      const withTimes = await Promise.all(
        jpgs.map(async (name) => {
          const abs = path.join(personDir, name)
          const s = await stat(abs)
          return { abs, mtime: s.mtimeMs }
        })
      )
      withTimes.sort((a, b) => b.mtime - a.mtime)
      resolved = withTimes[0]?.abs || null
    }

    if (!resolved) {
      return NextResponse.json({ error: 'avatar not found' }, { status: 404 })
    }
    if (!resolved.startsWith(dataRoot + path.sep) && resolved !== dataRoot) {
      return NextResponse.json({ error: 'invalid avatar path' }, { status: 400 })
    }

    const bytes = await readFile(resolved)
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      },
    })
  } catch {
    return NextResponse.json({ error: 'avatar not found' }, { status: 404 })
  }
}
