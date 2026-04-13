'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  UserRound,
  UserPlus,
  Calendar,
  Mail,
  CheckSquare,
  Loader2,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
  Send,
  FileText,
  Video,
  ListChecks,
  Zap,
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
import type { PersonProfileSync } from '@/lib/profile-sync'

type ItemStatus = 'idle' | 'executing' | 'done' | 'error'

interface CalendarItem {
  id: string
  include: boolean
  status: ItemStatus
  error?: string
  proposal: Extract<ActionProposal, { kind: 'calendar' }>
  result?: { htmlLink?: string; meetUrl?: string | null }
}

interface EmailItem {
  id: string
  include: boolean
  mode: 'draft' | 'send'
  status: ItemStatus
  error?: string
  proposal: Extract<ActionProposal, { kind: 'email_draft' }>
}

interface TaskItem {
  id: string
  include: boolean
  status: ItemStatus
  error?: string
  proposal: Extract<ActionProposal, { kind: 'task' }>
}

export function PostCallConfirmation({
  extraction,
}: {
  extraction: ExtractionResult
}) {
  const [user, setUser] = useState<string | null>(null)
  const [googleConnected, setGoogleConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<PersonProfileSync[]>([])
  const [calendar, setCalendar] = useState<CalendarItem[]>([])
  const [emails, setEmails] = useState<EmailItem[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [executing, setExecuting] = useState(false)

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

    // Wait 1.5s before fetching profile-sync so the recorder's own person
    // save lands first and we see post-save state.
    const profileTimer = setTimeout(() => {
      if (extraction.people.length === 0) return
      fetch('/api/profile-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: slug,
          extractedNames: extraction.people.map((p) => p.name),
        }),
      })
        .then((r) => r.json())
        .then((d: { profiles?: PersonProfileSync[] }) =>
          setProfiles(d.profiles || []),
        )
        .catch(() => {})
    }, 1500)

    // Classify action items in parallel (doesn't depend on save pass).
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
        const props = d.proposals || []
        setCalendar(
          props
            .filter((p): p is Extract<ActionProposal, { kind: 'calendar' }> => p.kind === 'calendar')
            .map((p) => ({
              id: p.id,
              include: true,
              status: 'idle',
              proposal: p,
            })),
        )
        setEmails(
          props
            .filter((p): p is Extract<ActionProposal, { kind: 'email_draft' }> => p.kind === 'email_draft')
            .map((p) => ({
              id: p.id,
              include: true,
              mode: 'draft',
              status: 'idle',
              proposal: p,
            })),
        )
        setTasks(
          props
            .filter((p): p is Extract<ActionProposal, { kind: 'task' }> => p.kind === 'task')
            .map((p) => ({
              id: p.id,
              include: true,
              status: 'idle',
              proposal: p,
            })),
        )
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'classify failed'),
      )
      .finally(() => setLoading(false))

    return () => clearTimeout(profileTimer)
  }, [extraction, timeZone])

  const hasAnyItems =
    extraction.people.length > 0 ||
    calendar.length > 0 ||
    emails.length > 0 ||
    tasks.length > 0 ||
    extraction.topics.length > 0 ||
    extraction.promises.length > 0

  if (!hasAnyItems && !loading) return null

  // --- action-item mutators -----------------------------------------------
  const updateCalendar = (id: string, patch: Partial<CalendarItem>) =>
    setCalendar((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  const updateCalendarProposal = (
    id: string,
    patch: Partial<CalendarItem['proposal']>,
  ) =>
    setCalendar((prev) =>
      prev.map((i) => (i.id === id ? { ...i, proposal: { ...i.proposal, ...patch } } : i)),
    )

  const updateEmail = (id: string, patch: Partial<EmailItem>) =>
    setEmails((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  const updateEmailProposal = (
    id: string,
    patch: Partial<EmailItem['proposal']>,
  ) =>
    setEmails((prev) =>
      prev.map((i) => (i.id === id ? { ...i, proposal: { ...i.proposal, ...patch } } : i)),
    )

  const updateTask = (id: string, patch: Partial<TaskItem>) =>
    setTasks((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  const updateTaskProposal = (id: string, patch: Partial<TaskItem['proposal']>) =>
    setTasks((prev) =>
      prev.map((i) => (i.id === id ? { ...i, proposal: { ...i.proposal, ...patch } } : i)),
    )

  // --- execute all selected items in parallel -----------------------------
  const executeAll = async () => {
    if (!user || !googleConnected) return
    setExecuting(true)

    const pendingCal = calendar.filter((i) => i.include && i.status !== 'done')
    const pendingEm = emails.filter((i) => i.include && i.status !== 'done')
    const pendingTk = tasks.filter((i) => i.include && i.status !== 'done')

    const all: Array<Promise<void>> = []

    for (const item of pendingCal) {
      updateCalendar(item.id, { status: 'executing', error: undefined })
      all.push(
        (async () => {
          try {
            const res = await fetch('/api/actions/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user, proposal: item.proposal }),
            })
            const data = await res.json()
            if (!res.ok) {
              updateCalendar(item.id, { status: 'error', error: data.error || 'failed' })
              return
            }
            updateCalendar(item.id, {
              status: 'done',
              result: { htmlLink: data.htmlLink, meetUrl: data.meetUrl },
            })
          } catch (err) {
            updateCalendar(item.id, {
              status: 'error',
              error: err instanceof Error ? err.message : 'failed',
            })
          }
        })(),
      )
    }

    for (const item of pendingEm) {
      updateEmail(item.id, { status: 'executing', error: undefined })
      const route =
        item.mode === 'send' ? '/api/google/send' : '/api/actions/execute'
      const payload =
        item.mode === 'send'
          ? {
              user,
              to: item.proposal.to,
              subject: item.proposal.subject,
              body: item.proposal.body,
            }
          : { user, proposal: item.proposal }
      all.push(
        (async () => {
          try {
            const res = await fetch(route, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
            const data = await res.json()
            if (!res.ok) {
              updateEmail(item.id, { status: 'error', error: data.error || 'failed' })
              return
            }
            updateEmail(item.id, { status: 'done' })
          } catch (err) {
            updateEmail(item.id, {
              status: 'error',
              error: err instanceof Error ? err.message : 'failed',
            })
          }
        })(),
      )
    }

    for (const item of pendingTk) {
      updateTask(item.id, { status: 'executing', error: undefined })
      all.push(
        (async () => {
          try {
            const res = await fetch('/api/actions/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user, proposal: item.proposal }),
            })
            const data = await res.json()
            if (!res.ok) {
              updateTask(item.id, { status: 'error', error: data.error || 'failed' })
              return
            }
            updateTask(item.id, { status: 'done' })
          } catch (err) {
            updateTask(item.id, {
              status: 'error',
              error: err instanceof Error ? err.message : 'failed',
            })
          }
        })(),
      )
    }

    await Promise.all(all)
    setExecuting(false)
  }

  const pendingCount =
    calendar.filter((i) => i.include && i.status !== 'done').length +
    emails.filter((i) => i.include && i.status !== 'done').length +
    tasks.filter((i) => i.include && i.status !== 'done').length

  const sendEmailCount = emails.filter(
    (i) => i.include && i.mode === 'send' && i.status !== 'done',
  ).length

  return (
    <Card className="rounded-none border-border bg-background/40 shadow-none">
      <CardHeader className="gap-1 px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm lowercase">
          <Zap className="h-4 w-4 text-accent" />
          review & confirm
        </CardTitle>
        <p className="text-[11px] lowercase text-muted-foreground">
          {loading
            ? 'analyzing transcript…'
            : 'nothing fires until you click execute. edit anything first.'}
          {!googleConnected && !loading && (
            <span className="ml-1 text-yellow-300">
              google not connected — actions disabled.
            </span>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        {loading && (
          <p className="text-[11px] lowercase text-muted-foreground">
            <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
            classifying promises + pulling calendar…
          </p>
        )}

        {!loading && (
          <>
            <Section
              icon={ListChecks}
              title="memory extracted"
              hint="auto-saved to your memory index"
            >
              <MemorySection extraction={extraction} />
            </Section>

            {profiles.length > 0 && (
              <Section
                icon={UserRound}
                title={`profiles (${profiles.length})`}
                hint="auto-synced with upcoming calendar"
              >
                <div className="space-y-2">
                  {profiles.map((p) => (
                    <ProfileRow key={p.person_id} profile={p} />
                  ))}
                </div>
              </Section>
            )}

            {calendar.length > 0 && (
              <Section
                icon={Calendar}
                title={`calendar events (${calendar.length})`}
              >
                <div className="space-y-2">
                  {calendar.map((item) => (
                    <CalendarRow
                      key={item.id}
                      item={item}
                      onToggle={(include) =>
                        updateCalendar(item.id, { include })
                      }
                      onEdit={(patch) => updateCalendarProposal(item.id, patch)}
                    />
                  ))}
                </div>
              </Section>
            )}

            {emails.length > 0 && (
              <Section
                icon={Mail}
                title={`emails (${emails.length})`}
                hint="draft by default — flip to send if you're sure"
              >
                <div className="space-y-2">
                  {emails.map((item) => (
                    <EmailRow
                      key={item.id}
                      item={item}
                      onToggle={(include) => updateEmail(item.id, { include })}
                      onModeChange={(mode) => updateEmail(item.id, { mode })}
                      onEdit={(patch) => updateEmailProposal(item.id, patch)}
                    />
                  ))}
                </div>
              </Section>
            )}

            {tasks.length > 0 && (
              <Section icon={CheckSquare} title={`tasks (${tasks.length})`}>
                <div className="space-y-2">
                  {tasks.map((item) => (
                    <TaskRow
                      key={item.id}
                      item={item}
                      onToggle={(include) => updateTask(item.id, { include })}
                      onEdit={(patch) => updateTaskProposal(item.id, patch)}
                    />
                  ))}
                </div>
              </Section>
            )}

            {error && (
              <p className="text-[11px] lowercase text-destructive">
                error: {error}
              </p>
            )}

            {pendingCount > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] lowercase text-muted-foreground">
                  {pendingCount} pending action{pendingCount !== 1 ? 's' : ''}
                  {sendEmailCount > 0 && (
                    <span className="ml-1 text-yellow-300">
                      · {sendEmailCount} will SEND immediately
                    </span>
                  )}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-none lowercase"
                  disabled={executing || !googleConnected}
                  onClick={executeAll}
                >
                  {executing ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      executing…
                    </>
                  ) : (
                    <>
                      <Zap className="mr-1 h-3.5 w-3.5" />
                      execute selected ({pendingCount})
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// --- Small presentational pieces ------------------------------------------

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Mail
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 border-b border-border pb-1">
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
          <Icon className="h-3 w-3" />
          {title}
        </p>
        {hint && (
          <p className="text-[10px] lowercase text-muted-foreground/70">{hint}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function MemorySection({ extraction }: { extraction: ExtractionResult }) {
  return (
    <div className="space-y-2 text-xs lowercase">
      {extraction.people.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            people
          </p>
          <p className="text-foreground/90">
            {extraction.people.map((p) => p.name).join(', ')}
          </p>
        </div>
      )}
      {extraction.topics.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            topics
          </p>
          <p className="text-foreground/90">{extraction.topics.join(', ')}</p>
        </div>
      )}
      {extraction.promises.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            promises
          </p>
          <ul className="space-y-0.5 text-foreground/90">
            {extraction.promises.map((p, i) => (
              <li key={i} className="border-l-2 border-accent/40 pl-2">
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ProfileRow({ profile }: { profile: PersonProfileSync }) {
  return (
    <article
      className={`border p-2 text-xs lowercase ${
        profile.was_new
          ? 'border-green-400/40 bg-background/60'
          : 'border-border bg-background/40'
      }`}
    >
      <div className="flex items-center gap-2">
        {profile.was_new ? (
          <UserPlus className="h-3.5 w-3.5 text-green-400" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
        )}
        <p className="text-sm text-foreground">{profile.name}</p>
        <span className="text-[10px] tracking-widest text-muted-foreground">
          {profile.was_new ? 'new' : 'existing'}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{profile.note}</p>
      {profile.email && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Mail className="h-3 w-3" />
          {profile.email}
        </p>
      )}
      {profile.upcoming_events.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[11px]">
          {profile.upcoming_events.slice(0, 3).map((ev) => (
            <li
              key={ev.id}
              className="flex items-center justify-between gap-2 text-muted-foreground"
            >
              <span className="flex items-center gap-1 truncate">
                {ev.meetUrl && <Video className="h-3 w-3 text-accent" />}
                <span className="truncate text-foreground/80">{ev.summary}</span>
              </span>
              <span className="whitespace-nowrap text-[10px]">
                {fmtWhen(ev.startIso)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

function CalendarRow({
  item,
  onToggle,
  onEdit,
}: {
  item: CalendarItem
  onToggle: (include: boolean) => void
  onEdit: (patch: Partial<CalendarItem['proposal']>) => void
}) {
  const [editing, setEditing] = useState(false)

  return (
    <ItemFrame status={item.status} dimmed={!item.include}>
      <RowHeader
        include={item.include}
        onToggle={onToggle}
        icon={Calendar}
        title={item.proposal.summary}
        originalText={item.proposal.originalText}
        onEdit={() => setEditing((e) => !e)}
        editing={editing}
        disabledEdit={item.status === 'done' || item.status === 'executing'}
      />

      {item.status !== 'done' && !editing && (
        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
          {item.proposal.startIso ? (
            <p>when: {fmtRange(item.proposal.startIso, item.proposal.endIso)}</p>
          ) : (
            <p className="text-yellow-300/80">when: (no time — edit to set a day/time before booking)</p>
          )}
          {item.proposal.attendeeEmails.length > 0 ? (
            <p>to: {item.proposal.attendeeEmails.join(', ')}</p>
          ) : (
            <p className="text-yellow-300/80">to: (no attendees — edit to add)</p>
          )}
          {item.proposal.withMeet && <p>+ google meet link</p>}
        </div>
      )}

      {editing && item.status !== 'done' && (
        <div className="mt-2 space-y-2 border-t border-border pt-2">
          <Field label="summary">
            <Input
              value={item.proposal.summary}
              onChange={(e) => onEdit({ summary: e.target.value })}
              className="h-8 rounded-none border-border bg-background/40 text-[11px] lowercase"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="start (iso)">
              <Input
                value={item.proposal.startIso}
                onChange={(e) => onEdit({ startIso: e.target.value })}
                className="h-8 rounded-none border-border bg-background/40 text-[11px] lowercase"
              />
            </Field>
            <Field label="end (iso)">
              <Input
                value={item.proposal.endIso}
                onChange={(e) => onEdit({ endIso: e.target.value })}
                className="h-8 rounded-none border-border bg-background/40 text-[11px] lowercase"
              />
            </Field>
          </div>
          <Field label="attendees (comma-separated)">
            <Input
              value={item.proposal.attendeeEmails.join(', ')}
              onChange={(e) =>
                onEdit({
                  attendeeEmails: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter((s) => s.includes('@')),
                })
              }
              className="h-8 rounded-none border-border bg-background/40 text-[11px] lowercase"
            />
          </Field>
        </div>
      )}

      <StatusTrailer item={item} doneText="booked" />
      {item.status === 'done' && item.result && (
        <div className="mt-1 flex flex-wrap gap-1">
          {item.result.htmlLink && (
            <a
              href={item.result.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 border border-border bg-background/60 px-1.5 py-0.5 text-[10px] hover:border-foreground/40"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              calendar
            </a>
          )}
          {item.result.meetUrl && (
            <a
              href={item.result.meetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 border border-border bg-background/60 px-1.5 py-0.5 text-[10px] hover:border-foreground/40"
            >
              <Video className="h-2.5 w-2.5" />
              meet
            </a>
          )}
        </div>
      )}
    </ItemFrame>
  )
}

function EmailRow({
  item,
  onToggle,
  onModeChange,
  onEdit,
}: {
  item: EmailItem
  onToggle: (include: boolean) => void
  onModeChange: (mode: 'draft' | 'send') => void
  onEdit: (patch: Partial<EmailItem['proposal']>) => void
}) {
  const [editing, setEditing] = useState(false)

  return (
    <ItemFrame status={item.status} dimmed={!item.include}>
      <RowHeader
        include={item.include}
        onToggle={onToggle}
        icon={Mail}
        title={`to ${item.proposal.to || '(add recipient)'}`}
        originalText={item.proposal.originalText}
        onEdit={() => setEditing((e) => !e)}
        editing={editing}
        disabledEdit={item.status === 'done' || item.status === 'executing'}
      />

      {item.status !== 'done' && !editing && (
        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
          <p>subject: {item.proposal.subject}</p>
          <p className="whitespace-pre-wrap text-foreground/70">
            {item.proposal.body.slice(0, 160)}
            {item.proposal.body.length > 160 ? '…' : ''}
          </p>
        </div>
      )}

      {editing && item.status !== 'done' && (
        <div className="mt-2 space-y-2 border-t border-border pt-2">
          <Field label="to">
            <Input
              value={item.proposal.to}
              onChange={(e) => onEdit({ to: e.target.value })}
              className="h-8 rounded-none border-border bg-background/40 text-[11px] lowercase"
            />
          </Field>
          <Field label="subject">
            <Input
              value={item.proposal.subject}
              onChange={(e) => onEdit({ subject: e.target.value })}
              className="h-8 rounded-none border-border bg-background/40 text-[11px] lowercase"
            />
          </Field>
          <Field label="body">
            <textarea
              value={item.proposal.body}
              onChange={(e) => onEdit({ body: e.target.value })}
              rows={4}
              className="w-full resize-none rounded-none border border-border bg-background/40 p-2 text-[11px] lowercase"
            />
          </Field>
        </div>
      )}

      {item.status !== 'done' && item.include && (
        <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            mode:
          </p>
          <button
            type="button"
            className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] lowercase transition-colors ${
              item.mode === 'draft'
                ? 'border-foreground/60 bg-background text-foreground'
                : 'border-border bg-background/30 text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => onModeChange('draft')}
          >
            <FileText className="h-2.5 w-2.5" /> save draft
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] lowercase transition-colors ${
              item.mode === 'send'
                ? 'border-destructive/60 bg-background text-destructive'
                : 'border-border bg-background/30 text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => onModeChange('send')}
          >
            <Send className="h-2.5 w-2.5" /> send now
          </button>
        </div>
      )}

      <StatusTrailer
        item={item}
        doneText={item.mode === 'send' ? 'sent' : 'draft saved'}
      />
    </ItemFrame>
  )
}

function TaskRow({
  item,
  onToggle,
  onEdit,
}: {
  item: TaskItem
  onToggle: (include: boolean) => void
  onEdit: (patch: Partial<TaskItem['proposal']>) => void
}) {
  const [editing, setEditing] = useState(false)

  return (
    <ItemFrame status={item.status} dimmed={!item.include}>
      <RowHeader
        include={item.include}
        onToggle={onToggle}
        icon={CheckSquare}
        title={item.proposal.title}
        originalText={item.proposal.originalText}
        onEdit={() => setEditing((e) => !e)}
        editing={editing}
        disabledEdit={item.status === 'done' || item.status === 'executing'}
      />

      {editing && item.status !== 'done' && (
        <div className="mt-2 space-y-2 border-t border-border pt-2">
          <Field label="title">
            <Input
              value={item.proposal.title}
              onChange={(e) => onEdit({ title: e.target.value })}
              className="h-8 rounded-none border-border bg-background/40 text-[11px] lowercase"
            />
          </Field>
          <Field label="notes">
            <textarea
              value={item.proposal.notes}
              onChange={(e) => onEdit({ notes: e.target.value })}
              rows={2}
              className="w-full resize-none rounded-none border border-border bg-background/40 p-2 text-[11px] lowercase"
            />
          </Field>
        </div>
      )}

      <StatusTrailer item={item} doneText="added" />
    </ItemFrame>
  )
}

function ItemFrame({
  status,
  dimmed,
  children,
}: {
  status: ItemStatus
  dimmed: boolean
  children: React.ReactNode
}) {
  const cls =
    status === 'done'
      ? 'border-green-400/40 bg-background/60'
      : status === 'error'
      ? 'border-destructive/40 bg-background/40'
      : 'border-border bg-background/40'
  return (
    <article
      className={`border p-3 text-xs lowercase ${cls} ${
        dimmed && status !== 'done' ? 'opacity-40' : ''
      }`}
    >
      {children}
    </article>
  )
}

function RowHeader({
  include,
  onToggle,
  icon: Icon,
  title,
  originalText,
  onEdit,
  editing,
  disabledEdit,
}: {
  include: boolean
  onToggle: (v: boolean) => void
  icon: typeof Mail
  title: string
  originalText: string
  onEdit: () => void
  editing: boolean
  disabledEdit: boolean
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={include}
            onChange={(e) => onToggle(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded-none border-border bg-background/40"
          />
          <Icon className="mt-0.5 h-3.5 w-3.5 text-accent" />
          <p className="text-sm text-foreground">{title}</p>
        </div>
        {!disabledEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-muted-foreground hover:text-foreground"
            aria-label={editing ? 'close edit' : 'edit'}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">"{originalText}"</p>
    </>
  )
}

function StatusTrailer({
  item,
  doneText,
}: {
  item: { status: ItemStatus; error?: string }
  doneText: string
}) {
  if (item.status === 'executing') {
    return (
      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        executing…
      </p>
    )
  }
  if (item.status === 'done') {
    return (
      <p className="mt-2 flex items-center gap-1 text-[11px] text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        {doneText}
      </p>
    )
  }
  if (item.status === 'error') {
    return (
      <p className="mt-2 flex items-center gap-1 text-[11px] text-destructive">
        <AlertCircle className="h-3 w-3" />
        {item.error}
      </p>
    )
  }
  return null
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

function fmtWhen(iso: string): string {
  if (!iso) return 'tbd'
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
