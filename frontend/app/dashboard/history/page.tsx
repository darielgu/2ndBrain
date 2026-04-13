'use client'

import { useEffect, useMemo, useState } from 'react'
import { History } from 'lucide-react'
import type { RecognitionEpisode, RecognitionProfile } from '@/lib/recognition-types'

function formatTimestamp(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

type DashboardPayload = {
  profiles?: RecognitionProfile[]
  episodes?: RecognitionEpisode[]
}

export default function HistoryPage() {
  const [episodes, setEpisodes] = useState<RecognitionEpisode[]>([])
  const [profiles, setProfiles] = useState<RecognitionProfile[]>([])
  const [selectedPersonId, setSelectedPersonId] = useState('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch('/api/recognition/dashboard')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`failed to load history (${res.status})`)
        }
        return (await res.json()) as DashboardPayload
      })
      .then((data) => {
        if (cancelled) return
        setEpisodes(Array.isArray(data.episodes) ? data.episodes : [])
        setProfiles(Array.isArray(data.profiles) ? data.profiles : [])
      })
      .catch((err) => {
        console.error(err)
        if (cancelled) return
        setEpisodes([])
        setProfiles([])
        setError('failed to load history')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const personById = useMemo(
    () => Object.fromEntries(profiles.map((profile) => [profile.person_id, profile.name])),
    [profiles]
  )

  const normalizedQuery = query.trim().toLowerCase()
  const filteredEpisodes = useMemo(() => {
    return episodes.filter((episode) => {
      if (selectedPersonId !== 'all' && episode.person_id !== selectedPersonId) {
        return false
      }
      if (!normalizedQuery) return true

      const personName = personById[episode.person_id] || episode.person_id
      const haystack = [
        personName,
        episode.topics.join(' '),
        episode.promises.join(' '),
        episode.next_actions.join(' '),
        episode.summary,
        episode.where_met || '',
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [episodes, normalizedQuery, personById, selectedPersonId])

  return (
    <div className="micro-stagger space-y-4">
      <div className="border border-border bg-background/40 px-4 py-4 md:px-5 md:py-5">
        <h1 className="text-xl tracking-tight text-foreground md:text-2xl">Context Session History</h1>
      </div>

      <div className="border border-border bg-background/30 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <History className="h-4 w-4" />
          recent episodes
        </div>

        <div className="mb-4 grid gap-2 md:grid-cols-3">
          <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
            person
            <select
              value={selectedPersonId}
              onChange={(event) => setSelectedPersonId(event.target.value)}
              className="mt-1 w-full border border-border bg-background/60 px-2 py-2 text-xs lowercase text-foreground"
            >
              <option value="all">all people</option>
              {profiles.map((profile) => (
                <option key={profile.person_id} value={profile.person_id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[11px] uppercase tracking-widest text-muted-foreground md:col-span-2">
            search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="search topic, open loop, summary, location..."
              className="mt-1 w-full border border-border bg-background/60 px-2 py-2 text-xs lowercase text-foreground placeholder:text-muted-foreground"
            />
          </label>
        </div>

        {error ? (
          <div className="border border-dashed border-destructive/40 bg-background/40 p-4 text-xs lowercase text-destructive">
            {error}
          </div>
        ) : loading ? (
          <div className="border border-dashed border-border bg-background/40 p-4 text-xs lowercase text-muted-foreground">
            loading history...
          </div>
        ) : filteredEpisodes.length === 0 ? (
          <div className="border border-dashed border-border bg-background/40 p-4 text-xs lowercase text-muted-foreground">
            no matching episodes found.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEpisodes.map((episode) => (
              <article key={episode.episode_id} className="border border-border bg-background/40 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">episode</p>
                <p className="mt-1 text-sm lowercase">
                  {(personById[episode.person_id] || episode.person_id).toLowerCase()} • {formatTimestamp(episode.timestamp)}
                </p>
                <p className="mt-2 text-xs lowercase text-muted-foreground">
                  topic: {(episode.topics[0] || 'general catch-up').toLowerCase()}
                </p>
                <p className="mt-1 text-xs lowercase text-muted-foreground">
                  open loop: {(episode.promises[0] || episode.next_actions[0] || 'none').toLowerCase()}
                </p>
                <p className="mt-2 text-xs lowercase text-muted-foreground">
                  {(episode.summary || 'summary pending').toLowerCase()}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
