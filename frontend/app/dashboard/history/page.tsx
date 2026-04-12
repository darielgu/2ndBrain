import { History } from 'lucide-react'
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

export default async function HistoryPage() {
  const [episodes, profiles] = await Promise.all([listEpisodes(60), listProfiles()])
  const personById = Object.fromEntries(
    profiles.map((profile) => [profile.person_id, profile.name])
  )

  return (
    <div className="space-y-4">
      <div className="border border-border bg-background/40 p-3">
        <p className="text-xs tracking-widest text-muted-foreground">secondbrain / history</p>
        <h1 className="mt-1 text-2xl lowercase tracking-tight md:text-3xl">context session history</h1>
      </div>

      <div className="border border-border bg-background/30 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <History className="h-4 w-4" />
          recent episodes
        </div>

        {episodes.length === 0 ? (
          <div className="border border-dashed border-border bg-background/40 p-4 text-xs lowercase text-muted-foreground">
            no conversation history yet. run a session and end it to save episodes.
          </div>
        ) : (
          <div className="space-y-3">
            {episodes.map((episode) => (
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
