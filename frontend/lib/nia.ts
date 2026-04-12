import type { Person, Episode } from './types'
import {
  upsertPerson,
  upsertEpisode,
  listPeopleDb,
  listEpisodesDb,
} from './db'

const NIA_BASE_URL = process.env.NIA_BASE_URL || 'https://apigcp.trynia.ai/v2'
const NIA_API_KEY = process.env.NIA_API_KEY || ''

async function niaFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${NIA_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${NIA_API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`nia ${options.method || 'GET'} ${path} failed (${res.status}): ${body}`)
  }

  return res.json()
}

// --- Prose builders (deterministic regeneration from structured metadata) ---

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

/**
 * Builds a rich natural-language paragraph for a Person that Nia can embed.
 * Uses accumulated notes from prior sessions plus a metadata summary sentence.
 * Deterministic — given the same Person, always produces the same prose.
 */
export function buildPersonProse(person: Person): string {
  const parts: string[] = []

  // Accumulated prose observations from each session
  if (person.notes && person.notes.length > 0) {
    parts.push(...person.notes)
  } else if (person.prose) {
    // Fallback to single prose field if notes aren't populated
    parts.push(person.prose)
  }

  // Metadata summary sentence for context
  const metaBits: string[] = []
  if (person.last_seen) {
    metaBits.push(`Last seen ${formatDate(person.last_seen)}`)
  }
  if (person.open_loops && person.open_loops.length > 0) {
    metaBits.push(`open loops: ${person.open_loops.join(', ')}`)
  }
  if (metaBits.length > 0) {
    parts.push(metaBits.join('; ') + '.')
  }

  return parts.join(' ').trim()
}

/**
 * Builds a natural-language description of an Episode.
 * Used as a fallback when episode.prose isn't already populated.
 */
export function buildEpisodeProse(episode: Episode): string {
  if (episode.prose) return episode.prose

  const sentences: string[] = []
  const people = episode.person_ids.join(', ') || 'an unknown person'
  const when = formatDate(episode.timestamp)
  const src = episode.source === 'screen' ? 'screen recording' : 'webcam session'

  sentences.push(
    `Conversation with ${people} on ${when} during a ${src}.`
  )
  if (episode.topics.length > 0) {
    sentences.push(`Topics discussed: ${episode.topics.join(', ')}.`)
  }
  if (episode.promises.length > 0) {
    sentences.push(`Promises made: ${episode.promises.join('; ')}.`)
  }
  if (episode.next_actions.length > 0) {
    sentences.push(`Next actions: ${episode.next_actions.join('; ')}.`)
  }
  return sentences.join(' ')
}

// --- Serialization helpers (metadata <-> Person/Episode) ---

function personToMetadata(person: Person): Record<string, unknown> {
  // Strip nia_context_id — that's the ID of the context, not part of the payload
  const { nia_context_id: _omit, ...rest } = person
  return rest as unknown as Record<string, unknown>
}

function episodeToMetadata(episode: Episode): Record<string, unknown> {
  const { nia_context_id: _omit, ...rest } = episode
  return rest as unknown as Record<string, unknown>
}

function metadataToPerson(
  meta: Record<string, unknown> | null | undefined,
  context_id?: string
): Person | null {
  if (!meta || typeof meta !== 'object') return null
  const person_id = typeof meta.person_id === 'string' ? meta.person_id : ''
  if (!person_id) return null
  return {
    person_id,
    name: typeof meta.name === 'string' ? meta.name : person_id,
    where_met: typeof meta.where_met === 'string' ? meta.where_met : '',
    summary: typeof meta.summary === 'string' ? meta.summary : '',
    open_loops: Array.isArray(meta.open_loops)
      ? (meta.open_loops as string[]).filter((v) => typeof v === 'string')
      : [],
    last_seen: typeof meta.last_seen === 'string' ? meta.last_seen : '',
    notes: Array.isArray(meta.notes)
      ? (meta.notes as string[]).filter((v) => typeof v === 'string')
      : undefined,
    prose: typeof meta.prose === 'string' ? meta.prose : undefined,
    nia_context_id: context_id,
  }
}

