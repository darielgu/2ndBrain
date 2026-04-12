import { NextResponse } from 'next/server'
import { enrichPerson } from '@/lib/enrich'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string
      email?: string
      company?: string
      linkedinUrl?: string
      whereMet?: string
      existingSummary?: string
    }
    if (!body.name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }

    const result = await enrichPerson({
      name: body.name,
      email: body.email,
      company: body.company,
      linkedinUrl: body.linkedinUrl,
      whereMet: body.whereMet,
      existingSummary: body.existingSummary,
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'enrich failed' },
      { status: 500 },
    )
  }
}
