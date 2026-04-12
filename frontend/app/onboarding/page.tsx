'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  loadOnboardingProfile,
  normalizeUrlInput,
  saveOnboardingProfile,
  type OnboardingProfile,
  validateProfile,
} from '@/lib/onboarding-profile'

type ProfileErrors = Partial<Record<keyof OnboardingProfile, string>>

const INITIAL_PROFILE: OnboardingProfile = {
  name: '',
  linkedinUrl: '',
  portfolioUrl: '',
}

export default function OnboardingPage() {
  const [profile, setProfile] = useState<OnboardingProfile>(INITIAL_PROFILE)
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    const existing = loadOnboardingProfile()
    if (existing) {
      setProfile(existing)
    }
  }, [])

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
