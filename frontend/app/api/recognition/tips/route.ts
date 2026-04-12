import { NextResponse } from 'next/server'
import {
  bestEpisodeSummaryForPerson,
  findPersonByPersonId,
  searchMemory,
} from '@/lib/nia'
import { getProfile } from '@/lib/recognition-store'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const personId = String(url.searchParams.get('person_id') || '').trim()

    if (!personId) {
      return NextResponse.json({ error: 'person_id is required' }, { status: 400 })
    }

    const personMatch = await findPersonByPersonId(personId)
    if (!personMatch) {
      return NextResponse.json({ error: 'person not found in nia' }, { status: 404 })
    }

    const person = personMatch.person
    const localProfile = await getProfile(personId)
    const related = await searchMemory(personId.replace(/_/g, ' '), 20)
    const lastSummary = bestEpisodeSummaryForPerson(related, personId)

    return NextResponse.json({
      tip: {
        person_id: person.person_id,
        name: person.name,
        where_met: person.where_met,
        summary: person.summary,
        open_loops: person.open_loops,
        last_conversation_summary: lastSummary,
        last_seen: person.last_seen,
        last_location: localProfile?.last_location || '',
      },
    })
  } catch (err) {
    console.error('nia tips error:', err)
    return NextResponse.json(
      { error: 'failed to load nia tips' },
      { status: 502 }
    )
  }
}
