import OpenAI from 'openai'
import { listPeopleDb } from './db'
import type { ExtractionResult, Person } from './types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export type ActionProposal =
  | {
      id: string
      kind: 'calendar'
      summary: string
      description: string
      startIso: string
      endIso: string
      attendeeEmails: string[]
      withMeet: boolean
      originalText: string
    }
  | {
      id: string
      kind: 'email_draft'
      to: string
      subject: string
      body: string
      originalText: string
    }
  | {
      id: string
      kind: 'task'
      title: string
      notes: string
      dueIso: string | null
      originalText: string
    }
  | {
      id: string
      kind: 'unknown'
      originalText: string
      reason: string
    }

const CLASSIFIER_PROMPT = `you classify action items from a meeting into structured google-integration proposals.

for each action, decide exactly one kind:

- "calendar": the action schedules a meeting/event with at least a date. ALWAYS produce concrete startIso and endIso in ISO 8601 (e.g. "2026-04-21T15:00:00-07:00") — never leave them empty. resolution:
    * BOTH day + time given ("april 21 at 3pm") → use them directly.
    * ONLY a day given ("april 21st", "next tuesday", "tomorrow") → default to 09:00 local on that day.
    * NO day at all → classify as "task" instead (not "calendar").
  duration defaults: 30 min for coffee/lunch/quick, 60 min for meeting/call/sync/invite.
  set withMeet: true unless clearly in-person (coffee, lunch, office, in-person).
  set a clear short summary (3-8 words) that reads as an event title.

- "email_draft": the action is to send/email something ("i'll email you the deck"). write a short 2-4 sentence plain-text draft in first person (the speaker is "me"), lowercase tone. subject should be specific.
- "task": any other concrete next-action that's a to-do ("review the repo", "look into it"). title 3-8 words, notes can quote the original.
- "unknown": vague ("think about it", "we'll see") or non-actionable. skip these with a brief reason.

rules:
- be conservative on attendees. don't invent attendee emails — use ONLY the ones in the known_people list.
- iso times must be absolute and include the timezone offset matching the reference_now_iso provided.
- year: infer from reference_now_iso. "april 21st" when reference is 2026 means 2026-04-21; if the date already passed this year, prefer next year.
- match attendees to the known_people list by name (case-insensitive, fuzzy). include their email only if present in the list. missing emails are ok — leave attendeeEmails empty.
- one action in → one proposal out. return them in the same order.

return strict json: { "proposals": [ {kind, ...fields, originalText} ] }`

export async function classifyActions(input: {
  extraction: ExtractionResult
  people: Person[]
  referenceIso?: string
  timeZone?: string
}): Promise<ActionProposal[]> {
  const actions = [
    ...input.extraction.promises.map((p) => ({ source: 'promise', text: p })),
    ...input.extraction.next_actions.map((a) => ({ source: 'next_action', text: a })),
  ]
  if (actions.length === 0) return []

  // Merge freshly-extracted contact fields with sqlite known-people. The
  // fresh ones might not have landed in sqlite yet (race with session save),
  // and even if they did, the extraction's email for the current call is the
  // most up-to-date signal. Dedupe by lowercased name, fresh wins on conflict.
  const freshByName = new Map<
    string,
    { name: string; email: string | null; company: string | null }
  >()
  for (const fp of input.extraction.people) {
    if (!fp.name) continue
    freshByName.set(fp.name.trim().toLowerCase(), {
      name: fp.name,
      email: fp.email || null,
      company: fp.company || null,
    })
  }

  const seen = new Set<string>()
  const peopleContext: Array<{
    name: string
    email: string | null
    company: string | null
  }> = []
  for (const fp of freshByName.values()) {
    peopleContext.push(fp)
    seen.add(fp.name.trim().toLowerCase())
  }
  for (const p of input.people.slice(0, 50)) {
    const key = p.name.trim().toLowerCase()
    if (seen.has(key)) continue
    peopleContext.push({
      name: p.name,
      email: p.email || null,
      company: p.company || null,
    })
    seen.add(key)
  }

  const now = input.referenceIso || new Date().toISOString()
  const tz = input.timeZone || 'America/New_York'

  const user = `reference_now_iso: ${now}
timezone: ${tz}

known_people:
${JSON.stringify(peopleContext, null, 2)}

actions:
${actions.map((a, i) => `${i + 1}. [${a.source}] ${a.text}`).join('\n')}`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: CLASSIFIER_PROMPT },
      { role: 'user', content: user },
    ],
  })

  const raw = completion.choices[0]?.message?.content
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as { proposals?: Array<Record<string, unknown>> }
    return (parsed.proposals || []).map((p, i) => normalizeProposal(p, i, actions[i]?.text || ''))
  } catch (err) {
    console.error('action classifier parse failed:', err)
    return []
  }
}

function normalizeProposal(
  raw: Record<string, unknown>,
  index: number,
  originalFallback: string,
): ActionProposal {
  const id = `prop_${Date.now()}_${index}`
  const originalText = (raw.originalText as string) || originalFallback
  const kind = raw.kind as string

  if (kind === 'calendar') {
    return {
      id,
      kind: 'calendar',
      summary: (raw.summary as string) || 'meeting',
      description: (raw.description as string) || '',
      startIso: (raw.startIso as string) || '',
      endIso: (raw.endIso as string) || '',
      attendeeEmails: Array.isArray(raw.attendeeEmails)
        ? (raw.attendeeEmails as string[]).filter((e) => typeof e === 'string' && e.includes('@'))
        : [],
      withMeet: raw.withMeet === true || raw.withMeet === undefined,
      originalText,
    }
  }
  if (kind === 'email_draft') {
    return {
      id,
      kind: 'email_draft',
      to: (raw.to as string) || '',
      subject: (raw.subject as string) || 'follow-up',
      body: (raw.body as string) || '',
      originalText,
    }
  }
  if (kind === 'task') {
    return {
      id,
      kind: 'task',
      title: (raw.title as string) || originalText.slice(0, 60),
      notes: (raw.notes as string) || originalText,
      dueIso: (raw.dueIso as string) || null,
      originalText,
    }
  }
  return {
    id,
    kind: 'unknown',
    originalText,
    reason: (raw.reason as string) || 'could not classify',
  }
}

export function loadKnownPeople(limit = 100): Person[] {
  try {
    return listPeopleDb(limit)
  } catch (err) {
    console.error('loadKnownPeople failed:', err)
    return []
  }
}
