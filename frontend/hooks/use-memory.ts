'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Person, Episode } from '@/lib/types'

interface NiaResult {
  id: string
  title: string
  summary: string
  content: string
  tags: string[]
  metadata: Record<string, unknown>
  memory_type: string
  created_at: string
  updated_at: string
}

/**
 * Parse a Nia search result into a Person object from its metadata field.
 * (The content field now holds prose for semantic search; the structured
 * object lives in metadata.)
 */
function resultToPerson(result: NiaResult): Person | null {
  const meta = result.metadata
  if (!meta || typeof meta !== 'object') return null

  const person_id = typeof meta.person_id === 'string' ? meta.person_id : ''
  if (!person_id) return null

  return {
    person_id,
    name: typeof meta.name === 'string' ? meta.name : person_id,
    where_met: typeof meta.where_met === 'string' ? meta.where_met : '',
    summary: typeof meta.summary === 'string' ? meta.summary : '',
    open_loops: Array.isArray(meta.open_loops)
      ? (meta.open_loops as unknown[]).filter(
          (v): v is string => typeof v === 'string'
        )
      : [],
    last_seen: typeof meta.last_seen === 'string' ? meta.last_seen : '',
    notes: Array.isArray(meta.notes)
      ? (meta.notes as unknown[]).filter(
          (v): v is string => typeof v === 'string'
        )
      : undefined,
    prose: typeof meta.prose === 'string' ? meta.prose : undefined,
    nia_context_id: result.id,
  }
}

/**
 * Parse a Nia search result into an Episode object from its metadata field.
 */
function resultToEpisode(result: NiaResult): Episode | null {
  const meta = result.metadata
  if (!meta || typeof meta !== 'object') return null

  const episode_id = typeof meta.episode_id === 'string' ? meta.episode_id : ''
  if (!episode_id) return null

  const source = meta.source === 'webcam' ? 'webcam' : 'screen'

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
    nia_context_id: result.id,
  }
}

async function fetchMemory(query: string, limit = 20): Promise<NiaResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  const res = await fetch(`/api/memory?${params}`)
  if (!res.ok) throw new Error('memory fetch failed')
  const data = await res.json()
  return data.results || []
}

// --- People hook ---
export function usePeople(refreshKey: number = 0) {
  const [people, setPeople] = useState<Person[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const results = await fetchMemory('person', 50)
      // Filter to person records. We can't trust `memory_type` from the
      // search endpoint (see findPersonByPersonId for details) — use tags
      // plus metadata.person_id without metadata.episode_id instead.
      const personResults = results.filter((r) => {
        if (!r.tags?.includes('person')) return false
        const meta = r.metadata as Record<string, unknown> | null
        if (!meta || typeof meta !== 'object') return false
        if (typeof meta.episode_id === 'string') return false
        return typeof meta.person_id === 'string' && meta.person_id.length > 0
      })
      // Dedupe in-memory in case older un-merged duplicates still exist in Nia
      const seen = new Set<string>()
      const parsed: Person[] = []
      for (const r of personResults) {
        const p = resultToPerson(r)
        if (!p) continue
        if (seen.has(p.person_id)) continue
        seen.add(p.person_id)
        parsed.push(p)
      }
      setPeople(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  return { people, isLoading, error, refresh: load }
}

// --- Episodes hook ---
export function useEpisodes(refreshKey: number = 0) {
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const results = await fetchMemory('episode', 20)
      // Filter to episode records by tag + presence of metadata.episode_id.
      // Not filtering by `memory_type` because Nia's search endpoint
      // unreliably reports it (see nia.ts for details).
      const episodeResults = results.filter((r) => {
        if (!r.tags?.includes('episode')) return false
        const meta = r.metadata as Record<string, unknown> | null
        if (!meta || typeof meta !== 'object') return false
        return typeof meta.episode_id === 'string' && meta.episode_id.length > 0
      })
      const parsed = episodeResults
        .map(resultToEpisode)
        .filter((e): e is Episode => e !== null)
      // Sort by timestamp desc
      parsed.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      setEpisodes(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  return { episodes, isLoading, error, refresh: load }
}
