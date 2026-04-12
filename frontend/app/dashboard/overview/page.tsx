import { Link2, UserRound } from 'lucide-react'
import { people, recentEpisodes } from '@/lib/dashboard-data'
import { SyncGoogleCard } from '@/components/sync-google-card'

const personById = Object.fromEntries(people.map((person) => [person.id, person]))

export default function OverviewPage() {
  return (
    <div className="space-y-4">
      <div className="border border-border bg-background/40 p-3">
        <p className="text-xs tracking-widest text-muted-foreground">secondbrain / overview</p>
        <h1 className="mt-1 text-2xl lowercase tracking-tight md:text-3xl">relationship memory overview</h1>
      </div>

      <SyncGoogleCard />

      <div className="border border-border bg-background/30 p-4">
        <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Link2 className="h-4 w-4" />
          recent memory links
        </p>
        <div className="space-y-2">
          {recentEpisodes.map((episode) => {
            const person = personById[episode.personId]
            return (
              <article
                key={episode.id}
                className="flex flex-col gap-2 border border-border bg-background/60 p-3 text-xs lowercase md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <p className="flex items-center gap-2 text-sm">
                    <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                    {episode.person}
                  </p>
                  <p className="text-muted-foreground">topic: {episode.topic}</p>
                  <p className="text-blue-300/90">promise: {episode.promise}</p>
                </div>
                <div className="text-[11px] text-muted-foreground md:text-right">
                  <p>{episode.timestamp}</p>
                  {person ? <p>where met: {person.whereMet}</p> : null}
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
