import { Users } from 'lucide-react'
import { people } from '@/lib/dashboard-data'

export default function PeoplePage() {
  return (
    <div className="space-y-4">
      <div className="border border-border bg-background/40 p-3">
        <p className="text-xs tracking-widest text-muted-foreground">secondbrain / people</p>
        <h1 className="mt-1 text-2xl lowercase tracking-tight md:text-3xl">people memory index</h1>
      </div>

      <div className="border border-border bg-background/30 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Users className="h-4 w-4" />
          tracked contacts
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {people.map((person) => (
            <article key={person.id} className="border border-border bg-background/40 p-3">
              <div className="flex items-center gap-2">
                <img
                  src={person.avatar}
                  alt={`${person.name} avatar`}
                  className="h-8 w-8 rounded-full border border-border object-cover"
                />
                <div>
                  <p className="text-sm lowercase">{person.name}</p>
                  <p className="text-[11px] lowercase text-muted-foreground">last seen {person.lastSeen}</p>
                </div>
              </div>
              <p className="mt-2 text-xs lowercase text-muted-foreground">met at {person.whereMet}</p>
              <p className="mt-1 text-xs lowercase text-muted-foreground">{person.summary}</p>
              <p className="mt-2 text-xs lowercase">open loop: {person.openLoop}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
