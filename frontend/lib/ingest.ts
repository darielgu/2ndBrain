import { randomUUID } from 'node:crypto'
import {
  listRecentGmail,
  listCalendarEvents,
  listContacts,
  type GmailMessageSummary,
  type CalendarEventSummary,
  type ContactSummary,
} from './google'
import { extractMemory } from './openai'
import { savePersonContext, saveEpisodeContext } from './nia'
import type { Person, Episode } from './types'

const slug = (s: string): string =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown'

/**
 * Ingest recent gmail threads:
 *   1. pull last N days of mail
 *   2. for each message, run GPT-4o extraction on from+subject+body
 *   3. save extracted people + episodes to nia
 *
 * Skips messages without a human sender (noreply, notifications, etc).
 */
export async function ingestGmail(
  user_id: string,
  opts: { days?: number; maxResults?: number } = {},
): Promise<{ scanned: number; episodes: number; people: number }> {
  const messages = await listRecentGmail(user_id, opts)

  let episodes = 0
  const peopleSeen = new Set<string>()

  for (const m of messages) {
    if (!m.body && !m.snippet) continue
    if (/noreply|no-reply|notifications?@|mailer-daemon/i.test(m.from)) continue

    const transcript =
      `From: ${m.from}\nTo: ${m.to}\nSubject: ${m.subject}\nDate: ${m.date}\n\n` +
      (m.body || m.snippet)

    let extraction
    try {
      extraction = await extractMemory(transcript)
    } catch (err) {
      console.error('gmail extraction failed:', err)
      continue
    }

    const personIds: string[] = []
    for (const p of extraction.people) {
      if (!p.name) continue
      const pid = slug(p.name)
      personIds.push(pid)
      const person: Person = {
        person_id: pid,
        name: p.name,
        where_met: p.role_or_context || 'email',
        summary: p.prose_summary,
        open_loops: extraction.next_actions,
        last_seen: new Date(m.date || Date.now()).toISOString(),
        notes: [p.prose_summary].filter(Boolean),
        prose: p.prose_summary,
      }
      try {
        await savePersonContext(person)
        peopleSeen.add(pid)
      } catch (err) {
        console.error('savePersonContext failed:', err)
      }
    }

    const episode: Episode = {
      episode_id: randomUUID(),
      person_ids: personIds,
      topics: extraction.topics,
      promises: extraction.promises,
      next_actions: extraction.next_actions,
      timestamp: new Date(m.date || Date.now()).toISOString(),
      source: 'screen',
      prose: extraction.episode_prose,
    }

    try {
      await saveEpisodeContext(episode)
      episodes++
    } catch (err) {
      console.error('saveEpisodeContext failed:', err)
    }
  }

  return { scanned: messages.length, episodes, people: peopleSeen.size }
}

/**
 * Ingest calendar events as episodes. Events already have structured
 * attendees + titles, so we skip the LLM extraction for this one and build
 * episodes deterministically.
 */
export async function ingestCalendar(
  user_id: string,
  opts: { timeMin?: string; timeMax?: string; maxResults?: number } = {},
): Promise<{ scanned: number; episodes: number; people: number }> {
  const events = await listCalendarEvents(user_id, opts)
  let episodes = 0
  const peopleSeen = new Set<string>()

  for (const ev of events) {
    if (!ev.attendees || ev.attendees.length === 0) continue

    const personIds: string[] = []
    for (const email of ev.attendees) {
      const pid = slug(email.split('@')[0] || email)
      personIds.push(pid)
      const person: Person = {
        person_id: pid,
        name: email,
        where_met: ev.location || 'calendar',
        summary: `met on calendar: ${ev.summary}`,
        open_loops: [],
        last_seen: ev.startIso,
        notes: [],
        prose: `${email} appears on the calendar event "${ev.summary}" on ${ev.startIso}.`,
      }
      try {
        await savePersonContext(person)
        peopleSeen.add(pid)
      } catch (err) {
        console.error('savePersonContext (calendar) failed:', err)
      }
    }

    const prose =
      `Calendar event "${ev.summary}" on ${ev.startIso} with ${ev.attendees.join(', ')}.` +
      (ev.location ? ` Location: ${ev.location}.` : '') +
      (ev.meetUrl ? ` Meet link: ${ev.meetUrl}.` : '') +
      (ev.description ? ` Notes: ${ev.description}` : '')

    const episode: Episode = {
      episode_id: `gcal_${ev.id}`,
      person_ids: personIds,
      topics: [ev.summary].filter(Boolean),
      promises: [],
      next_actions: [],
      timestamp: ev.startIso,
      source: 'screen',
      prose,
    }

    try {
      await saveEpisodeContext(episode)
      episodes++
    } catch (err) {
      console.error('saveEpisodeContext (calendar) failed:', err)
    }
  }

  return { scanned: events.length, episodes, people: peopleSeen.size }
}

/**
 * Ingest google contacts as seed Person records so the people graph isn't
 * empty on first load.
 */
export async function ingestContacts(
  user_id: string,
): Promise<{ scanned: number; people: number }> {
  const contacts: ContactSummary[] = await listContacts(user_id)
  let saved = 0

  for (const c of contacts) {
    if (!c.name && c.emails.length === 0) continue
    const pid = slug(c.name || c.emails[0])
    const org = c.organization ? ` at ${c.organization}` : ''
    const title = c.title ? ` (${c.title})` : ''
    const person: Person = {
      person_id: pid,
      name: c.name || c.emails[0],
      where_met: c.organization || 'contacts',
      summary: `${c.name || c.emails[0]}${title}${org}`,
      open_loops: [],
      last_seen: new Date().toISOString(),
      notes: [],
      prose:
        `${c.name || c.emails[0]}${title}${org}.` +
        (c.emails.length ? ` Email: ${c.emails.join(', ')}.` : '') +
        (c.phones.length ? ` Phone: ${c.phones.join(', ')}.` : ''),
    }
    try {
      await savePersonContext(person)
      saved++
    } catch (err) {
      console.error('savePersonContext (contacts) failed:', err)
    }
  }

  return { scanned: contacts.length, people: saved }
}

export type { GmailMessageSummary, CalendarEventSummary, ContactSummary }
