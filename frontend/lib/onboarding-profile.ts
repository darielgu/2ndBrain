export interface OnboardingProfile {
  name: string
  linkedinUrl: string
  portfolioUrl: string
}

const STORAGE_KEY = 'secondbrain:onboarding-profile'

const isHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export const normalizeUrlInput = (raw: string) => {
  const trimmed = raw.trim()
  if (!trimmed) {
    return ''
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  return `https://${trimmed}`
}

export const validateProfile = (profile: OnboardingProfile) => {
  const errors: Partial<Record<keyof OnboardingProfile, string>> = {}

  if (!profile.name.trim()) {
    errors.name = 'Name is required.'
  }

  if (!profile.linkedinUrl.trim()) {
    errors.linkedinUrl = 'LinkedIn URL is required.'
  } else if (!isHttpUrl(normalizeUrlInput(profile.linkedinUrl))) {
    errors.linkedinUrl = 'Enter a valid LinkedIn URL.'
  }

  if (!profile.portfolioUrl.trim()) {
    errors.portfolioUrl = 'Portfolio URL is required.'
  } else if (!isHttpUrl(normalizeUrlInput(profile.portfolioUrl))) {
    errors.portfolioUrl = 'Enter a valid portfolio URL.'
  }

  return errors
}

export const loadOnboardingProfile = (): OnboardingProfile | null => {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingProfile>
    return {
      name: parsed.name ?? '',
      linkedinUrl: parsed.linkedinUrl ?? '',
      portfolioUrl: parsed.portfolioUrl ?? '',
    }
  } catch {
    return null
  }
}

export const saveOnboardingProfile = (profile: OnboardingProfile) => {
  if (typeof window === 'undefined') {
    return
  }

  const cleaned: OnboardingProfile = {
    name: profile.name.trim(),
    linkedinUrl: normalizeUrlInput(profile.linkedinUrl),
    portfolioUrl: normalizeUrlInput(profile.portfolioUrl),
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
}
