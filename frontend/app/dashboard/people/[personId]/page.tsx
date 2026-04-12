import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock3, MapPin, User } from 'lucide-react'
import { getProfile, getRecentEpisodesForPerson } from '@/lib/recognition-store'

function formatTimestamp(iso?: string) {
  if (!iso) return 'unknown'
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

export default async function PersonPage({
  params,
}: {
  params: Promise<{ personId: string }>
}) {
  const { personId } = await params
  const person_id = decodeURIComponent(personId)
  const profile = await getProfile(person_id)

  if (!profile) {
    notFound()
  }

  const episodes = await getRecentEpisodesForPerson(person_id, 120)
  const avatarUrl = `/api/recognition/profiles/${encodeURIComponent(person_id)}/avatar`

  return (
    <div className="space-y-4">
      <div className="border border-border bg-background/40 p-3">
        <div className="mb-2">
          <Link
            href="/dashboard/people"
            className="inline-flex items-center gap-1 text-xs lowercase text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            back to people
          </Link>
        </div>
        <p className="text-xs tracking-widest text-muted-foreground">secondbrain / people / profile</p>
        <div className="mt-2 flex items-center gap-3">
          <img
            src={avatarUrl}
            alt={`${profile.name} avatar`}
            className="h-12 w-12 rounded-full border border-border object-cover"
          />
          <div>
            <h1 className="text-2xl lowercase tracking-tight md:text-3xl">{profile.name}</h1>
            <p className="text-xs lowercase text-muted-foreground">id: {profile.person_id}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="space-y-2 border border-border bg-background/30 p-3 lg:col-span-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">contact memory</p>
          <p className="text-xs lowercase text-foreground/90">
            met: <span className="text-muted-foreground">{profile.where_met || 'unknown'}</span>
          </p>
          <p className="text-xs lowercase text-foreground/90">
            last seen: <span className="text-muted-foreground">{formatTimestamp(profile.last_seen)}</span>
          </p>
          <p className="text-xs lowercase text-foreground/90">
            conversations: <span className="text-muted-foreground">{profile.conversation_count || 0}</span>
          </p>
          <p className="text-xs lowercase text-foreground/90">
            {profile.summary || 'no summary captured yet'}
          </p>
          <div className="space-y-1 pt-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">open loops</p>
            {profile.open_loops?.length ? (
              <ul className="space-y-1">
                {profile.open_loops.map((loop, idx) => (
                  <li key={`${loop}-${idx}`} className="text-xs lowercase text-foreground/90">
                    • {loop}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs lowercase text-muted-foreground">none yet</p>
            )}
          </div>
        </section>

        <section className="space-y-2 border border-border bg-background/30 p-3 lg:col-span-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">all conversations</p>
          {episodes.length === 0 ? (
            <div className="border border-dashed border-border bg-background/40 p-4 text-xs lowercase text-muted-foreground">
              no episodes saved for this person yet.
            </div>
          ) : (
            <div className="space-y-2">
              {episodes.map((episode) => (
                <article key={episode.episode_id} className="border border-border bg-background/40 p-3">
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1 lowercase">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatTimestamp(episode.timestamp)}
                    </span>
                    <span className="inline-flex items-center gap-1 lowercase">
                      <MapPin className="h-3.5 w-3.5" />
                      {episode.where_met || profile.where_met || 'unknown'}
                    </span>
                    <span className="inline-flex items-center gap-1 lowercase">
                      <User className="h-3.5 w-3.5" />
                      {profile.name}
                    </span>
                  </div>
                  <p className="mt-2 text-xs lowercase text-foreground/90">
                    topic: <span className="text-muted-foreground">{episode.topics[0] || 'general catch-up'}</span>
                  </p>
                  <p className="mt-1 text-xs lowercase text-foreground/90">
                    open loop:{' '}
                    <span className="text-muted-foreground">
                      {episode.promises[0] || episode.next_actions[0] || 'none'}
                    </span>
                  </p>
                  <p className="mt-2 text-xs lowercase text-muted-foreground">
                    {episode.summary || 'summary pending'}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

