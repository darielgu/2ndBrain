import { NextResponse } from 'next/server'
import { segmentSpeakers, transcribeAudio } from '@/lib/openai'
import type { TranscriptSegment } from '@/lib/types'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const audio = formData.get('audio')
    const priorContext = formData.get('prior_context')
    const knownSpeakersRaw = formData.get('known_speakers')
    const lastSegmentRaw = formData.get('last_segment')

    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json(
        { text: '', segments: [], error: 'no audio file provided' },
        { status: 400 }
      )
    }

    const file = new File([audio], 'chunk.webm', {
      type: audio.type || 'audio/webm',
    })

    const text = await transcribeAudio(
      file,
      typeof priorContext === 'string' ? priorContext : undefined
    )

    // Post-transcription: approximate speaker turns with gpt-4o-mini.
    // Failure falls back to one segment so the transcript still renders.
    let segments: TranscriptSegment[] = []
    if (text.trim()) {
      const known_speakers =
        typeof knownSpeakersRaw === 'string'
          ? safeParseStringArray(knownSpeakersRaw)
          : []
      const last_segment =
        typeof lastSegmentRaw === 'string'
          ? safeParseSegment(lastSegmentRaw)
          : undefined

      segments = await segmentSpeakers(text, {
        known_speakers,
        last_segment,
      })
    }

    return NextResponse.json({ text, segments })
  } catch (err) {
    console.error('transcription error:', err)
    // Return 200 with empty text so the pipeline continues
    return NextResponse.json({
      text: '',
      segments: [],
      error: 'transcription failed',
    })
  }
}

function safeParseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : []
  } catch {
    return []
  }
}

function safeParseSegment(raw: string): TranscriptSegment | undefined {
  try {
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.speaker === 'string' &&
      typeof parsed.text === 'string'
    ) {
      return { speaker: parsed.speaker, text: parsed.text }
    }
  } catch {}
  return undefined
}
