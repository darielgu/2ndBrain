import { NextResponse } from 'next/server'
import { transcribeAudio } from '@/lib/openai'

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

    // Convert Blob to File for the OpenAI SDK
    const file = new File([audio], 'chunk.webm', {
      type: audio.type || 'audio/webm',
    })

    const text = await transcribeAudio(file)
    return NextResponse.json({ text })
  } catch (err) {
    console.error('transcription error:', err)
    // Return 200 with empty text so the pipeline continues
    return NextResponse.json({
      text: '',
      error: 'transcription failed',
    })
  }
}
