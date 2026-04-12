import { Users } from 'lucide-react'
import { listPeople } from '@/lib/nia'

export const dynamic = 'force-dynamic'

function formatLastSeen(iso: string): string {
  if (!iso) return 'never'
  try {
    const then = new Date(iso).getTime()
    const now = Date.now()
    const diffMs = now - then
    const minutes = Math.floor(diffMs / 60_000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export default async function PeoplePage() {
  let people: Awaited<ReturnType<typeof listPeople>> = []
  let fetchError: string | null = null

  try {
    people = await listPeople(100)
  } catch (err) {
    console.error('failed to list people:', err)
    fetchError = 'could not load people from nia'
  }

  return (
    <div className="space-y-4">
      <div className="border border-border bg-background/40 p-3">
        <p className="text-xs tracking-widest text-muted-foreground">
          secondbrain / people
        </p>
        <h1 className="mt-1 text-2xl lowercase tracking-tight md:text-3xl">
          people memory index
        </h1>
      </div>

      <div className="border border-border bg-background/30 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Users className="h-4 w-4" />
          tracked contacts ({people.length})
        </div>

        {fetchError ? (
          <p className="text-xs lowercase text-red-400">{fetchError}</p>
        ) : people.length === 0 ? (
          <p className="text-xs lowercase text-muted-foreground">
            no people yet. start a session to capture your first memory.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {people.map((person) => (
              <article
                key={person.person_id}
                className="border border-border bg-background/40 p-3"
              >
                <div className="flex items-start gap-3">
                  {person.face_image ? (
                    // Passively enrolled from a meet frame — rendered as a
                    // square thumbnail. eslint-disable-next-line @next/next/no-img-element
                    // is intentional: face_image is a base64 data URL, not
                    // a remote asset that next/image can optimize.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={person.face_image}
                      alt={`face of ${person.name}`}
                      className="h-14 w-14 shrink-0 border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-border bg-secondary/30 font-mono text-[10px] lowercase text-muted-foreground">
                      {(person.name || '?').slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm lowercase">{person.name}</p>
                    <p className="text-[11px] lowercase text-muted-foreground">
                      last seen {formatLastSeen(person.last_seen)}
                    </p>
                  </div>
                </div>
                {person.where_met ? (
                  <p className="mt-2 text-xs lowercase text-muted-foreground">
                    met at {person.where_met}
                  </p>
                ) : null}
                {person.summary ? (
                  <p className="mt-1 text-xs lowercase text-muted-foreground">
                    {person.summary}
                  </p>
                ) : null}
                {person.open_loops.length > 0 ? (
                  <p className="mt-2 text-xs lowercase">
                    open loop: {person.open_loops[0]}
                    {person.open_loops.length > 1
                      ? ` (+${person.open_loops.length - 1} more)`
                      : ''}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
