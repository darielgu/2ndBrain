import { NextResponse } from 'next/server'

const OPENAI_BASE = 'https://api.openai.com/v1'

export async function POST() {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'missing OPENAI_API_KEY' },
        { status: 500 }
      )
    }

    const res = await fetch(`${OPENAI_BASE}/realtime/transcription_sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'gpt-4o-transcribe',
          language: 'en',
        },
        input_audio_noise_reduction: { type: 'near_field' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        include: ['item.input_audio_transcription.logprobs'],
      }),
    })

    const body = await res.text()
    if (!res.ok) {
      console.error('realtime transcription session create failed:', body)
      return NextResponse.json(
        { error: 'failed to create realtime transcription session' },
        { status: res.status }
      )
    }

    const json = JSON.parse(body) as {
      client_secret?: { value?: string }
      id?: string
    }
    const clientSecret = json.client_secret?.value || ''
    if (!clientSecret) {
      return NextResponse.json(
        { error: 'missing realtime client_secret' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      client_secret: clientSecret,
      session_id: json.id || '',
    })
  } catch (err) {
    console.error('realtime transcription session route error:', err)
    return NextResponse.json(
      { error: 'failed to create realtime transcription session' },
      { status: 500 }
    )
  }
}
