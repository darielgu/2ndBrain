import { NextResponse } from 'next/server'
import { transcribeAudio } from '@/lib/openai'

const SUPPORTED_MIME_TYPES = new Set([
  'audio/flac',
  'audio/m4a',
  'audio/mp3',
  'audio/mp4',
  'audio/mpeg',
  'audio/mpga',
  'audio/oga',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
])

function normalizeMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(';')[0]?.trim()
  if (normalized && SUPPORTED_MIME_TYPES.has(normalized)) return normalized
  return 'audio/webm'
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('ogg') || mimeType.includes('oga')) return 'ogg'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3') || mimeType.includes('mpga')) return 'mp3'
  if (mimeType.includes('flac')) return 'flac'
  if (mimeType.includes('m4a')) return 'm4a'
  return 'webm'
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'transcription failed'
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const audio = formData.get('audio')

    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json(
        { text: '', error: 'no audio file provided' },
        { status: 400 }
      )
    }

    if (audio.size < 1000) {
      return NextResponse.json(
        { error: 'audio chunk too small', retryable: false },
        { status: 400 }
      )
    }

    const mimeType = normalizeMimeType(audio.type || 'audio/webm')
    const file = new File(
      [audio],
      `chunk.${extensionForMimeType(mimeType)}`,
      { type: mimeType }
    )

    const text = await transcribeAudio(file)
    return NextResponse.json({ text, source: 'openai' })
  } catch (err) {
    console.error('transcription error:', err)
    const message = getErrorMessage(err)
    const invalidFormat = message.toLowerCase().includes('invalid file format')

    return NextResponse.json(
      {
        error: message,
        retryable: !invalidFormat,
      },
      { status: invalidFormat ? 415 : 500 }
    )
  }
}
