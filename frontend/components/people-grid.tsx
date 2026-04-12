'use client'

import { useState } from 'react'
import { Sparkles, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

export function PeopleGrid({ people }: { people: Person[] }) {
  const [enrichments, setEnrichments] = useState<Record<string, EnrichmentResult>>({})
  const [busy, setBusy] = useState<string | null>(null)

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

            <div className="mt-1">
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
                    {enrichment ? 're-enrich' : 'enrich'}
                  </>
                )}
              </Button>
            </div>

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
