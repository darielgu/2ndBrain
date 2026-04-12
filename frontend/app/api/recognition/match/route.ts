import { NextResponse } from 'next/server'
import { matchEmbedding, seedDemoProfiles } from '@/lib/recognition-store'
import type { MatchResponse } from '@/lib/recognition-types'

function clamp(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const embedding = Array.isArray(body.embedding)
      ? body.embedding.map((v: unknown) => Number(v))
      : []
    const threshold = clamp(Number(body.threshold ?? 0.5))
    const mockMode = Boolean(body.mockMode)

    if (mockMode) {
      await seedDemoProfiles()
      const mock: MatchResponse = {
        match: {
          person_id: 'maya_001',
          name: 'Maya',
          confidence: 0.96,
          where_met: 'hackathon',
          summary: 'works on voice infra',
          open_loops: ['send repo'],
          last_location: '',
          conversation_count: 2,
          recent_topics: ['voice infra', 'hackathon follow-up'],
          last_conversation_summary:
            'You discussed voice infra and promised to send a repo link.',
        },
        candidates: [
          {
            person_id: 'maya_001',
            name: 'Maya',
            confidence: 0.96,
            where_met: 'hackathon',
            summary: 'works on voice infra',
            open_loops: ['send repo'],
            last_location: '',
            conversation_count: 2,
            recent_topics: ['voice infra', 'hackathon follow-up'],
            last_conversation_summary:
              'You discussed voice infra and promised to send a repo link.',
          },
          {
            person_id: 'elijah_001',
            name: 'Elijah',
            confidence: 0.73,
            where_met: 'co-working loft',
            summary: 'shipping a wearables prototype',
            open_loops: ['intro to camera ml lead'],
            last_location: '',
            conversation_count: 1,
            recent_topics: ['camera latency'],
            last_conversation_summary:
              'You discussed camera latency and an intro follow-up.',
          },
        ],
      }
      return NextResponse.json(mock)
    }

    const result = await matchEmbedding({ embedding, threshold })
    return NextResponse.json(result)
  } catch (err) {
    console.error('recognition match error:', err)
    return NextResponse.json(
      { match: null, candidates: [], error: 'match failed' },
      { status: 500 }
    )
  }
}