function metadataToEpisode(
  meta: Record<string, unknown> | null | undefined,
  context_id?: string
): Episode | null {
  if (!meta || typeof meta !== 'object') return null
  const episode_id = typeof meta.episode_id === 'string' ? meta.episode_id : ''
  if (!episode_id) return null
  const rawSource = typeof meta.source === 'string' ? meta.source : 'screen'
  const source: Episode['source'] =
    rawSource === 'webcam' ? 'webcam' : 'screen'
  return {
    episode_id,
    person_ids: Array.isArray(meta.person_ids)
      ? (meta.person_ids as unknown[]).filter(
          (v): v is string => typeof v === 'string'
        )
      : [],
    topics: Array.isArray(meta.topics)
      ? (meta.topics as unknown[]).filter(
          (v): v is string => typeof v === 'string'
        )
      : [],
    promises: Array.isArray(meta.promises)
      ? (meta.promises as unknown[]).filter(
          (v): v is string => typeof v === 'string'
        )
      : [],
    next_actions: Array.isArray(meta.next_actions)
      ? (meta.next_actions as unknown[]).filter(
          (v): v is string => typeof v === 'string'
        )
      : [],
    timestamp: typeof meta.timestamp === 'string' ? meta.timestamp : '',
    source,
    prose: typeof meta.prose === 'string' ? meta.prose : undefined,
    nia_context_id: context_id,
  }
}

// --- Length guards ---
// Nia's save endpoint enforces: title 1-200, summary 10-1000, content ≥50.
// For edge cases (empty prose, minimal metadata) we append structured
// context until the minimum is met so the request doesn't 422.
function ensureMinLength(base: string, min: number, filler: string): string {
  const trimmed = base.trim()
  if (trimmed.length >= min) return trimmed
  const combined = trimmed ? `${trimmed} ${filler}` : filler
  if (combined.length >= min) return combined
  // Pathological case — pad with the filler repeated. Deterministic.
  let result = combined
  while (result.length < min) result += ` ${filler}`
  return result
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max)
}

// --- Dedupe lookup: find an existing person context by exact person_id ---

export async function findPersonByPersonId(
  person_id: string
): Promise<{ context_id: string; person: Person } | null> {
  // Tag-based list is deterministic: ['person', person_id] narrows to at
  // most one context. Falls back to semantic search if the list returns
  // nothing — covers records created before the per-id tag convention.
  try {
    // Single-tag filter only. Nia's comma-separated tag filter semantics
    // aren't documented clearly, and passing two tags silently missed
    // existing records — causing dedupe to fail and create duplicates.
    // A single 'person' tag + post-filter by metadata.person_id is
    // deterministic regardless of the server's tag-filter interpretation.
    const viaList = await listContexts({
      tags: ['person'],
      agent_source: 'secondbrain',
      limit: 100,
    })
    const listMatch = viaList.find((r) => {
      const meta = r.metadata as Record<string, unknown> | null
      if (!meta || typeof meta !== 'object') return false
      if (typeof meta.episode_id === 'string') return false
      return meta.person_id === person_id
    })
    if (listMatch) {
      const person = metadataToPerson(
        listMatch.metadata as Record<string, unknown>,
        listMatch.id as string
      )
      if (person) return { context_id: listMatch.id as string, person }
    }

    // Fallback: semantic search then filter. Wider net, less reliable.
    const nameQuery = person_id.replace(/_/g, ' ')
    const results = await searchMemory(nameQuery, 50)
    const match = results.find((r) => {
      if (!Array.isArray(r.tags) || !r.tags.includes('person')) return false
      const meta = r.metadata as Record<string, unknown> | null
      if (!meta || typeof meta !== 'object') return false
      if (typeof meta.episode_id === 'string') return false
      return meta.person_id === person_id
    })
    if (!match) return null
    const person = metadataToPerson(match.metadata, match.id)
    if (!person) return null
    return { context_id: match.id, person }
  } catch {
    return null
  }
}

