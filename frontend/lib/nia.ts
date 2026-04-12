import type { Person, Episode } from './types'

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

// --- Dedupe lookup: find an existing person context by exact person_id ---

export async function findPersonByPersonId(
  person_id: string
): Promise<{ context_id: string; person: Person } | null> {
  // Semantic search by name (derived from person_id) casts a wide net.
  // We then filter results in code for exact metadata.person_id equality.
  //
  // NOTE: We do NOT filter by `memory_type === 'fact'` here. Nia's
  // semantic-search endpoint returns `memory_type: "episodic"` for ALL
  // results regardless of how they were actually saved (verified against
  // the GET /contexts/{id} endpoint, which returns the real value). We
  // instead rely on tags + the presence of `metadata.person_id` + the
  // absence of `metadata.episode_id` to identify person records.
  const nameQuery = person_id.replace(/_/g, ' ')

  try {
    const results = await searchMemory(nameQuery, 50)
    const match = results.find((r) => {
      if (!Array.isArray(r.tags) || !r.tags.includes('person')) return false
      const meta = r.metadata as Record<string, unknown> | null
      if (!meta || typeof meta !== 'object') return false
      // Person records have person_id but no episode_id
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

    const content = buildPersonProse(merged)
    const shortSummary = `${merged.name} — met at ${merged.where_met}. ${merged.summary}`.trim()

    await updateContext(existing.context_id, {
      title: merged.name,
      summary: shortSummary,
      content,
      metadata: personToMetadata(merged),
      tags: ['person', merged.person_id],
    })

    return existing.context_id
  }

  // No existing match — create a new context
  const content = person.prose || buildPersonProse(person)
  const shortSummary = `${person.name} — met at ${person.where_met}. ${person.summary}`.trim()

  const data = await niaFetch('/contexts', {
    method: 'POST',
    body: JSON.stringify({
      title: person.name,
      summary: shortSummary,
      content,
      agent_source: 'secondbrain',
      memory_type: 'fact',
      tags: ['person', person.person_id],
      metadata: personToMetadata(person),
    }),
  })
  return data.id
}

// --- Save an episode as an "episodic" context (no dedupe) ---
export async function saveEpisodeContext(episode: Episode): Promise<string> {
  const content = episode.prose || buildEpisodeProse(episode)
  const topicStr = episode.topics.join(', ')
  const promiseStr =
    episode.promises.length > 0
      ? ` promises: ${episode.promises.join('; ')}`
      : ''
  const shortSummary = `episode with ${episode.person_ids.join(', ')} about ${topicStr}.${promiseStr}`

  const data = await niaFetch('/contexts', {
    method: 'POST',
    body: JSON.stringify({
      title: topicStr || 'untitled episode',
      summary: shortSummary,
      content,
      agent_source: 'secondbrain',
      memory_type: 'episodic',
      tags: ['episode', ...episode.person_ids],
      metadata: episodeToMetadata(episode),
    }),
  })
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
