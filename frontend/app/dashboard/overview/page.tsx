import { Link2, UserRound } from 'lucide-react'
import { listEpisodes, listPeople } from '@/lib/nia'
import type { Person } from '@/lib/types'

export const dynamic = 'force-dynamic'

function formatTimestamp(iso: string): string {
  if (!iso) return 'unknown time'
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default async function OverviewPage() {
  let people: Person[] = []
  let episodes: Awaited<ReturnType<typeof listEpisodes>> = []
  let fetchError: string | null = null

  try {
    const [p, e] = await Promise.all([listPeople(100), listEpisodes(100)])
    people = p
    episodes = e
  } catch (err) {
    console.error('failed to load overview:', err)
    fetchError = 'could not load memory index from nia'
  }

  const personById = Object.fromEntries(
    people.map((person) => [person.person_id, person])
  )

  return (
    <div className="space-y-4">
      <div className="border border-border bg-background/40 p-3">
        <p className="text-xs tracking-widest text-muted-foreground">
          secondbrain / overview
        </p>
        <h1 className="mt-1 text-2xl lowercase tracking-tight md:text-3xl">
          relationship memory overview
        </h1>
      </div>

      <div className="border border-border bg-background/30 p-4">
        <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Link2 className="h-4 w-4" />
          recent memory links ({episodes.length})
        </p>

        {fetchError ? (
          <p className="text-xs lowercase text-red-400">{fetchError}</p>
        ) : episodes.length === 0 ? (
          <p className="text-xs lowercase text-muted-foreground">
            no memory yet. record your first session to start the index.
          </p>
        ) : (
          <div className="space-y-2">
            {episodes.slice(0, 10).map((episode) => {
              const firstPersonId = episode.person_ids[0]
              const person = firstPersonId ? personById[firstPersonId] : null
              const personLabel = person
                ? person.name
                : firstPersonId
                  ? firstPersonId.replace(/_/g, ' ')
                  : 'unknown'
              const topicLabel =
                episode.topics.length > 0
                  ? episode.topics.join(', ')
                  : 'no topics extracted'
              const promiseLabel =
                episode.promises.length > 0 ? episode.promises[0] : null

              return (
                <article
                  key={episode.episode_id}
                  className="flex flex-col gap-2 border border-border bg-background/60 p-3 text-xs lowercase md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <p className="flex items-center gap-2 text-sm">
                      <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                      {personLabel}
                    </p>
                    <p className="text-muted-foreground">topic: {topicLabel}</p>
                    {promiseLabel ? (
                      <p className="text-blue-300/90">
                        promise: {promiseLabel}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-muted-foreground md:text-right">
                    <p>{formatTimestamp(episode.timestamp)}</p>
                    {person?.where_met ? (
                      <p>where met: {person.where_met}</p>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
