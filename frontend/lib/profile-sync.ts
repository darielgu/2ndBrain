import { listCalendarEvents, type CalendarEventSummary } from './google'
import { getPerson } from './db'
import type { Person } from './types'

export interface PersonProfileSync {
  person_id: string
  name: string
  was_new: boolean
  email: string | null
  summary: string
  open_loops: string[]
  upcoming_events: CalendarEventSummary[]
  note: string
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'unknown'
  )
}

/**
 * Decide whether an event is "with" the given person.
 *
 * Signals, in order of strength:
 *   1. Person's known email appears in the attendees list (strongest).
 *   2. Event summary contains the person's name as a token.
 */
function eventIsWithPerson(ev: CalendarEventSummary, person: Person): boolean {
  const email = (person.email || '').toLowerCase().trim()
  if (email && ev.attendees.some((a) => a.toLowerCase() === email)) {
    return true
  }
  const name = person.name.trim().toLowerCase()
  if (!name) return false
  const summary = (ev.summary || '').toLowerCase()
  // Match on whole-word boundary so "sam" doesn't match "samuel" or "samsung".
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
  return re.test(summary)
}

/**
 * For each extracted person, look up what we already know about them in
 * sqlite, find upcoming calendar events with them, and return a per-person
 * sync record. Does NOT mutate the person record — saving is handled
 * separately via savePersonContext during the session's own save pass. This
 * pass only attaches live calendar context for display.
 */
export async function syncProfiles(params: {
  user: string
  extractedNames: string[]
  existingPersonIdsBeforeSave?: Set<string>
}): Promise<PersonProfileSync[]> {
  const { user, extractedNames, existingPersonIdsBeforeSave } = params
  if (extractedNames.length === 0) return []

  // One calendar fetch covers all people — avoids N round-trips.
  let events: CalendarEventSummary[] = []
  try {
    const now = new Date()
    const in60d = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
    events = await listCalendarEvents(user, {
      timeMin: now.toISOString(),
      timeMax: in60d.toISOString(),
      maxResults: 100,
    })
  } catch (err) {
    console.error('profile-sync: calendar fetch failed:', err)
  }

  const results: PersonProfileSync[] = []

  for (const rawName of extractedNames) {
    const person_id = slugify(rawName)
    const existing = getPerson(person_id)
    const wasNew = existingPersonIdsBeforeSave
      ? !existingPersonIdsBeforeSave.has(person_id)
      : !existing

    const upcoming = existing
      ? events.filter((ev) => eventIsWithPerson(ev, existing))
      : []

    results.push({
      person_id,
      name: existing?.name || rawName,
      was_new: wasNew,
      email: existing?.email || null,
      summary: existing?.summary || '',
      open_loops: existing?.open_loops || [],
      upcoming_events: upcoming,
      note: buildNote(wasNew, existing, upcoming.length),
    })
  }

  return results
}

function buildNote(
  wasNew: boolean,
  existing: Person | null,
  upcomingCount: number,
): string {
  if (wasNew) {
    return upcomingCount > 0
      ? `new profile. ${upcomingCount} upcoming event${upcomingCount > 1 ? 's' : ''} already on your calendar.`
      : 'new profile created from this session.'
  }
  const noteParts: string[] = ['profile updated with this session.']
  if (existing?.open_loops?.length) {
    noteParts.push(`${existing.open_loops.length} open loop${existing.open_loops.length > 1 ? 's' : ''}.`)
  }
  if (upcomingCount > 0) {
    noteParts.push(
      `${upcomingCount} upcoming event${upcomingCount > 1 ? 's' : ''} with them.`,
    )
  }
  return noteParts.join(' ')
}
