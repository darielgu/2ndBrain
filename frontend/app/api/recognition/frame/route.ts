import { NextResponse } from 'next/server'
import {
  addFaceFrameToProfile,
  enrollFaceEmbedding,
  getProfile,
} from '@/lib/recognition-store'

const CAPTURE_COOLDOWN_MS = 12_000

function decodeJpegDataUrl(dataUrl: string): Buffer | null {
  const match = dataUrl.match(/^data:image\/(jpeg|jpg);base64,(.+)$/i)
  if (!match) return null
  try {
    return Buffer.from(match[2], 'base64')
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const person_id = String(body.person_id || '').trim()
    const frame_data_url = String(body.frame_data_url || '').trim()
    const source =
      body.source === 'manual_confirmed' ? 'manual_confirmed' : 'auto_resolved'
    const confidence = Number.isFinite(Number(body.confidence))
      ? Number(body.confidence)
      : undefined
    const signature = Array.isArray(body.signature)
      ? body.signature.map((v: unknown) => Number(v))
      : []

    if (!person_id || !frame_data_url) {
      return NextResponse.json(
        { error: 'person_id and frame_data_url are required' },
        { status: 400 }
      )
    }

    const profile = await getProfile(person_id)
    if (!profile) {
      return NextResponse.json({ error: 'profile not found' }, { status: 404 })
    }

    const latest = profile.face_frames?.[0]
    if (latest?.captured_at) {
      const elapsed = Date.now() - new Date(latest.captured_at).getTime()
      if (Number.isFinite(elapsed) && elapsed < CAPTURE_COOLDOWN_MS) {
        return NextResponse.json({
          ok: true,
          skipped: 'cooldown',
          last_captured_at: latest.captured_at,
        })
      }
    }

    const jpeg = decodeJpegDataUrl(frame_data_url)
    if (!jpeg || jpeg.length < 1000) {
      return NextResponse.json({ error: 'invalid frame image payload' }, { status: 400 })
    }

    const frame = await addFaceFrameToProfile({
      person_id,
      jpegBuffer: jpeg,
      confidence,
      source,
      signature,
    })

    if (signature.length >= 8) {
      await enrollFaceEmbedding({
        person_id,
        embedding: signature,
        quality: Number.isFinite(confidence) ? confidence : 1,
      }).catch((err) => {
        console.error('frame signature enroll warning:', err)
      })
    }

    return NextResponse.json({ ok: true, frame })
  } catch (err) {
    console.error('frame capture error:', err)
    return NextResponse.json({ error: 'frame capture failed' }, { status: 500 })
  }
}
