import Link from 'next/link'
import { ArrowRight, Link2, MessageSquare, UserRound, Users, Video } from 'lucide-react'
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
  const recentEpisodes = episodes.slice(0, 5)
  const topProfiles = profiles.slice(0, 3)

  const personById = Object.fromEntries(
    profiles.map((profile) => [profile.person_id, profile])
  )

  return (
    <div className="micro-stagger space-y-4">
      <div className="border border-border bg-background/40 px-4 py-4 md:px-5 md:py-5">
        <h1 className="text-xl tracking-tight text-foreground md:text-2xl">
          Relationship Memory Overview
        </h1>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <section className="border border-border bg-background/30 p-4 xl:col-span-3">
          <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Link2 className="h-4 w-4" />
            recent memory links
          </p>
          {recentEpisodes.length === 0 ? (
            <div className="border border-dashed border-border bg-background/40 p-4 text-xs lowercase text-muted-foreground">
              no episodes yet. start a webcam session to capture your first conversation memory.
            </div>
          ) : (
            <div className="space-y-2">
              {recentEpisodes.map((episode) => {
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
        </section>

        <section className="border border-border bg-background/30 p-4 xl:col-span-2">
          <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Users className="h-4 w-4" />
            recent profiles
          </p>
          {topProfiles.length === 0 ? (
            <div className="border border-dashed border-border bg-background/40 p-4 text-xs lowercase text-muted-foreground">
              no people indexed yet.
            </div>
          ) : (
            <div className="space-y-2">
              {topProfiles.map((person) => {
                const avatarUrl = `/api/recognition/profiles/${encodeURIComponent(person.person_id)}/avatar`
                return (
                  <Link
                    key={person.person_id}
                    href={`/dashboard/people/${encodeURIComponent(person.person_id)}`}
                    className="group flex items-center justify-between border border-border bg-background/60 p-3 transition hover:border-blue-300/50 hover:bg-background"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {person.face_frames?.length ? (
                        <img
                          src={avatarUrl}
                          alt={`${person.name} avatar`}
                          className="h-9 w-9 shrink-0 rounded-full border border-border object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs lowercase text-muted-foreground">
                          {(person.name || '?').slice(0, 1)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm lowercase text-foreground">{person.name}</p>
                        <p className="truncate text-[11px] lowercase text-muted-foreground">
                          {person.where_met || 'unknown'} • {person.open_loops?.[0] || 'no open loops'}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:text-foreground" />
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <div className="border border-border bg-background/30 p-4">
        <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
          quick actions
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/dashboard/chat"
            className="group flex flex-1 items-center justify-between border border-border bg-background/60 p-3 transition hover:border-blue-300/50 hover:bg-background"
          >
            <span className="inline-flex items-center gap-2 text-sm lowercase text-foreground">
              <MessageSquare className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
              open memory chat
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:text-foreground" />
          </Link>
          <Link
            href="/dashboard/session"
            className="group flex flex-1 items-center justify-between border border-border bg-background/60 p-3 transition hover:border-blue-300/50 hover:bg-background"
          >
            <span className="inline-flex items-center gap-2 text-sm lowercase text-foreground">
              <Video className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
              start session
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:text-foreground" />
          </Link>
        </div>
      </div>
    </div>
  )
}
