import type { Person, Episode } from './types'
import {
  listEpisodesDb,
  listPeopleDb,
  upsertEpisode,
  upsertPerson,
  getPerson,
} from './db'

const NIA_BASE_URL = process.env.NIA_BASE_URL || 'https://apigcp.trynia.ai/v2'
const NIA_API_KEY = process.env.NIA_API_KEY || ''
const NIA_TIMEOUT_MS = Number(process.env.NIA_TIMEOUT_MS || 25_000)
const NIA_MAX_RETRIES = Number(process.env.NIA_MAX_RETRIES || 2)
const NIA_RETRY_BASE_MS = Number(process.env.NIA_RETRY_BASE_MS || 350)

export interface NiaUpsertResult {
  id: string
  action: 'created' | 'updated'
}

const NIA_MIN_CONTENT_CHARS = 50

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetriableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

function isRetriableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('fetch failed') ||
    message.includes('UND_ERR_HEADERS_TIMEOUT') ||
    message.includes('timed out') ||
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT')
  )
}

async function niaFetch(path: string, options: RequestInit = {}) {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= NIA_MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), NIA_TIMEOUT_MS)
    try {
      const res = await fetch(`${NIA_BASE_URL}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${NIA_API_KEY}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        const err = new Error(`nia ${options.method || 'GET'} ${path} failed (${res.status}): ${body}`)
        if (!isRetriableStatus(res.status) || attempt === NIA_MAX_RETRIES) {
          throw err
        }
        lastError = err
      } else {
        return res.json()
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      if (!isRetriableError(error) || attempt === NIA_MAX_RETRIES) {
        throw error
      }
      lastError = error
    } finally {
      clearTimeout(timeoutId)
    }

    const jitter = Math.floor(Math.random() * 80)
    const backoff = NIA_RETRY_BASE_MS * Math.pow(2, attempt) + jitter
    await wait(backoff)
  }

  throw lastError || new Error(`nia ${options.method || 'GET'} ${path} failed`)
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

function ensureMinContent(content: string, fallbackSentences: string[]): string {
  const trimmed = content.trim()
  if (trimmed.length >= NIA_MIN_CONTENT_CHARS) return trimmed

  const extra = fallbackSentences
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .trim()

  const joined = [trimmed, extra].filter(Boolean).join(' ').trim()
  if (joined.length >= NIA_MIN_CONTENT_CHARS) return joined

  return `${joined} This memory entry was captured by SecondBrain and will be enriched as more interactions are recorded.`
    .trim()
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

  return {
    episode_id,
    person_ids: Array.isArray(meta.person_ids)
      ? (meta.person_ids as string[]).filter((v) => typeof v === 'string')
      : [],
    topics: Array.isArray(meta.topics)
      ? (meta.topics as string[]).filter((v) => typeof v === 'string')
      : [],
    promises: Array.isArray(meta.promises)
      ? (meta.promises as string[]).filter((v) => typeof v === 'string')
      : [],
    next_actions: Array.isArray(meta.next_actions)
      ? (meta.next_actions as string[]).filter((v) => typeof v === 'string')
      : [],
    timestamp: typeof meta.timestamp === 'string' ? meta.timestamp : new Date().toISOString(),
    source: meta.source === 'screen' ? 'screen' : 'webcam',
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

export async function findEpisodeByEpisodeId(
  episode_id: string
): Promise<{ context_id: string; episode: Episode } | null> {
  try {
    const results = await searchMemory(episode_id, 50)
    const match = results.find((r) => {
      if (!Array.isArray(r.tags) || !r.tags.includes('episode')) return false
      const meta = r.metadata as Record<string, unknown> | null
      if (!meta || typeof meta !== 'object') return false
      return meta.episode_id === episode_id
    })
    if (!match) return null
    const episode = metadataToEpisode(match.metadata, match.id)
    if (!episode) return null
    return { context_id: match.id, episode }
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
// Nia-only upsert (without touching sqlite). Exposed so callers who already
// own the sqlite write can reuse the dedupe + merge + ensureMinContent logic.
export async function upsertPersonContext(person: Person): Promise<NiaUpsertResult> {
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

    const content = ensureMinContent(buildPersonProse(merged), [
      `${merged.name} was met at ${merged.where_met || 'an unknown place'}.`,
      merged.summary
        ? `Known context: ${merged.summary}.`
        : 'Additional context is not yet available.',
      merged.open_loops?.length
        ? `Open loops: ${merged.open_loops.join(', ')}.`
        : 'No open loops recorded yet.',
    ])
    const shortSummary = `${merged.name} — met at ${merged.where_met}. ${merged.summary}`.trim()

    await updateContext(existing.context_id, {
      title: merged.name,
      summary: shortSummary,
      content,
      metadata: personToMetadata(merged),
      tags: ['person', merged.person_id],
    })

    return { id: existing.context_id, action: 'updated' }
  }

  // No existing match — create a new context
  const content = ensureMinContent(person.prose || buildPersonProse(person), [
    `${person.name} was met at ${person.where_met || 'an unknown place'}.`,
    person.summary
      ? `Known context: ${person.summary}.`
      : 'Additional context is not yet available.',
    person.open_loops?.length
      ? `Open loops: ${person.open_loops.join(', ')}.`
      : 'No open loops recorded yet.',
  ])
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
  return { id: data.id as string, action: 'created' }
}

// Sqlite-first save: the /people tab updates immediately even when nia is
// slow or unreachable. Merges against the local person record so repeated
// encounters accumulate rather than overwrite, then does a best-effort nia
// sync in the background to keep semantic search current.
export async function savePersonContext(person: Person): Promise<string> {
  const existingLocal = getPerson(person.person_id)
  const merged: Person = existingLocal
    ? {
        person_id: person.person_id,
        name: existingLocal.name || person.name,
        where_met: existingLocal.where_met || person.where_met,
        summary: person.summary || existingLocal.summary,
        open_loops: Array.from(
          new Set([
            ...(existingLocal.open_loops || []),
            ...(person.open_loops || []),
          ]),
        ),
        last_seen: person.last_seen || existingLocal.last_seen,
        notes: [...(existingLocal.notes || []), ...(person.notes || [])],
        prose: person.prose || existingLocal.prose,
        face_image: person.face_image || existingLocal.face_image,
        nia_context_id: existingLocal.nia_context_id,
        email: person.email || existingLocal.email,
        job_title: person.job_title || existingLocal.job_title,
        company: person.company || existingLocal.company,
        linkedin_url: person.linkedin_url || existingLocal.linkedin_url,
        instagram: person.instagram || existingLocal.instagram,
        twitter: person.twitter || existingLocal.twitter,
        manual_notes: person.manual_notes || existingLocal.manual_notes,
      }
    : { ...person }

  try {
    upsertPerson(merged)
  } catch (err) {
    console.error('sqlite upsertPerson (local-first) failed:', err)
  }

  try {
    const result = await upsertPersonContext(merged)
    if (merged.nia_context_id !== result.id) {
      try {
        upsertPerson({ ...merged, nia_context_id: result.id })
      } catch (err) {
        console.error('sqlite back-fill nia_context_id failed:', err)
      }
    }
    return result.id
  } catch (err) {
    console.error(
      `nia sync failed for ${merged.person_id} — sqlite still updated:`,
      err,
    )
    return merged.nia_context_id || merged.person_id
  }
}

// --- Save an episode as an "episodic" context ---
// Uses episode_id metadata for idempotency (update existing when found).
export async function upsertEpisodeContext(episode: Episode): Promise<NiaUpsertResult> {
  const existing = await findEpisodeByEpisodeId(episode.episode_id)
  const content = ensureMinContent(episode.prose || buildEpisodeProse(episode), [
    `Episode captured on ${formatDate(episode.timestamp)} from ${episode.source}.`,
    episode.topics.length
      ? `Topics: ${episode.topics.join(', ')}.`
      : 'Topics were not extracted.',
  ])
  const topicStr = episode.topics.join(', ')
  const promiseStr =
    episode.promises.length > 0
      ? ` promises: ${episode.promises.join('; ')}`
      : ''
  const shortSummary = `episode with ${episode.person_ids.join(', ')} about ${topicStr}.${promiseStr}`

  if (existing) {
    await updateContext(existing.context_id, {
      title: topicStr || 'untitled episode',
      summary: shortSummary,
      content,
      tags: ['episode', ...episode.person_ids],
      metadata: episodeToMetadata(episode),
    })
    return { id: existing.context_id, action: 'updated' }
  }

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
  return { id: data.id as string, action: 'created' }
}

export async function saveEpisodeContext(episode: Episode): Promise<string> {
  const result = await upsertEpisodeContext(episode)
  try {
    upsertEpisode({ ...episode, nia_context_id: result.id })
  } catch (err) {
    console.error('sqlite upsertEpisode failed:', err)
  }
  return result.id
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

export function filterResultsByPersonIds(
  results: NiaSearchResult[],
  personIds: string[]
): NiaSearchResult[] {
  if (personIds.length === 0) return results
  const set = new Set(personIds)
  return results.filter((result) => {
    const meta = result.metadata as Record<string, unknown>
    if (typeof meta.person_id === 'string' && set.has(meta.person_id)) return true
    if (Array.isArray(meta.person_ids)) {
      return meta.person_ids.some((id) => set.has(String(id)))
    }
    return false
  })
}

export function bestEpisodeSummaryForPerson(
  results: NiaSearchResult[],
  personId: string
): string {
  const byRecency = (result: NiaSearchResult): string => {
    const updated =
      typeof result.updated_at === 'string' ? result.updated_at : ''
    const created =
      typeof result.created_at === 'string' ? result.created_at : ''
    return updated || created || ''
  }

  const episode = results
    .filter((result) => {
      if (!Array.isArray(result.tags) || !result.tags.includes('episode')) return false
      const meta = result.metadata as Record<string, unknown>
      const personIds = Array.isArray(meta.person_ids)
        ? meta.person_ids.map((value) => String(value))
        : []
      return personIds.includes(personId)
    })
    .sort((a, b) => byRecency(b).localeCompare(byRecency(a)))[0]
  return episode?.summary || ''
}

// --- Get a single context by ID ---
export async function getContext(id: string) {
  return niaFetch(`/contexts/${id}`)
}

export async function listPeople(limit = 100): Promise<Person[]> {
  return listPeopleDb(limit)
}

export async function listEpisodes(limit = 100): Promise<Episode[]> {
  return listEpisodesDb(limit)
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
