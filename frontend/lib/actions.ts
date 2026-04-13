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

first, for each action, infer the OWNER — who actually performs the action:
- owner="me" if the phrasing is the user committing ("i'll send", "i will include", "let me") or it's in the user's voice.
- owner=<name> if someone else commits ("caleb will confirm", "he'll check with legal").
the user (the speaker) is identified in the user message as "user_name". other names come from known_people.

then pick exactly one kind:

- "calendar": owner=me AND the action schedules a meeting/event with at least a date. ALWAYS produce concrete startIso and endIso in ISO 8601 (e.g. "2026-04-21T15:00:00-07:00") — never leave them empty. resolution:
    * BOTH day + time given ("april 21 at 3pm") → use them directly.
    * ONLY a day given ("april 21st", "next tuesday", "tomorrow") → default to 09:00 local on that day.
    * NO day at all → classify as "task" instead (not "calendar").
  duration defaults: 30 min for coffee/lunch/quick, 60 min for meeting/call/sync/invite.
  set withMeet: true unless clearly in-person (coffee, lunch, office, in-person).
  set a clear short summary (3-8 words) that reads as an event title.
  attendeeEmails: include emails of OTHER known_people mentioned in the action (not the user's own email — they're the organizer).

- "email_draft": owner=me AND the action is to send/email something ("i'll email you the deck", "i'll send my linkedin in the email"). rules:
    * "to": the email address of the recipient. look up the person the action is addressed to in known_people and use their email verbatim. if the recipient can't be resolved, leave "to": "".
    * "subject": 3-7 words, specific, future-tense framing (e.g. "intro + linkedin" not "linkedin included"). lowercase.
    * "body": 2-4 sentences, first person, lowercase, plain text. if the action mentions including the user's linkedin/portfolio/website, paste the actual URL from user_profile verbatim on its own line. do NOT write placeholders like "my linkedin profile" — write the URL. sign off with the user's first name.

- "task": any other concrete next-action that's a to-do, OR any action whose owner is NOT me. phrasing rules:
    * owner=me: title is 3-8 words, imperative ("review the repo").
    * owner=<other>: title starts with "waiting: <person> to ..." so the user sees who they're waiting on. notes can quote the original.
    set dueIso only if the transcript gives a concrete due date.

- "unknown": vague ("think about it", "we'll see") or non-actionable. skip these with a brief reason.

hard rules:
- NEVER put the user themselves in calendar attendeeEmails or as email "to" — they're the sender/organizer.
- don't invent emails. only use addresses that appear in known_people (freshly-extracted or stored).
- iso times must be absolute and include the timezone offset matching reference_now_iso.
- year: infer from reference_now_iso. if the date already passed this year, prefer next year.
- match attendees/recipients to known_people by name (case-insensitive, fuzzy).
- one action in → one proposal out. return them in the same order.

return strict json: { "proposals": [ {kind, ...fields, originalText} ] }`

export interface ClassifyUserProfile {
  name: string
  email?: string
  linkedin_url?: string
  portfolio_url?: string
}

export async function classifyActions(input: {
  extraction: ExtractionResult
  people: Person[]
  referenceIso?: string
  timeZone?: string
  userProfile?: ClassifyUserProfile
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

  // Scrub the user's own identity out of known_people — the classifier
  // should never address an email "to" the user themselves.
  const userKey = (input.userProfile?.name || '').trim().toLowerCase()
  const filteredPeople = userKey
    ? peopleContext.filter((p) => p.name.trim().toLowerCase() !== userKey)
    : peopleContext

  const userProfileForPrompt = input.userProfile
    ? {
        name: input.userProfile.name,
        linkedin_url: input.userProfile.linkedin_url || null,
        portfolio_url: input.userProfile.portfolio_url || null,
      }
    : null

  const user = `reference_now_iso: ${now}
timezone: ${tz}

user_name: ${input.userProfile?.name || '(unknown)'}
user_profile:
${JSON.stringify(userProfileForPrompt, null, 2)}

known_people:
${JSON.stringify(filteredPeople, null, 2)}

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
