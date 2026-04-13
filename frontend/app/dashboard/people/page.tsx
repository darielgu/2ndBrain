'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, RefreshCcw, Save, Trash2, User, Users, X } from 'lucide-react'
import Link from 'next/link'
import type { RecognitionProfile } from '@/lib/recognition-types'

type EditableProfile = RecognitionProfile & {
  open_loops_text: string
  dirty?: boolean
  saving?: boolean
}

function formatLastSeen(iso?: string) {
  if (!iso) return 'unknown'
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function toEditable(profile: RecognitionProfile): EditableProfile {
  return {
    ...profile,
    open_loops_text: (profile.open_loops || []).join(', '),
    dirty: false,
    saving: false,
  }
}

function parseOpenLoops(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    )
  )
}

function isPlaceholderName(name: string): boolean {
  const normalized = name.trim().toLowerCase()
  return (
    !normalized ||
    normalized === 'new contact' ||
    normalized === 'unknown' ||
    normalized.startsWith('pid_')
  )
}

function nameQuality(profile: RecognitionProfile): { source: string; confidence: string } {
  if (profile.name_confirmed) return { source: 'manual confirmed', confidence: 'high' }
  if (isPlaceholderName(profile.name)) return { source: 'placeholder', confidence: 'low' }
  if ((profile.conversation_count || 0) >= 2) return { source: 'inferred from transcript', confidence: 'medium-high' }
  return { source: 'inferred from transcript', confidence: 'medium' }
}

function profileAvatarUrl(profile: RecognitionProfile): string | null {
  const v = encodeURIComponent(profile.updated_at || profile.last_seen || '')
  return `/api/recognition/profiles/${encodeURIComponent(profile.person_id)}/avatar?v=${v}`
}

