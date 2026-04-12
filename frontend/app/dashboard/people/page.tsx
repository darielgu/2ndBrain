import { Users } from 'lucide-react'
import { listPeople } from '@/lib/nia'
import { PeopleGrid } from '@/components/people-grid'

export const dynamic = 'force-dynamic'

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
          <PeopleGrid people={people} />
        )}
      </div>
    </div>
  )
}
