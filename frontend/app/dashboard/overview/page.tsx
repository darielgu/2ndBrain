import { Link2, UserRound } from 'lucide-react'
import { listEpisodes, listProfiles } from '@/lib/recognition-store'

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

export default async function OverviewPage() {
  const [profiles, episodes] = await Promise.all([
    listProfiles(),
    listEpisodes(12),
  ])

  const personById = Object.fromEntries(
    profiles.map((profile) => [profile.person_id, profile])
  )

  return (
    <div className="space-y-4">
      <div className="border border-border bg-background/40 p-3">
        <p className="text-xs tracking-widest text-muted-foreground">secondbrain / overview</p>
        <h1 className="mt-1 text-2xl lowercase tracking-tight md:text-3xl">relationship memory overview</h1>
      </div>

      <div className="border border-border bg-background/30 p-4">
        <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Link2 className="h-4 w-4" />
          recent memory links
        </p>
        {episodes.length === 0 ? (
          <div className="border border-dashed border-border bg-background/40 p-4 text-xs lowercase text-muted-foreground">
            no episodes yet. start a webcam session to capture your first conversation memory.
          </div>
        ) : (
          <div className="space-y-2">
            {episodes.map((episode) => {
              const person = personById[episode.person_id]
              return (
                <article
                  key={episode.episode_id}
                  className="flex flex-col gap-2 border border-border bg-background/60 p-3 text-xs lowercase md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <p className="flex items-center gap-2 text-sm">
                      <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                      {person?.name || episode.person_id}
                    </p>
                    <p className="text-muted-foreground">topic: {episode.topics[0] || 'general catch-up'}</p>
                    <p className="text-blue-300/90">open loop: {(episode.promises[0] || episode.next_actions[0] || 'none').toLowerCase()}</p>
                  </div>
                  <div className="text-[11px] text-muted-foreground md:text-right">
                    <p>{formatTimestamp(episode.timestamp)}</p>
                    <p>where met: {person?.where_met || episode.where_met || 'unknown'}</p>
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
