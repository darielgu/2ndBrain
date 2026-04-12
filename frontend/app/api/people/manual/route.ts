import { NextResponse } from 'next/server'
import { getPerson, upsertPerson } from '@/lib/db'
import { savePersonContext } from '@/lib/nia'
import type { Person } from '@/lib/types'

export const runtime = 'nodejs'

// POST /api/people/manual
// { person_id, name?, email?, jobTitle?, company?, linkedinUrl?,
//   instagram?, twitter?, notes?, whereMet? }
//
// Updates a person's manual enrichment fields. If the person doesn't exist
// we create them. Nia context stays in sync via savePersonContext (which
// regenerates the prose and merges with whatever's already there).
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      person_id?: string
      name?: string
      email?: string
      jobTitle?: string
      company?: string
      linkedinUrl?: string
      instagram?: string
      twitter?: string
      notes?: string
      whereMet?: string
    }

    if (!body.person_id) {
      return NextResponse.json({ error: 'person_id required' }, { status: 400 })
    }

    const existing = getPerson(body.person_id)
    const now = new Date().toISOString()

    // Merge: existing values override empty inputs; new non-empty values win.
    const pick = (next: string | undefined, prev: string | undefined) => {
      const trimmed = next?.trim()
      return trimmed && trimmed.length > 0 ? trimmed : prev
    }

    const merged: Person = {
      person_id: body.person_id,
      name: body.name?.trim() || existing?.name || body.person_id,
      where_met: pick(body.whereMet, existing?.where_met) || '',
      summary: existing?.summary || '',
      open_loops: existing?.open_loops || [],
      last_seen: existing?.last_seen || now,
      notes: existing?.notes || [],
      prose: existing?.prose,
      nia_context_id: existing?.nia_context_id,
      email: pick(body.email, existing?.email),
      job_title: pick(body.jobTitle, existing?.job_title),
      company: pick(body.company, existing?.company),
      linkedin_url: pick(body.linkedinUrl, existing?.linkedin_url),
      instagram: pick(body.instagram, existing?.instagram),
      twitter: pick(body.twitter, existing?.twitter),
      manual_notes: pick(body.notes, existing?.manual_notes),
    }

    // If the user updated the job/company, reflect that in the summary so
    // it surfaces on cards + in memory search.
    if (merged.job_title || merged.company) {
      const roleBits = [merged.job_title, merged.company].filter(Boolean).join(' at ')
      merged.summary = merged.summary
        ? `${roleBits}. ${merged.summary.replace(/^.*?\bat\b[^.]*\.?\s*/i, '')}`
        : roleBits
    }

    // Persist to sqlite first (cheap, authoritative for manual fields),
    // then mirror to nia so semantic search + prose rebuilds happen.
    upsertPerson(merged)
    try {
      await savePersonContext(merged)
    } catch (err) {
      console.error('nia sync failed (manual enrich):', err)
    }

    return NextResponse.json({ person: merged })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'manual save failed' },
      { status: 500 },
    )
  }
}
