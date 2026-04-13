import { NextResponse } from 'next/server'
import { extractMemory } from '@/lib/openai'

export async function POST(request: Request) {
  try {
    const { transcript, speakerName } = await request.json()

    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json(
        { error: 'transcript string required' },
        { status: 400 }
      )
    }

    const result = await extractMemory(transcript, {
      speakerName: typeof speakerName === 'string' ? speakerName : undefined,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('extraction error:', err)
    // Return minimal extraction so the pipeline doesn't break
    return NextResponse.json({
      people: [],
      topics: ['unknown'],
      promises: [],
      next_actions: [],
    })
  }
}
