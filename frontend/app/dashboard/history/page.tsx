import { History } from 'lucide-react'
import { recentEpisodes } from '@/lib/dashboard-data'

export default function HistoryPage() {
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

        <div className="space-y-3">
          {recentEpisodes.map((episode) => (
            <article key={episode.id} className="border border-border bg-background/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">episode</p>
              <p className="mt-1 text-sm lowercase">
                {episode.person} • {episode.timestamp}
              </p>
              <p className="mt-2 text-xs lowercase text-muted-foreground">topic: {episode.topic}</p>
              <p className="mt-1 text-xs lowercase text-muted-foreground">promise: {episode.promise}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