export default function PeoplePage() {
  const [profiles, setProfiles] = useState<RecognitionProfile[]>([])
  const [drafts, setDrafts] = useState<Record<string, EditableProfile>>({})
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set())
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set())

  const loadProfiles = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/recognition/dashboard')
      if (!res.ok) throw new Error(`failed to load dashboard (${res.status})`)
      const json = (await res.json()) as { profiles?: RecognitionProfile[] }
      const list = Array.isArray(json.profiles) ? json.profiles : []
      setProfiles(list)
      setDrafts({})
      setEditingIds(new Set())
      setDeletingIds(new Set())
      setFailedAvatars(new Set())
    } catch (err) {
      console.error(err)
      setError('failed to load contacts')
      setProfiles([])
      setDrafts({})
      setEditingIds(new Set())
      setDeletingIds(new Set())
      setFailedAvatars(new Set())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProfiles()
  }, [loadProfiles])

  const dirtyCount = useMemo(
    () => Object.values(drafts).filter((profile) => profile.dirty).length,
    [drafts]
  )

  const enterEditMode = useCallback((profile: RecognitionProfile) => {
    setEditingIds((prev) => {
      const next = new Set(prev)
      next.add(profile.person_id)
      return next
    })
    setDrafts((prev) => ({
      ...prev,
      [profile.person_id]: toEditable(profile),
    }))
  }, [])

  const cancelEdit = useCallback((personId: string) => {
    setEditingIds((prev) => {
      const next = new Set(prev)
      next.delete(personId)
      return next
    })
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[personId]
      return next
    })
  }, [])

  const patchDraft = useCallback((personId: string, update: Partial<EditableProfile>) => {
    setDrafts((prev) => {
      const current = prev[personId]
      if (!current) return prev
      return {
        ...prev,
        [personId]: {
          ...current,
          ...update,
          dirty: true,
        },
      }
    })
  }, [])

  const saveProfile = useCallback(async (personId: string) => {
    const draft = drafts[personId]
    if (!draft) return

    setDrafts((prev) => {
      const current = prev[personId]
      if (!current) return prev
      return {
        ...prev,
        [personId]: { ...current, saving: true },
      }
    })

    try {
      const payload = {
        person_id: draft.person_id,
        name: draft.name.trim() || draft.person_id,
        name_confirmed: draft.name_confirmed ?? false,
        where_met: draft.where_met || 'unknown',
        summary: draft.summary || '',
        open_loops: parseOpenLoops(draft.open_loops_text),
        last_location: draft.last_location || '',
        last_conversation_summary: draft.last_conversation_summary || '',
      }

      const res = await fetch('/api/recognition/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`save failed (${res.status}): ${body}`)
      }

      const json = (await res.json()) as { profile?: RecognitionProfile }
      const nextProfile: RecognitionProfile =
        json.profile || {
          ...draft,
          open_loops: parseOpenLoops(draft.open_loops_text),
        }

      setProfiles((prev) =>
        prev.map((item) =>
          item.person_id === personId ? nextProfile : item
        )
      )
      cancelEdit(personId)
    } catch (err) {
      console.error(err)
      setError(`failed to save ${draft.name || draft.person_id}`)
      setDrafts((prev) => {
        const current = prev[personId]
        if (!current) return prev
        return {
          ...prev,
          [personId]: { ...current, saving: false },
        }
      })
    }
  }, [cancelEdit, drafts])

  const deletePerson = useCallback(async (personId: string, name: string) => {
    const confirmed = window.confirm(`Delete ${name || personId}? This removes saved memory for this person from local recognition.`)
    if (!confirmed) return

    setError(null)
    setDeletingIds((prev) => {
      const next = new Set(prev)
      next.add(personId)
      return next
    })

    try {
      const res = await fetch(`/api/recognition/profiles/${encodeURIComponent(personId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`delete failed (${res.status}): ${body}`)
      }

      setProfiles((prev) => prev.filter((profile) => profile.person_id !== personId))
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[personId]
        return next
      })
      setEditingIds((prev) => {
        const next = new Set(prev)
        next.delete(personId)
        return next
      })
    } catch (err) {
      console.error(err)
      setError(`failed to delete ${name || personId}`)
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(personId)
        return next
      })
    }
  }, [])

  const resetAll = useCallback(async () => {
    setResetting(true)
    setError(null)
    try {
      const res = await fetch('/api/recognition/reset', { method: 'POST' })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`reset failed (${res.status}): ${body}`)
      }
      setProfiles([])
      setDrafts({})
      setEditingIds(new Set())
      setDeletingIds(new Set())
      setFailedAvatars(new Set())
    } catch (err) {
      console.error(err)
      setError('failed to wipe local contacts/history')
    } finally {
      setResetting(false)
    }
  }, [])

  return (
    <div className="micro-stagger space-y-4">
      <div className="border border-border bg-background/40 px-4 py-4 md:px-5 md:py-5">
        <h1 className="text-xl tracking-tight text-foreground md:text-2xl">People Memory Index</h1>
      </div>

      <div className="border border-border bg-background/30 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            tracked contacts
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadProfiles()}
              className="inline-flex items-center gap-1 border border-border bg-background/50 px-2 py-1 text-[11px] lowercase text-foreground"
              disabled={loading}
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              refresh
            </button>
            <button
              type="button"
              onClick={() => void resetAll()}
              className="inline-flex items-center gap-1 border border-destructive/50 bg-background/50 px-2 py-1 text-[11px] lowercase text-destructive"
              disabled={resetting}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {resetting ? 'wiping...' : 'wipe local people/history'}
            </button>
          </div>
        </div>

        {dirtyCount > 0 ? (
          <p className="mb-3 text-[11px] lowercase text-muted-foreground">
            {dirtyCount} unsaved contact edit{dirtyCount > 1 ? 's' : ''}
          </p>
        ) : null}
        {error ? (
          <p className="mb-3 text-xs lowercase text-destructive">{error}</p>
        ) : null}

        {loading ? (
          <div className="border border-dashed border-border bg-background/40 p-4 text-xs lowercase text-muted-foreground">
            loading contacts...
          </div>
        ) : profiles.length === 0 ? (
          <div className="border border-dashed border-border bg-background/40 p-4 text-xs lowercase text-muted-foreground">
            no saved people yet. recognized contacts will appear here after your first session.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {profiles.map((person) => {
              const isEditing = editingIds.has(person.person_id)
              const isDeleting = deletingIds.has(person.person_id)
              const draft = drafts[person.person_id]
              const profileView = isEditing && draft ? draft : toEditable(person)
              const avatarUrl = profileAvatarUrl(person)
              const avatarFailed = failedAvatars.has(person.person_id)

              return (
                <article
                  key={person.person_id}
                  className="space-y-2 border border-border bg-background/40 p-3 transition duration-150 hover:-translate-y-0.5 hover:border-blue-400/60 hover:bg-background/60 hover:shadow-[0_0_0_1px_rgba(96,165,250,0.18)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/dashboard/people/${encodeURIComponent(person.person_id)}`}
                      className="flex min-w-0 items-start gap-2 rounded-sm outline-none transition hover:opacity-90 focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {avatarUrl && !avatarFailed ? (
                        <img
                          src={avatarUrl}
                          alt={`${person.name} avatar`}
                          className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
                          loading="lazy"
                          onError={() =>
                            setFailedAvatars((prev) => {
                              if (prev.has(person.person_id)) return prev
                              const next = new Set(prev)
                              next.add(person.person_id)
                              return next
                            })
                          }
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background/60">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 space-y-1">
                        <h2 className="truncate text-sm lowercase text-foreground">{person.name}</h2>
                        <p className="text-[11px] lowercase text-muted-foreground">id: {person.person_id}</p>
                        <p className="text-[11px] lowercase text-blue-300/90">view full history</p>
                      </div>
                    </Link>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => (isEditing ? cancelEdit(person.person_id) : enterEditMode(person))}
                        disabled={isDeleting}
                        className="inline-flex items-center gap-1 border border-border bg-background/50 px-2 py-1 text-[11px] lowercase text-foreground disabled:opacity-60"
                      >
                        {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                        {isEditing ? 'cancel' : 'edit'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deletePerson(person.person_id, person.name)}
                        disabled={isDeleting || (isEditing && !!profileView.saving)}
                        className="inline-flex items-center gap-1 border border-destructive/50 bg-background/50 px-2 py-1 text-[11px] lowercase text-destructive disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {isDeleting ? 'deleting...' : 'delete'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="border border-border bg-background/50 px-1.5 py-0.5 text-[10px] lowercase text-muted-foreground">
                      source: {nameQuality(person).source}
                    </span>
                    <span className="border border-border bg-background/50 px-1.5 py-0.5 text-[10px] lowercase text-muted-foreground">
                      confidence: {nameQuality(person).confidence}
                    </span>
                  </div>

                  {isEditing ? (
                    <>
                      <label className="block text-[11px] lowercase text-muted-foreground">
                        name
                        <input
                          value={profileView.name}
                          onChange={(event) =>
                            patchDraft(person.person_id, { name: event.target.value })
                          }
                          className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs text-foreground"
                        />
                      </label>
                      <label className="block text-[11px] lowercase text-muted-foreground">
                        where met
                        <input
                          value={profileView.where_met || ''}
                          onChange={(event) =>
                            patchDraft(person.person_id, { where_met: event.target.value })
                          }
                          className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs text-foreground"
                        />
                      </label>
                      <label className="block text-[11px] lowercase text-muted-foreground">
                        summary
                        <textarea
                          value={profileView.summary || ''}
                          onChange={(event) =>
                            patchDraft(person.person_id, { summary: event.target.value })
                          }
                          className="mt-1 h-16 w-full resize-none border border-border bg-background px-2 py-1 text-xs text-foreground"
                        />
                      </label>
                      <label className="block text-[11px] lowercase text-muted-foreground">
                        open loops (comma separated)
                        <input
                          value={profileView.open_loops_text}
                          onChange={(event) =>
                            patchDraft(person.person_id, { open_loops_text: event.target.value })
                          }
                          className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs text-foreground"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => void saveProfile(person.person_id)}
                        disabled={!!profileView.saving || isDeleting}
                        className="inline-flex items-center gap-1 border border-border bg-background/50 px-2 py-1 text-[11px] lowercase text-foreground disabled:opacity-60"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {profileView.saving ? 'saving...' : 'save contact'}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs lowercase text-foreground/90">
                        met: <span className="text-muted-foreground">{person.where_met || 'unknown'}</span>
                      </p>
                      <p className="text-xs lowercase text-foreground/90">
                        {person.summary || 'no summary captured yet'}
                      </p>
                      <p className="text-xs lowercase text-foreground/90">
                        open loop:{' '}
                        <span className="text-muted-foreground">{person.open_loops?.[0] || 'none'}</span>
                      </p>
                    </>
                  )}

                  <p className="text-[11px] lowercase text-muted-foreground">
                    last seen {formatLastSeen(person.last_seen)}
                  </p>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