// --- Save a person profile as a "fact" context ---
//
// If a person with this person_id already exists in Nia, merge the new data
// with the existing profile and update the context in place. Otherwise,
// create a new context.
//
// Merge rules:
//   open_loops → union (deduped by string equality)
//   last_seen  → most recent
//   where_met  → keep the original (first encounter)
//   summary    → prefer the most recent non-empty value
//   notes      → append new notes to existing
//   name       → keep the original (first encounter)
//
// After merging, the content prose is regenerated deterministically via
// buildPersonProse() so that Nia's vector index stays consistent with the
// merged metadata.
export async function savePersonContext(person: Person): Promise<string> {
  const existing = await findPersonByPersonId(person.person_id)

  if (existing) {
    const merged: Person = {
      person_id: person.person_id,
      name: existing.person.name || person.name, // keep first encounter name
      where_met: existing.person.where_met || person.where_met, // keep first encounter
      summary: person.summary || existing.person.summary, // prefer newer non-empty
      open_loops: Array.from(
        new Set([
          ...(existing.person.open_loops || []),
          ...(person.open_loops || []),
        ])
      ),
      last_seen: person.last_seen || existing.person.last_seen, // newer wins
      notes: [
        ...(existing.person.notes || []),
        ...(person.notes || []),
      ],
      prose: person.prose || existing.person.prose,
    }

    const rawContent = buildPersonProse(merged)
    const rawSummary = `${merged.name} — met at ${merged.where_met}. ${merged.summary}`.trim()
    const { title, summary, content } = buildPersonFields(
      merged,
      rawSummary,
      rawContent
    )

    await updateContext(existing.context_id, {
      title,
      summary,
      content,
      metadata: personToMetadata(merged),
      tags: ['person', merged.person_id],
    })

    try {
      upsertPerson({ ...merged, nia_context_id: existing.context_id })
    } catch (err) {
      console.error('sqlite upsertPerson (merge) failed:', err)
    }

    return existing.context_id
  }

  // No existing match — create a new context
  const rawContent = person.prose || buildPersonProse(person)
  const rawSummary = `${person.name} — met at ${person.where_met}. ${person.summary}`.trim()
  const { title, summary, content } = buildPersonFields(
    person,
    rawSummary,
    rawContent
  )

  const data = await niaFetch('/contexts', {
    method: 'POST',
    body: JSON.stringify({
      title,
      summary,
      content,
      agent_source: 'secondbrain',
      memory_type: 'fact',
      tags: ['person', person.person_id],
      metadata: personToMetadata(person),
    }),
  })

  try {
    upsertPerson({ ...person, nia_context_id: data.id })
  } catch (err) {
    console.error('sqlite upsertPerson (create) failed:', err)
  }

  return data.id
}

function buildPersonFields(
  person: Person,
  rawSummary: string,
  rawContent: string
): { title: string; summary: string; content: string } {
  const title = truncate(person.name || person.person_id || 'untitled', 200)

  const summaryFiller = `Profile of ${person.name || person.person_id}, first encountered at ${person.where_met || 'an unknown location'}.`
  const summary = truncate(ensureMinLength(rawSummary, 10, summaryFiller), 1000)

  const contentFiller = `Person profile for ${person.name || person.person_id} (id: ${person.person_id}). First encountered at ${person.where_met || 'an unknown location'}. ${person.summary ? `Summary: ${person.summary}.` : ''} ${person.open_loops.length > 0 ? `Open loops: ${person.open_loops.join('; ')}.` : 'No open loops recorded yet.'}`
  const content = ensureMinLength(rawContent, 50, contentFiller)

  return { title, summary, content }
}

