import { NextResponse } from 'next/server'
import { analyzeMeetFrame } from '@/lib/openai'
import type { FrameAnalysis } from '@/lib/types'

// Runs gpt-4o-mini vision over a batch of sampled frames from a screen
// recording. Clients (lib/vision-client.ts) chunk frames into small
// batches to keep the request body under the Next.js 4MB limit and to
// surface progress.
//
// Request body:
//   { frames: [{ t_ms: number, data_url: string }] }
// Response:
//   { analyses: FrameAnalysis[] } — parallel to input order

interface FrameInput {
  t_ms: number
  data_url: string
}

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { frames?: unknown }
    const rawFrames = Array.isArray(body.frames) ? body.frames : []

    const frames: FrameInput[] = rawFrames
      .map((f): FrameInput | null => {
        if (!f || typeof f !== 'object') return null
        const t_ms = (f as Record<string, unknown>).t_ms
        const data_url = (f as Record<string, unknown>).data_url
        if (typeof t_ms !== 'number' || typeof data_url !== 'string') {
          return null
        }
        if (!data_url.startsWith('data:image/')) return null
        return { t_ms, data_url }
      })
      .filter((f): f is FrameInput => f !== null)

    if (frames.length === 0) {
      return NextResponse.json({ analyses: [] })
    }

    // Fan out in parallel. Batch size is already controlled client-side,
    // so a straight Promise.all keeps latency bounded to a single frame's
    // worst-case time.
    const analyses: FrameAnalysis[] = await Promise.all(
      frames.map((f) => analyzeMeetFrame(f.data_url, f.t_ms))
    )

    return NextResponse.json({ analyses })
  } catch (err) {
    console.error('vision-analyze error:', err)
    return NextResponse.json({ analyses: [] })
  }
}
