import { NextResponse } from 'next/server'
import { classifyActions, loadKnownPeople } from '@/lib/actions'
import type { ExtractionResult } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/actions/classify
// { extraction: ExtractionResult, referenceIso?: string, timeZone?: string }
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      extraction?: ExtractionResult
      referenceIso?: string
      timeZone?: string
    }
    if (!body.extraction) {
      return NextResponse.json({ error: 'extraction required' }, { status: 400 })
    }
    const people = loadKnownPeople(100)
    const proposals = await classifyActions({
      extraction: body.extraction,
      people,
      referenceIso: body.referenceIso,
      timeZone: body.timeZone,
    })
    return NextResponse.json({ proposals })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'classify failed' },
      { status: 500 },
    )
  }
}