// --- Save an episode as an "episodic" context (no dedupe) ---
export async function saveEpisodeContext(episode: Episode): Promise<string> {
  const rawContent = episode.prose || buildEpisodeProse(episode)
  const topicStr = episode.topics.join(', ')
  const promiseStr =
    episode.promises.length > 0
      ? ` promises: ${episode.promises.join('; ')}`
      : ''
  const rawSummary = `episode with ${episode.person_ids.join(', ') || 'unknown participants'} about ${topicStr || 'general conversation'}.${promiseStr}`

  const title = truncate(topicStr || 'untitled episode', 200)
  const summaryFiller = `Recorded ${episode.source} session on ${episode.timestamp || 'unknown date'}.`
  const summary = truncate(ensureMinLength(rawSummary, 10, summaryFiller), 1000)
  const contentFiller = `Episode ${episode.episode_id} captured via ${episode.source}. Participants: ${episode.person_ids.join(', ') || 'unknown'}. Topics: ${topicStr || 'not identified'}. Promises: ${episode.promises.join('; ') || 'none'}. Next actions: ${episode.next_actions.join('; ') || 'none'}.`
  const content = ensureMinLength(rawContent, 50, contentFiller)

  const data = await niaFetch('/contexts', {
    method: 'POST',
    body: JSON.stringify({
      title,
      summary,
      content,
      agent_source: 'secondbrain',
      memory_type: 'episodic',
      tags: ['episode', ...episode.person_ids],
      metadata: episodeToMetadata(episode),
    }),
  })

  try {
    upsertEpisode({ ...episode, nia_context_id: data.id })
  } catch (err) {
    console.error('sqlite upsertEpisode failed:', err)
  }

  return data.id
}

// --- Update an existing context ---
export async function updateContext(
  id: string,
  data: {
    title?: string
    summary?: string
    content?: string
    tags?: string[]
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  await niaFetch(`/contexts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// --- Semantic search across all contexts ---
export async function searchMemory(
  query: string,
  limit: number = 20
): Promise<NiaSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    include_highlights: 'true',
  })

  const data = await niaFetch(`/contexts/semantic-search?${params}`)
  return data.results || []
}

// --- List contexts with server-side filters ---
// GET /contexts?tags=&agent_source=&memory_type=&limit=&offset=
// Deterministic alternative to semantic search for listing by tag/type.
export async function listContexts(params: {
  tags?: string[]
  agent_source?: string
  memory_type?: 'scratchpad' | 'episodic' | 'fact' | 'procedural'
  limit?: number
  offset?: number
}): Promise<NiaSearchResult[]> {
  const query = new URLSearchParams()
  if (params.tags && params.tags.length > 0) {
    query.set('tags', params.tags.join(','))
  }
  if (params.agent_source) query.set('agent_source', params.agent_source)
  if (params.memory_type) query.set('memory_type', params.memory_type)
  query.set('limit', String(Math.min(params.limit ?? 100, 100)))
  query.set('offset', String(params.offset ?? 0))

  const data = await niaFetch(`/contexts?${query}`)
  // Spec returns both `items` (new) and `contexts` (legacy) — prefer items.
  const items: unknown = data.items || data.contexts || []
  if (!Array.isArray(items)) return []
  return items as NiaSearchResult[]
}

// SQLite is the truth for structured reads. Nia is still written to via
// savePersonContext/saveEpisodeContext so semantic search stays current —
// but list queries (dashboard, people, history) no longer round-trip to Nia.
export async function listPeople(limit = 100): Promise<Person[]> {
  return listPeopleDb(limit)
}

export async function listEpisodes(limit = 100): Promise<Episode[]> {
  return listEpisodesDb(limit)
}

// --- Get a single context by ID ---
export async function getContext(id: string) {
  return niaFetch(`/contexts/${id}`)
}

// --- Types for Nia responses ---
export interface NiaSearchResult {
  id: string
  title: string
  summary: string
  content: string
  tags: string[]
  metadata: Record<string, unknown>
  memory_type: string
  created_at: string
  updated_at: string
  [key: string]: unknown
}
