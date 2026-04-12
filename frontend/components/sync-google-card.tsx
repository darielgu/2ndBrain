'use client'

import { useEffect, useState } from 'react'
import { Mail, Calendar, Users, RefreshCw, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { loadOnboardingProfile, slugifyName } from '@/lib/onboarding-profile'

interface IngestResult {
  scanned?: number
  episodes?: number
  people?: number
  error?: string
}

interface IngestResponse {
  ok?: boolean
  results?: {
    gmail?: IngestResult
    calendar?: IngestResult
    contacts?: IngestResult
  }
  error?: string
}

export function SyncGoogleCard() {
  const [user, setUser] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<IngestResponse | null>(null)

  useEffect(() => {
    const profile = loadOnboardingProfile()
    if (!profile) return
    const slug = slugifyName(profile.name)
    setUser(slug)
    fetch(`/api/auth/google/status?user=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setConnected(!!d?.connected))
      .catch(() => setConnected(false))
  }, [])

  const run = async (sources: Array<'gmail' | 'calendar' | 'contacts'>) => {
    if (!user) return
    setBusy(sources.join(','))
    setLastRun(null)
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, sources }),
      })
      const data = (await res.json()) as IngestResponse
      setLastRun(data)
    } catch (err) {
      setLastRun({ error: err instanceof Error ? err.message : 'sync failed' })
    } finally {
      setBusy(null)
    }
  }

  if (!user) {
    return (
      <div className="border border-border bg-background/30 p-4 text-xs lowercase text-muted-foreground">
        set your onboarding profile first to enable google sync.
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="border border-border bg-background/30 p-4 text-xs lowercase text-muted-foreground">
        google not linked. connect it from <a href="/onboarding" className="underline">onboarding</a>.
      </div>
    )
  }

  return (
    <div className="space-y-3 border border-border bg-background/30 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            sync google → memory
          </p>
          <p className="mt-1 text-sm lowercase text-foreground">
            pull recent gmail threads, calendar events, and contacts into nia as people + episodes.
          </p>
        </div>
        <RefreshCw className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-none lowercase"
          disabled={busy !== null}
          onClick={() => run(['gmail', 'calendar', 'contacts'])}
        >
          {busy === 'gmail,calendar,contacts' ? 'syncing all…' : 'sync all'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-none lowercase"
          disabled={busy !== null}
          onClick={() => run(['gmail'])}
        >
          <Mail className="mr-1 h-3.5 w-3.5" />
          {busy === 'gmail' ? 'syncing…' : 'gmail'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-none lowercase"
          disabled={busy !== null}
          onClick={() => run(['calendar'])}
        >
          <Calendar className="mr-1 h-3.5 w-3.5" />
          {busy === 'calendar' ? 'syncing…' : 'calendar'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-none lowercase"
          disabled={busy !== null}
          onClick={() => run(['contacts'])}
        >
          <Users className="mr-1 h-3.5 w-3.5" />
          {busy === 'contacts' ? 'syncing…' : 'contacts'}
        </Button>
      </div>

      {lastRun && (
        <div className="border border-border bg-background/60 p-3 text-[11px] lowercase text-muted-foreground">
          {lastRun.error ? (
            <p className="text-destructive">error: {lastRun.error}</p>
          ) : (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" /> sync complete
              </p>
              {lastRun.results?.gmail && (
                <p>
                  gmail: {formatResult(lastRun.results.gmail)}
                </p>
              )}
              {lastRun.results?.calendar && (
                <p>
                  calendar: {formatResult(lastRun.results.calendar)}
                </p>
              )}
              {lastRun.results?.contacts && (
                <p>
                  contacts: {formatResult(lastRun.results.contacts)}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatResult(r: IngestResult): string {
  if (r.error) return `error — ${r.error}`
  const parts: string[] = []
  if (typeof r.scanned === 'number') parts.push(`scanned ${r.scanned}`)
  if (typeof r.episodes === 'number') parts.push(`${r.episodes} episodes`)
  if (typeof r.people === 'number') parts.push(`${r.people} people`)
  return parts.join(' · ') || 'done'
}
