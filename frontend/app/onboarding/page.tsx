'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, CheckCircle2, Link2, Mail, Calendar, Video, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  loadOnboardingProfile,
  normalizeUrlInput,
  saveOnboardingProfile,
  slugifyName,
  type OnboardingProfile,
  validateProfile,
} from '@/lib/onboarding-profile'

type ProfileErrors = Partial<Record<keyof OnboardingProfile, string>>

const INITIAL_PROFILE: OnboardingProfile = {
  name: '',
  linkedinUrl: '',
  portfolioUrl: '',
}

interface GoogleAccountInfo {
  email: string | null
  name: string | null
  picture: string | null
  scope: string | null
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingInner />
    </Suspense>
  )
}

function OnboardingInner() {
  const searchParams = useSearchParams()
  const [profile, setProfile] = useState<OnboardingProfile>(INITIAL_PROFILE)
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [googleAccount, setGoogleAccount] = useState<GoogleAccountInfo | null>(null)
  const [googleStatus, setGoogleStatus] = useState<string | null>(null)
  const [googleBusy, setGoogleBusy] = useState(false)

  const userSlug = useMemo(() => slugifyName(profile.name), [profile.name])

  useEffect(() => {
    const existing = loadOnboardingProfile()
    if (existing) {
      setProfile(existing)
    }
  }, [])

  // Surface status from the oauth redirect (?google=connected|denied|error).
  useEffect(() => {
    const status = searchParams.get('google')
    if (!status) return
    if (status === 'connected') setGoogleStatus('google connected')
    else if (status === 'denied') setGoogleStatus('google access denied')
    else setGoogleStatus(`google error: ${searchParams.get('reason') || 'unknown'}`)
  }, [searchParams])

  // Fetch current google link status whenever the user slug changes.
  useEffect(() => {
    if (!userSlug || userSlug === 'anon') {
      setGoogleAccount(null)
      return
    }
    let cancelled = false
    fetch(`/api/auth/google/status?user=${encodeURIComponent(userSlug)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setGoogleAccount(data?.connected ? data.account : null)
      })
      .catch(() => {
        if (!cancelled) setGoogleAccount(null)
      })
    return () => {
      cancelled = true
    }
  }, [userSlug, googleStatus])

  const handleConnectGoogle = () => {
    if (!profile.name.trim()) {
      setErrors((prev) => ({ ...prev, name: 'enter your name first so we can link google to it.' }))
      return
    }
    // Persist profile so the user returns to a populated form after redirect.
    saveOnboardingProfile(profile)
    window.location.href = `/api/auth/google?user=${encodeURIComponent(userSlug)}`
  }

  const handleDisconnectGoogle = async () => {
    if (!userSlug) return
    setGoogleBusy(true)
    try {
      await fetch('/api/auth/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userSlug }),
      })
      setGoogleAccount(null)
      setGoogleStatus('google disconnected')
    } finally {
      setGoogleBusy(false)
    }
  }

  const isSaved = useMemo(() => savedAt !== null, [savedAt])

  const updateField = (field: keyof OnboardingProfile, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const handleBlurUrl = (field: 'linkedinUrl' | 'portfolioUrl') => {
    setProfile((prev) => ({
      ...prev,
      [field]: normalizeUrlInput(prev[field]),
    }))
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextErrors = validateProfile(profile)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    saveOnboardingProfile(profile)
    setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <div className="border border-border bg-background/40 p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">secondbrain / onboarding</p>
          <h1 className="mt-2 text-3xl lowercase tracking-tight text-foreground">set your profile context</h1>
          <p className="mt-2 max-w-xl text-sm lowercase text-muted-foreground">
            save your identity once so chats and memory flows can personalize around you.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs uppercase tracking-widest text-muted-foreground">
                your name
              </Label>
              <Input
                id="name"
                value={profile.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Dariel Gutierrez"
                className="h-11 rounded-none border-border bg-background/20"
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedin" className="text-xs uppercase tracking-widest text-muted-foreground">
                linkedin url
              </Label>
              <Input
                id="linkedin"
                type="url"
                value={profile.linkedinUrl}
                onChange={(event) => updateField('linkedinUrl', event.target.value)}
                onBlur={() => handleBlurUrl('linkedinUrl')}
                placeholder="linkedin.com/in/your-handle"
                className="h-11 rounded-none border-border bg-background/20"
              />
              {errors.linkedinUrl && <p className="text-xs text-destructive">{errors.linkedinUrl}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="portfolio" className="text-xs uppercase tracking-widest text-muted-foreground">
                portfolio url
              </Label>
              <Input
                id="portfolio"
                type="url"
                value={profile.portfolioUrl}
                onChange={(event) => updateField('portfolioUrl', event.target.value)}
                onBlur={() => handleBlurUrl('portfolioUrl')}
                placeholder="yourdomain.com"
                className="h-11 rounded-none border-border bg-background/20"
              />
              {errors.portfolioUrl && <p className="text-xs text-destructive">{errors.portfolioUrl}</p>}
            </div>

            <div className="space-y-3 border border-border bg-background/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    connect google
                  </p>
                  <p className="mt-1 text-sm lowercase text-foreground">
                    let secondbrain act on your behalf — draft emails, book meetings, spin up meet links.
                  </p>
                </div>
                <Link2 className="mt-1 h-4 w-4 text-muted-foreground" />
              </div>

              <ul className="space-y-1 text-xs lowercase text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5" /> gmail — send emails for you
                </li>
                <li className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" /> calendar — book and update events
                </li>
                <li className="flex items-center gap-2">
                  <Video className="h-3.5 w-3.5" /> meet — auto-generate meeting links
                </li>
              </ul>

              <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs lowercase text-muted-foreground">
                  {googleAccount ? (
                    <span className="inline-flex items-center gap-1 text-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      linked as {googleAccount.email || googleAccount.name}
                    </span>
                  ) : googleStatus ? (
                    <span className="inline-flex items-center gap-1">
                      {googleStatus.startsWith('google connected') ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      {googleStatus}
                    </span>
                  ) : (
                    'not connected'
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {googleAccount ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-none lowercase"
                      disabled={googleBusy}
                      onClick={handleDisconnectGoogle}
                    >
                      disconnect
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="rounded-none lowercase"
                      onClick={handleConnectGoogle}
                    >
                      connect google
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs lowercase text-muted-foreground">
                {isSaved ? (
                  <span className="inline-flex items-center gap-1 text-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    saved at {savedAt}
                  </span>
                ) : (
                  'saved to this browser'
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit" className="rounded-none lowercase">
                  save profile
                </Button>
                <Button asChild variant="outline" className="rounded-none lowercase">
                  <Link href="/dashboard/chat">
                    continue
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}
