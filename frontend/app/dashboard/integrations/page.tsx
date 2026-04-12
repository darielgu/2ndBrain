'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  Mail,
  Calendar,
  Video,
  Users,
  HardDrive,
  CheckSquare,
  Plug,
  CheckCircle2,
  Circle,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { loadOnboardingProfile, slugifyName } from '@/lib/onboarding-profile'

interface GoogleStatus {
  connected: boolean
  account?: {
    email: string | null
    name: string | null
    picture: string | null
    scope: string | null
    connected_at: number
  }
}

type IntegrationState = 'connected' | 'available' | 'soon'

interface Integration {
  id: string
  provider: string
  name: string
  blurb: string
  icon: LucideIcon
  scope?: string // substring to look for in the granted scope string
  state: IntegrationState
}

// Google sub-integrations (surface-level, each backed by a specific scope).
const GOOGLE_INTEGRATIONS: Integration[] = [
  {
    id: 'gmail-read',
    provider: 'google',
    name: 'gmail — inbox',
    blurb: 'read recent threads, extract people, promises, open loops.',
    icon: Mail,
    scope: 'gmail.readonly',
    state: 'available',
  },
  {
    id: 'gmail-send',
    provider: 'google',
    name: 'gmail — send + draft',
    blurb: 'send emails or drop drafts for you to review before sending.',
    icon: Mail,
    scope: 'gmail.send',
    state: 'available',
  },
  {
    id: 'calendar',
    provider: 'google',
    name: 'calendar',
    blurb: 'read past + upcoming events, book new ones on your behalf.',
    icon: Calendar,
    scope: 'auth/calendar',
    state: 'available',
  },
  {
    id: 'meet',
    provider: 'google',
    name: 'google meet',
    blurb: 'auto-generate meet links when booking calendar events.',
    icon: Video,
    // Meet rides on the calendar scope — no separate scope exists.
    scope: 'auth/calendar',
    state: 'available',
  },
  {
    id: 'contacts',
    provider: 'google',
    name: 'contacts (people api)',
    blurb: 'seed the people graph with names, emails, orgs, titles.',
    icon: Users,
    scope: 'contacts.readonly',
    state: 'available',
  },
  {
    id: 'drive',
    provider: 'google',
    name: 'drive',
    blurb: 'index google docs + files you already have access to.',
    icon: HardDrive,
    scope: 'drive.readonly',
    state: 'available',
  },
  {
    id: 'tasks',
    provider: 'google',
    name: 'tasks',
    blurb: 'turn extracted promises into real to-dos with due dates.',
    icon: CheckSquare,
    scope: 'auth/tasks',
    state: 'available',
  },
]

// Everything else we're planning but haven't built yet.
const UPCOMING: Integration[] = [
  {
    id: 'slack',
    provider: 'slack',
    name: 'slack',
    blurb: 'read dms + threads, surface commitments made in channels.',
    icon: Plug,
    state: 'soon',
  },
  {
    id: 'linear',
    provider: 'linear',
    name: 'linear',
    blurb: 'create issues from extracted next-actions.',
    icon: Plug,
    state: 'soon',
  },
  {
    id: 'notion',
    provider: 'notion',
    name: 'notion',
    blurb: 'sync episodes into a memory page.',
    icon: Plug,
    state: 'soon',
  },
  {
    id: 'imessage',
    provider: 'apple',
    name: 'imessage (local)',
    blurb: 'read local message history on macos — no cloud required.',
    icon: Plug,
    state: 'soon',
  },
]

export default function IntegrationsPage() {
  const [user, setUser] = useState<string | null>(null)
  const [google, setGoogle] = useState<GoogleStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const profile = loadOnboardingProfile()
    if (!profile) {
      setLoading(false)
      return
    }
    const slug = slugifyName(profile.name)
    setUser(slug)
    fetch(`/api/auth/google/status?user=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setGoogle(d))
      .catch(() => setGoogle({ connected: false }))
      .finally(() => setLoading(false))
  }, [])

  const grantedScopes = google?.account?.scope || ''
  const googleIntegrations = useMemo(() => {
    return GOOGLE_INTEGRATIONS.map((item) => {
      const granted = !!item.scope && grantedScopes.includes(item.scope)
      return {
        ...item,
        state: (google?.connected && granted
          ? 'connected'
          : 'available') as IntegrationState,
      }
    })
  }, [grantedScopes, google?.connected])

  const connectedCount = googleIntegrations.filter((i) => i.state === 'connected').length
  const totalCount = googleIntegrations.length

  return (
    <div className="space-y-4">
      <div className="border border-border bg-background/40 p-3">
        <p className="text-xs tracking-widest text-muted-foreground">secondbrain / integrations</p>
        <h1 className="mt-1 text-2xl lowercase tracking-tight md:text-3xl">
          integrations
        </h1>
        <p className="mt-1 text-xs lowercase text-muted-foreground">
          services secondbrain can read from or act on. each scope below is something you said yes to.
        </p>
      </div>

      {/* Provider summary card */}
      <div className="border border-border bg-background/30 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              google workspace
            </p>
            <h2 className="mt-1 text-sm lowercase text-foreground">
              {loading
                ? 'checking…'
                : google?.connected
                ? `linked as ${google.account?.email || google.account?.name}`
                : 'not connected'}
            </h2>
            {google?.connected && (
              <p className="mt-1 text-[11px] lowercase text-muted-foreground">
                {connectedCount} of {totalCount} surfaces active
              </p>
            )}
          </div>
          <div>
            {google?.connected ? (
              <Button asChild size="sm" variant="outline" className="rounded-none lowercase">
                <Link href="/onboarding">manage</Link>
              </Button>
            ) : (
              <Button asChild size="sm" className="rounded-none lowercase">
                <Link href="/onboarding">connect google</Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Google sub-integrations grid */}
      <div className="grid gap-3 md:grid-cols-2">
        {googleIntegrations.map((item) => (
          <IntegrationCard key={item.id} item={item} />
        ))}
      </div>

      {/* Upcoming */}
      <div className="border border-border bg-background/30 p-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          coming soon
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {UPCOMING.map((item) => (
            <IntegrationCard key={item.id} item={item} />
          ))}
        </div>
      </div>

      {!user && !loading && (
        <div className="border border-border bg-background/30 p-3 text-xs lowercase text-muted-foreground">
          set your profile in <Link href="/onboarding" className="underline">onboarding</Link> to
          see which integrations are active.
        </div>
      )}
    </div>
  )
}

function IntegrationCard({ item }: { item: Integration }) {
  const Icon = item.icon
  const statusColor =
    item.state === 'connected'
      ? 'text-foreground'
      : item.state === 'available'
      ? 'text-muted-foreground'
      : 'text-muted-foreground/70'

  const StatusIcon =
    item.state === 'connected'
      ? CheckCircle2
      : item.state === 'available'
      ? Circle
      : XCircle

  return (
    <article
      className={`flex flex-col gap-2 border p-3 text-sm lowercase transition-colors ${
        item.state === 'connected'
          ? 'border-foreground/40 bg-background/60'
          : 'border-border bg-background/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center border border-border bg-background/60">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-foreground">{item.name}</p>
            <p className="text-[11px] tracking-widest text-muted-foreground">
              {item.provider}
            </p>
          </div>
        </div>
        <span className={`flex items-center gap-1 text-[11px] ${statusColor}`}>
          <StatusIcon className="h-3.5 w-3.5" />
          {item.state === 'connected'
            ? 'active'
            : item.state === 'available'
            ? 'not connected'
            : 'coming soon'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{item.blurb}</p>
    </article>
  )
}
