'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Calendar,
  Mail,
  CheckSquare,
  Zap,
  Loader2,
  CheckCircle2,
  X,
  ExternalLink,
  Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { loadOnboardingProfile, slugifyName } from '@/lib/onboarding-profile'
import type { ExtractionResult } from '@/lib/types'
import type { ActionProposal } from '@/lib/actions'

type ExecutionResult =
  | { status: 'booked'; htmlLink?: string; meetUrl?: string | null }
  | { status: 'draft_saved' }
  | { status: 'task_created' }
  | { status: 'error'; error: string }

export function ActionProposals({
  extraction,
}: {
  extraction: ExtractionResult
}) {
  const [user, setUser] = useState<string | null>(null)
  const [googleConnected, setGoogleConnected] = useState(false)
  const [proposals, setProposals] = useState<ActionProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, ExecutionResult>>({})
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({})

  const timeZone = useMemo(
    () =>
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : 'UTC',
    [],
  )

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
      .then((d) => setGoogleConnected(!!d?.connected))
      .catch(() => setGoogleConnected(false))

    fetch('/api/actions/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extraction,
        referenceIso: new Date().toISOString(),
        timeZone,
      }),
    })
      .then((r) => r.json())
      .then((d: { proposals?: ActionProposal[] }) => {
        setProposals(d.proposals || [])
      })
      .catch(() => setProposals([]))
      .finally(() => setLoading(false))
  }, [extraction, timeZone])

  const visible = proposals.filter(
    (p) => p.kind !== 'unknown' && !dismissed[p.id],
  )

  if (loading) {
    return (
      <Card className="rounded-none border-border bg-background/40 shadow-none">
        <CardHeader className="gap-1 px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm lowercase">
            <Zap className="h-4 w-4 text-accent" />
            detecting action items…
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 text-xs lowercase text-muted-foreground">
          <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
          classifying promises + next actions
        </CardContent>
      </Card>
    )
  }

  if (visible.length === 0) {
    return null
  }

  const execute = async (p: ActionProposal, overrides?: Partial<ActionProposal>) => {
    if (!user) return
    setBusy(p.id)
    try {
      const proposal = overrides ? { ...p, ...overrides } : p
      const res = await fetch('/api/actions/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, proposal }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResults((prev) => ({
          ...prev,
          [p.id]: { status: 'error', error: data.error || 'failed' },
        }))
        return
      }
      if (proposal.kind === 'calendar') {
        setResults((prev) => ({
          ...prev,
          [p.id]: {
            status: 'booked',
            htmlLink: data.htmlLink,
            meetUrl: data.meetUrl,
          },
        }))
      } else if (proposal.kind === 'email_draft') {
        setResults((prev) => ({ ...prev, [p.id]: { status: 'draft_saved' } }))
      } else if (proposal.kind === 'task') {
        setResults((prev) => ({ ...prev, [p.id]: { status: 'task_created' } }))
      }
      setEditing(null)
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [p.id]: {
          status: 'error',
          error: err instanceof Error ? err.message : 'failed',
        },
      }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="rounded-none border-border bg-background/40 shadow-none">
      <CardHeader className="gap-1 px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm lowercase">
          <Zap className="h-4 w-4 text-accent" />
          action items ({visible.length})
        </CardTitle>
        {!googleConnected && (
          <p className="text-[11px] lowercase text-muted-foreground">
            google not connected — booking + drafts are disabled.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4">
        {visible.map((p) => {
          const result = results[p.id]
          const isBusy = busy === p.id
          const isEditing = editing === p.id

          return (
            <article
              key={p.id}
              className={`border p-3 text-xs lowercase ${
                result?.status === 'booked' ||
                result?.status === 'draft_saved' ||
                result?.status === 'task_created'
                  ? 'border-green-400/40 bg-background/60'
                  : result?.status === 'error'
                  ? 'border-destructive/40 bg-background/40'
                  : 'border-border bg-background/40'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <KindIcon kind={p.kind} />
                  <p className="text-sm text-foreground/90">{summaryOf(p)}</p>
                </div>
                {!result && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setDismissed((prev) => ({ ...prev, [p.id]: true }))
                    }
                    aria-label="skip"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <p className="mt-1 text-[11px] text-muted-foreground">
                "{p.originalText}"
              </p>

              {/* View state or edit state */}
              {!isEditing && !result && <PreviewBody proposal={p} />}

              {isEditing && !result && (
                <EditBody
                  proposal={p}
                  onCancel={() => setEditing(null)}
                  onSubmit={(updated) => execute(p, updated)}
                  busy={isBusy}
                />
              )}

              {result && <ResultBody proposal={p} result={result} />}

              {/* Action buttons */}
              {!result && !isEditing && (
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-none lowercase"
                    disabled={isBusy || !googleConnected}
                    onClick={() => execute(p)}
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        executing…
                      </>
                    ) : (
                      <>
                        <Zap className="mr-1 h-3.5 w-3.5" />
                        {actionLabel(p)}
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-none lowercase"
                    onClick={() => setEditing(p.id)}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    edit
                  </Button>
                </div>
              )}
            </article>
          )
        })}
      </CardContent>
    </Card>
  )
}

function KindIcon({ kind }: { kind: ActionProposal['kind'] }) {
  const cls = 'h-3.5 w-3.5 text-accent'
  if (kind === 'calendar') return <Calendar className={cls} />
  if (kind === 'email_draft') return <Mail className={cls} />
  if (kind === 'task') return <CheckSquare className={cls} />
  return <Zap className={cls} />
}

function actionLabel(p: ActionProposal): string {
  if (p.kind === 'calendar') return 'book'
  if (p.kind === 'email_draft') return 'save draft'
  if (p.kind === 'task') return 'add task'
  return 'run'
}

function summaryOf(p: ActionProposal): string {
  if (p.kind === 'calendar') return p.summary
  if (p.kind === 'email_draft') return `draft → ${p.to || '(no recipient)'}`
  if (p.kind === 'task') return p.title
  return 'unknown action'
}

function PreviewBody({ proposal }: { proposal: ActionProposal }) {
  if (proposal.kind === 'calendar') {
    return (
      <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
        <p>when: {fmtRange(proposal.startIso, proposal.endIso)}</p>
        {proposal.attendeeEmails.length > 0 ? (
          <p>attendees: {proposal.attendeeEmails.join(', ')}</p>
        ) : (
          <p className="text-yellow-300/80">attendees: none (add before booking)</p>
        )}
        {proposal.withMeet && <p>includes: google meet link</p>}
      </div>
    )
  }
  if (proposal.kind === 'email_draft') {
    return (
      <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
        <p>subject: {proposal.subject}</p>
        <p className="whitespace-pre-wrap text-foreground/70">
          {proposal.body.slice(0, 200)}
          {proposal.body.length > 200 ? '…' : ''}
        </p>
      </div>
    )
  }
  if (proposal.kind === 'task') {
    return (
      <div className="mt-1 text-[11px] text-muted-foreground">
        {proposal.dueIso && <p>due: {fmtDate(proposal.dueIso)}</p>}
      </div>
    )
  }
  return null
}

function ResultBody({
  proposal,
  result,
}: {
  proposal: ActionProposal
  result: ExecutionResult
}) {
  if (result.status === 'error') {
    return (
      <p className="mt-2 text-[11px] text-destructive">error: {result.error}</p>
    )
  }
  if (result.status === 'booked') {
    return (
      <div className="mt-2 space-y-1 text-[11px]">
        <p className="flex items-center gap-1 text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          event booked
        </p>
        <div className="flex flex-wrap gap-1">
          {result.htmlLink && (
            <a
              href={result.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 border border-border bg-background/60 px-1.5 py-0.5 text-[10px] hover:border-foreground/40"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              open in calendar
            </a>
          )}
          {result.meetUrl && (
            <a
              href={result.meetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 border border-border bg-background/60 px-1.5 py-0.5 text-[10px] hover:border-foreground/40"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              meet link
            </a>
          )}
        </div>
      </div>
    )
  }
  if (result.status === 'draft_saved') {
    return (
      <p className="mt-2 flex items-center gap-1 text-[11px] text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        draft saved in gmail — review + send when ready
      </p>
    )
  }
  if (result.status === 'task_created') {
    return (
      <p className="mt-2 flex items-center gap-1 text-[11px] text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        added to google tasks · {proposal.kind === 'task' ? proposal.title : ''}
      </p>
    )
  }
  return null
}

function EditBody({
  proposal,
  onCancel,
  onSubmit,
  busy,
}: {
  proposal: ActionProposal
  onCancel: () => void
  onSubmit: (updated: Partial<ActionProposal>) => void
  busy: boolean
}) {
  const [draft, setDraft] = useState<Partial<ActionProposal>>(proposal)

  const set = (patch: Partial<ActionProposal>) =>
    setDraft((prev) => ({ ...prev, ...patch }) as Partial<ActionProposal>)

  return (
    <form
      className="mt-2 space-y-2 border-t border-border pt-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(draft)
      }}
    >
      {proposal.kind === 'calendar' && (
        <>
          <Field label="summary">
            <Input
              value={(draft as { summary?: string }).summary || ''}
              onChange={(e) => set({ summary: e.target.value } as Partial<ActionProposal>)}
              className="h-8 rounded-none border-border bg-background/40 text-[11px] lowercase"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="start (iso)">
              <Input
                value={(draft as { startIso?: string }).startIso || ''}
                onChange={(e) => set({ startIso: e.target.value } as Partial<ActionProposal>)}
                placeholder="2026-05-05T16:00"
                className="h-8 rounded-none border-border bg-background/40 text-[11px] lowercase"
              />
            </Field>
            <Field label="end (iso)">
              <Input
                value={(draft as { endIso?: string }).endIso || ''}
                onChange={(e) => set({ endIso: e.target.value } as Partial<ActionProposal>)}
                placeholder="2026-05-05T16:30"
                className="h-8 rounded-none border-border bg-background/40 text-[11px] lowercase"
              />
            </Field>
          </div>
          <Field label="attendees (comma-separated emails)">
            <Input
              value={((draft as { attendeeEmails?: string[] }).attendeeEmails || []).join(', ')}
              onChange={(e) =>
                set({
                  attendeeEmails: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter((s) => s.includes('@')),
                } as Partial<ActionProposal>)
              }
              className="h-8 rounded-none border-border bg-background/40 text-[11px] lowercase"
            />
          </Field>
        </>
      )}

      {proposal.kind === 'email_draft' && (
        <>
          <Field label="to">
            <Input
              value={(draft as { to?: string }).to || ''}
              onChange={(e) => set({ to: e.target.value } as Partial<ActionProposal>)}
              className="h-8 rounded-none border-border bg-background/40 text-[11px] lowercase"
            />
          </Field>
          <Field label="subject">
            <Input
              value={(draft as { subject?: string }).subject || ''}
              onChange={(e) => set({ subject: e.target.value } as Partial<ActionProposal>)}
              className="h-8 rounded-none border-border bg-background/40 text-[11px] lowercase"
            />
          </Field>
          <Field label="body">
            <textarea
              value={(draft as { body?: string }).body || ''}
              onChange={(e) => set({ body: e.target.value } as Partial<ActionProposal>)}
              rows={4}
              className="w-full resize-none rounded-none border border-border bg-background/40 p-2 text-[11px] lowercase"
            />
          </Field>
        </>
      )}

      {proposal.kind === 'task' && (
        <>
          <Field label="title">
            <Input
              value={(draft as { title?: string }).title || ''}
              onChange={(e) => set({ title: e.target.value } as Partial<ActionProposal>)}
              className="h-8 rounded-none border-border bg-background/40 text-[11px] lowercase"
            />
          </Field>
          <Field label="notes">
            <textarea
              value={(draft as { notes?: string }).notes || ''}
              onChange={(e) => set({ notes: e.target.value } as Partial<ActionProposal>)}
              rows={2}
              className="w-full resize-none rounded-none border border-border bg-background/40 p-2 text-[11px] lowercase"
            />
          </Field>
          <Field label="due (iso, optional)">
            <Input
              value={(draft as { dueIso?: string | null }).dueIso || ''}
              onChange={(e) =>
                set({ dueIso: e.target.value || null } as Partial<ActionProposal>)
              }
              placeholder="2026-05-05T00:00Z"
              className="h-8 rounded-none border-border bg-background/40 text-[11px] lowercase"
            />
          </Field>
        </>
      )}

      <div className="flex gap-1">
        <Button type="submit" size="sm" className="rounded-none lowercase" disabled={busy}>
          {busy ? 'executing…' : 'confirm'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-none lowercase"
          onClick={onCancel}
        >
          cancel
        </Button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

function fmtRange(startIso: string, endIso: string): string {
  if (!startIso) return 'time tbd'
  try {
    const start = new Date(startIso)
    const end = endIso ? new Date(endIso) : null
    const d = start.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    const e = end
      ? end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : ''
    return e ? `${d} – ${e}` : d
  } catch {
    return startIso
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}
