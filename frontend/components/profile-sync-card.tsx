'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  UserRound,
  UserPlus,
  CheckCircle2,
  Calendar,
  Loader2,
  Mail,
  Video,
  ExternalLink,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { loadOnboardingProfile, slugifyName } from '@/lib/onboarding-profile'
import type { ExtractionResult } from '@/lib/types'
import type { PersonProfileSync } from '@/lib/profile-sync'

/**
 * After a session ends, pull up a card per person we talked to showing
 * whether we already knew them, what we just added, and any upcoming
 * calendar events with them. Runs automatically — no user action needed.
 *
 * IMPORTANT: This component does NOT save people. The session's own save
 * pass (in use-screen-recorder) already handles that via /api/memory.
 * We fire this *after* that save is done, then query the resulting state.
 */
export function ProfileSyncCard({
  extraction,
}: {
  extraction: ExtractionResult
}) {
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<PersonProfileSync[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const profile = loadOnboardingProfile()
    if (!profile || extraction.people.length === 0) {
      setLoading(false)
      return
    }
    const user = slugifyName(profile.name)
    const names = extraction.people.map((p) => p.name).filter(Boolean)

    // Small delay so the session's own person-save pass lands first. The
    // recorder saves people *during* processing; we want to see their
    // post-save state (existing vs new). 1.5s is a reasonable buffer.
    const timer = setTimeout(() => {
      fetch('/api/profile-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, extractedNames: names }),
      })
        .then((r) => r.json())
        .then((d: { profiles?: PersonProfileSync[]; error?: string }) => {
          if (d.error) {
            setError(d.error)
            return
          }
          setProfiles(d.profiles || [])
        })
        .catch((err) =>
          setError(err instanceof Error ? err.message : 'sync failed'),
        )
        .finally(() => setLoading(false))
    }, 1500)

    return () => clearTimeout(timer)
  }, [extraction])

  if (extraction.people.length === 0) return null

  return (
    <Card className="rounded-none border-border bg-background/40 shadow-none">
      <CardHeader className="gap-1 px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm lowercase">
          <UserRound className="h-4 w-4 text-accent" />
          profiles updated ({extraction.people.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4">
        {loading && (
          <p className="text-[11px] lowercase text-muted-foreground">
            <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
            checking profiles + pulling upcoming events…
          </p>
        )}

        {error && !loading && (
          <p className="text-[11px] lowercase text-destructive">error: {error}</p>
        )}

        {!loading &&
          profiles.map((p) => <ProfileRow key={p.person_id} profile={p} />)}
      </CardContent>
    </Card>
  )
}

function ProfileRow({ profile }: { profile: PersonProfileSync }) {
  return (
    <article
      className={`border p-3 text-xs lowercase ${
        profile.was_new
          ? 'border-green-400/40 bg-background/60'
          : 'border-border bg-background/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {profile.was_new ? (
            <UserPlus className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
          )}
          <div>
            <p className="text-sm text-foreground">{profile.name}</p>
            <p className="text-[10px] tracking-widest text-muted-foreground">
              {profile.was_new ? 'new profile' : 'existing profile'}
            </p>
          </div>
        </div>
        <Link
          href={`/dashboard/people`}
          className="inline-flex items-center gap-1 border border-border bg-background/60 px-1.5 py-0.5 text-[10px] text-foreground/80 hover:border-foreground/40"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          view
        </Link>
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">{profile.note}</p>

      {profile.email && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Mail className="h-3 w-3" />
          {profile.email}
        </p>
      )}

      {profile.open_loops.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
          {profile.open_loops.slice(0, 3).map((loop, i) => (
            <li key={i} className="flex gap-1">
              <span className="text-foreground/60">·</span>
              <span>{loop}</span>
            </li>
          ))}
        </ul>
      )}

      {profile.upcoming_events.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-border pt-2">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            <Calendar className="h-3 w-3" />
            upcoming ({profile.upcoming_events.length})
          </p>
          <ul className="space-y-0.5 text-[11px]">
            {profile.upcoming_events.slice(0, 4).map((ev) => (
              <li
                key={ev.id}
                className="flex items-center justify-between gap-2 text-muted-foreground"
              >
                <span className="flex items-center gap-1 truncate">
                  {ev.meetUrl && <Video className="h-3 w-3 text-accent" />}
                  <span className="truncate text-foreground/80">{ev.summary}</span>
                </span>
                <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                  {fmtWhen(ev.startIso)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

function fmtWhen(iso: string): string {
  if (!iso) return 'tbd'
  try {
    const d = new Date(iso)
    const now = new Date()
    const sameYear = d.getFullYear() === now.getFullYear()
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      year: sameYear ? undefined : 'numeric',
    })
  } catch {
    return iso
  }
}
