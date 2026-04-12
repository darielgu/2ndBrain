'use client'

import { useState } from 'react'
import {
  Sparkles,
  ExternalLink,
  Loader2,
  Pencil,
  Mail,
  Briefcase,
  Building2,
  Linkedin,
  Instagram,
  Twitter,
  StickyNote,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Person } from '@/lib/types'

interface EnrichmentResult {
  bio: string
  currentRole: string | null
  company: string | null
  location: string | null
  links: { label: string; url: string }[]
  highlights: string[]
  confidence: 'high' | 'medium' | 'low'
  sources: { title: string; url: string }[]
  error?: string
}

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

export function PeopleGrid({ people: initialPeople }: { people: Person[] }) {
  const [people, setPeople] = useState<Person[]>(initialPeople)
  const [enrichments, setEnrichments] = useState<Record<string, EnrichmentResult>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState<string | null>(null)
  const [manualBusy, setManualBusy] = useState<string | null>(null)

  const handleEnrich = async (person: Person) => {
    setBusy(person.person_id)
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: person.name,
          whereMet: person.where_met,
          existingSummary: person.summary,
        }),
      })
      const data = (await res.json()) as EnrichmentResult
      setEnrichments((prev) => ({ ...prev, [person.person_id]: data }))
    } catch (err) {
      setEnrichments((prev) => ({
        ...prev,
        [person.person_id]: {
          bio: '',
          currentRole: null,
          company: null,
          location: null,
          links: [],
          highlights: [],
          confidence: 'low',
          sources: [],
          error: err instanceof Error ? err.message : 'enrich failed',
        },
      }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {people.map((person) => {
        const enrichment = enrichments[person.person_id]
        const isBusy = busy === person.person_id

        return (
          <article
            key={person.person_id}
            className="flex flex-col gap-2 border border-border bg-background/40 p-3"
          >
            <div>
              <p className="text-sm lowercase">{person.name}</p>
              <p className="text-[11px] lowercase text-muted-foreground">
                last seen {formatLastSeen(person.last_seen)}
              </p>
            </div>

            {person.where_met ? (
              <p className="text-xs lowercase text-muted-foreground">
                met at {person.where_met}
              </p>
            ) : null}
            {person.summary ? (
              <p className="text-xs lowercase text-muted-foreground">
                {person.summary}
              </p>
            ) : null}
            {person.open_loops.length > 0 ? (
              <p className="text-xs lowercase">
                open loop: {person.open_loops[0]}
                {person.open_loops.length > 1
                  ? ` (+${person.open_loops.length - 1} more)`
                  : ''}
              </p>
            ) : null}

            {(person.job_title || person.company || person.email ||
              person.linkedin_url || person.instagram || person.twitter ||
              person.manual_notes) && (
              <div className="space-y-0.5 border-t border-border pt-1 text-[11px] lowercase text-muted-foreground">
                {(person.job_title || person.company) && (
                  <p className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3" />
                    {[person.job_title, person.company].filter(Boolean).join(' at ')}
                  </p>
                )}
                {person.email && (
                  <p className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {person.email}
                  </p>
                )}
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {person.linkedin_url && (
                    <SocialPill href={person.linkedin_url} icon={Linkedin} label="linkedin" />
                  )}
                  {person.twitter && (
                    <SocialPill href={toTwitterUrl(person.twitter)} icon={Twitter} label="x" />
                  )}
                  {person.instagram && (
                    <SocialPill href={toInstagramUrl(person.instagram)} icon={Instagram} label="ig" />
                  )}
                </div>
                {person.manual_notes && (
                  <p className="pt-0.5 italic">{person.manual_notes}</p>
                )}
              </div>
            )}

            <div className="mt-1 flex flex-wrap gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-none lowercase"
                disabled={isBusy}
                onClick={() => handleEnrich(person)}
              >
                {isBusy ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    enriching…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    {enrichment ? 're-enrich' : 'auto-enrich'}
                  </>
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-none lowercase"
                onClick={() =>
                  setManualOpen((prev) =>
                    prev === person.person_id ? null : person.person_id,
                  )
                }
              >
                <Pencil className="mr-1 h-3.5 w-3.5" />
                {manualOpen === person.person_id ? 'cancel' : 'manual'}
              </Button>
            </div>

            {manualOpen === person.person_id && (
              <ManualForm
                person={person}
                busy={manualBusy === person.person_id}
                onSubmit={async (fields) => {
                  setManualBusy(person.person_id)
                  try {
                    const res = await fetch('/api/people/manual', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        person_id: person.person_id,
                        name: person.name,
                        ...fields,
                      }),
                    })
                    const data = (await res.json()) as { person?: Person; error?: string }
                    if (data.person) {
                      setPeople((prev) =>
                        prev.map((p) => (p.person_id === data.person!.person_id ? data.person! : p)),
                      )
                      setManualOpen(null)
                    }
                  } finally {
                    setManualBusy(null)
                  }
                }}
              />
            )}

            {enrichment && !enrichment.error && (
              <div className="mt-2 space-y-2 border-t border-border pt-2 text-[11px] lowercase">
                <div className="flex items-center justify-between">
                  <span className="tracking-widest text-muted-foreground">enriched</span>
                  <ConfidencePill confidence={enrichment.confidence} />
                </div>

                {enrichment.bio && (
                  <p className="text-foreground/90">{enrichment.bio}</p>
                )}

                {(enrichment.currentRole || enrichment.company || enrichment.location) && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-muted-foreground">
                    {enrichment.currentRole && (
                      <>
                        <dt>role:</dt>
                        <dd className="text-foreground/80">{enrichment.currentRole}</dd>
                      </>
                    )}
                    {enrichment.company && (
                      <>
                        <dt>company:</dt>
                        <dd className="text-foreground/80">{enrichment.company}</dd>
                      </>
                    )}
                    {enrichment.location && (
                      <>
                        <dt>location:</dt>
                        <dd className="text-foreground/80">{enrichment.location}</dd>
                      </>
                    )}
                  </dl>
                )}

                {enrichment.highlights.length > 0 && (
                  <ul className="space-y-0.5 text-muted-foreground">
                    {enrichment.highlights.map((h, i) => (
                      <li key={i} className="flex gap-1">
                        <span className="text-foreground/60">·</span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {enrichment.links.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {enrichment.links.map((l, i) => (
                      <a
                        key={i}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 border border-border bg-background/60 px-1.5 py-0.5 text-[10px] text-foreground/80 hover:border-foreground/40 hover:text-foreground"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        {l.label}
                      </a>
                    ))}
                  </div>
                )}

                {enrichment.sources.length > 0 && (
                  <details className="text-[10px] text-muted-foreground/80">
                    <summary className="cursor-pointer hover:text-foreground">
                      sources ({enrichment.sources.length})
                    </summary>
                    <ul className="mt-1 space-y-0.5">
                      {enrichment.sources.map((s, i) => (
                        <li key={i}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-foreground"
                          >
                            {s.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {enrichment?.error && (
              <p className="mt-2 border-t border-border pt-2 text-[11px] lowercase text-destructive">
                error: {enrichment.error}
              </p>
            )}
          </article>
        )
      })}
    </div>
  )
}

interface ManualFormFields {
  email: string
  jobTitle: string
  company: string
  linkedinUrl: string
  instagram: string
  twitter: string
  notes: string
}

function ManualForm({
  person,
  busy,
  onSubmit,
}: {
  person: Person
  busy: boolean
  onSubmit: (fields: ManualFormFields) => Promise<void>
}) {
  const [fields, setFields] = useState<ManualFormFields>({
    email: person.email || '',
    jobTitle: person.job_title || '',
    company: person.company || '',
    linkedinUrl: person.linkedin_url || '',
    instagram: person.instagram || '',
    twitter: person.twitter || '',
    notes: person.manual_notes || '',
  })

  const update = (key: keyof ManualFormFields, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }))

  return (
    <form
      className="mt-2 space-y-2 border-t border-border pt-2 text-[11px] lowercase"
      onSubmit={async (e) => {
        e.preventDefault()
        await onSubmit(fields)
      }}
    >
      <p className="tracking-widest text-muted-foreground">manual enrich</p>
      <FormRow label="job title" icon={Briefcase} value={fields.jobTitle}
        onChange={(v) => update('jobTitle', v)} placeholder="founder, engineer…" />
      <FormRow label="company" icon={Building2} value={fields.company}
        onChange={(v) => update('company', v)} placeholder="acme inc." />
      <FormRow label="email" icon={Mail} value={fields.email}
        onChange={(v) => update('email', v)} placeholder="name@domain.com" type="email" />
      <FormRow label="linkedin" icon={Linkedin} value={fields.linkedinUrl}
        onChange={(v) => update('linkedinUrl', v)} placeholder="linkedin.com/in/…" />
      <FormRow label="x / twitter" icon={Twitter} value={fields.twitter}
        onChange={(v) => update('twitter', v)} placeholder="@handle or url" />
      <FormRow label="instagram" icon={Instagram} value={fields.instagram}
        onChange={(v) => update('instagram', v)} placeholder="@handle or url" />
      <div className="space-y-1">
        <Label className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          <StickyNote className="h-3 w-3" />
          notes
        </Label>
        <textarea
          value={fields.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={2}
          placeholder="anything the auto-enrich can't know."
          className="w-full resize-none rounded-none border border-border bg-background/40 p-2 text-[11px] lowercase text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:border-foreground/40"
        />
      </div>
      <Button type="submit" size="sm" className="rounded-none lowercase" disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            saving…
          </>
        ) : (
          <>
            <Save className="mr-1 h-3.5 w-3.5" />
            save
          </>
        )}
      </Button>
    </form>
  )
}

function FormRow({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  icon: typeof Mail
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 rounded-none border-border bg-background/40 text-[11px] lowercase"
      />
    </div>
  )
}

function SocialPill({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: typeof Mail
  label: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 border border-border bg-background/60 px-1.5 py-0.5 text-[10px] text-foreground/80 hover:border-foreground/40 hover:text-foreground"
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </a>
  )
}

function toTwitterUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^@/, '')
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://x.com/${trimmed}`
}

function toInstagramUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^@/, '')
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://instagram.com/${trimmed}`
}

function ConfidencePill({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const color =
    confidence === 'high'
      ? 'text-green-400 border-green-400/40'
      : confidence === 'medium'
      ? 'text-yellow-300 border-yellow-300/40'
      : 'text-muted-foreground border-border'
  return (
    <span className={`border px-1.5 py-0.5 text-[10px] tracking-widest ${color}`}>
      {confidence}
    </span>
  )
}
