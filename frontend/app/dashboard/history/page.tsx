import { History } from 'lucide-react'
import { listEpisodes } from '@/lib/nia'

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

export default async function HistoryPage() {
  let episodes: Awaited<ReturnType<typeof listEpisodes>> = []
  let fetchError: string | null = null

  try {
    episodes = await listEpisodes(100)
  } catch (err) {
    console.error('failed to list episodes:', err)
    fetchError = 'could not load episodes from nia'
  }

  return (
    <div className="space-y-4">
      <div className="border border-border bg-background/40 p-3">
        <p className="text-xs tracking-widest text-muted-foreground">
          secondbrain / history
        </p>
        <h1 className="mt-1 text-2xl lowercase tracking-tight md:text-3xl">
          context session history
        </h1>
      </div>

      <div className="border border-border bg-background/30 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <History className="h-4 w-4" />
          recent episodes ({episodes.length})
        </div>

        {fetchError ? (
          <p className="text-xs lowercase text-red-400">{fetchError}</p>
        ) : episodes.length === 0 ? (
          <p className="text-xs lowercase text-muted-foreground">
            no sessions recorded yet.
          </p>
        ) : (
          <div className="space-y-3">
            {episodes.map((episode) => {
              const personLabel =
                episode.person_ids.length > 0
                  ? episode.person_ids
                      .map((id) => id.replace(/_/g, ' '))
                      .join(', ')
                  : 'unknown participant'
              const topicLabel =
                episode.topics.length > 0
                  ? episode.topics.join(', ')
                  : 'no topics extracted'
              return (
                <article
                  key={episode.episode_id}
                  className="border border-border bg-background/40 p-3"
                >
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    episode · {episode.source}
                  </p>
                  <p className="mt-1 text-sm lowercase">
                    {personLabel} • {formatTimestamp(episode.timestamp)}
                  </p>
                  <p className="mt-2 text-xs lowercase text-muted-foreground">
                    topic: {topicLabel}
                  </p>
                  {episode.promises.length > 0 ? (
                    <p className="mt-1 text-xs lowercase text-muted-foreground">
                      promise: {episode.promises[0]}
                      {episode.promises.length > 1
                        ? ` (+${episode.promises.length - 1} more)`
                        : ''}
                    </p>
                  ) : null}
                  {episode.next_actions.length > 0 ? (
                    <p className="mt-1 text-xs lowercase text-muted-foreground">
                      next: {episode.next_actions[0]}
                    </p>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
