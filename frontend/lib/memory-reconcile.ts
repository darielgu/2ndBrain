import { getRecognitionStoreSnapshot } from '@/lib/recognition-store'
import {
  findEpisodeByEpisodeId,
  findPersonByPersonId,
  upsertEpisodeContext,
  upsertPersonContext,
} from '@/lib/nia'
import type { Episode, Person } from '@/lib/types'
import type {
  RecognitionEpisode,
  RecognitionProfile,
} from '@/lib/recognition-types'

type ReconcileReason = 'startup' | 'finalize' | 'manual'

let startupReconcileStarted = false
let reconcileInFlight: Promise<ReconcileReport> | null = null

export type ReconcileReport = {
  reason: ReconcileReason
  scanned_profiles: number
  scanned_episodes: number
  created: number
  updated: number
  failed: number
  errors: Array<{ kind: 'person' | 'episode'; id: string; message: string }>
}

function toPerson(profile: RecognitionProfile): Person {
  const notes: string[] = []
  if (profile.summary) notes.push(`${profile.name} context: ${profile.summary}`)
  if (profile.last_conversation_summary) notes.push(profile.last_conversation_summary)

  return {
    person_id: profile.person_id,
    name: profile.name,
    where_met: profile.where_met || 'unknown',
    summary: profile.summary || '',
    open_loops: profile.open_loops || [],
    last_seen: profile.last_seen || new Date().toISOString(),
    notes,
    prose:
      profile.summary ||
      profile.last_conversation_summary ||
      `${profile.name} profile imported from recognition store.`,
  }
}

function toEpisode(episode: RecognitionEpisode): Episode {
  const lowerWhereMet = (episode.where_met || '').toLowerCase()
  const source: Episode['source'] = lowerWhereMet.includes('screen')
    ? 'screen'
    : 'webcam'

  return {
    episode_id: episode.episode_id,
    person_ids: [episode.person_id],
    topics: episode.topics || [],
    promises: episode.promises || [],
    next_actions: episode.next_actions || [],
    timestamp: episode.timestamp || new Date().toISOString(),
    source,
    prose: episode.summary || episode.transcript,
  }
}

export async function runMemoryReconcile(
  reason: ReconcileReason,
  options?: { limitProfiles?: number; limitEpisodes?: number }
): Promise<ReconcileReport> {
  const store = await getRecognitionStoreSnapshot()
  const profiles = Object.values(store.profiles)
  const episodes = store.episodes

  const selectedProfiles =
    typeof options?.limitProfiles === 'number'
      ? profiles.slice(0, options.limitProfiles)
      : profiles
  const selectedEpisodes =
    typeof options?.limitEpisodes === 'number'
      ? episodes.slice(0, options.limitEpisodes)
      : episodes

  let created = 0
  let updated = 0
  let failed = 0
  const errors: Array<{ kind: 'person' | 'episode'; id: string; message: string }> = []

  for (const profile of selectedProfiles) {
    try {
      const existing = await findPersonByPersonId(profile.person_id)
      const result = await upsertPersonContext(toPerson(profile))
      if (result.action === 'created' && !existing) created += 1
      else updated += 1
    } catch (err) {
      failed += 1
      errors.push({
        kind: 'person',
        id: profile.person_id,
        message: err instanceof Error ? err.message : 'unknown error',
      })
    }
  }

  for (const episode of selectedEpisodes) {
    if (!episode.episode_id) continue
    try {
      const existing = await findEpisodeByEpisodeId(episode.episode_id)
      const result = await upsertEpisodeContext(toEpisode(episode))
      if (result.action === 'created' && !existing) created += 1
      else updated += 1
    } catch (err) {
      failed += 1
      errors.push({
        kind: 'episode',
        id: episode.episode_id,
        message: err instanceof Error ? err.message : 'unknown error',
      })
    }
  }

  return {
    reason,
    scanned_profiles: selectedProfiles.length,
    scanned_episodes: selectedEpisodes.length,
    created,
    updated,
    failed,
    errors,
  }
}

export function queueMemoryReconcile(reason: ReconcileReason) {
  if (reconcileInFlight) return reconcileInFlight
  reconcileInFlight = runMemoryReconcile(reason)
    .catch((err) => {
      console.error(`memory reconcile (${reason}) failed:`, err)
      return {
        reason,
        scanned_profiles: 0,
        scanned_episodes: 0,
        created: 0,
        updated: 0,
        failed: 1,
        errors: [
          {
            kind: 'person',
            id: 'reconcile',
            message: err instanceof Error ? err.message : 'unknown error',
          },
        ],
      } satisfies ReconcileReport
    })
    .finally(() => {
      reconcileInFlight = null
    })
  return reconcileInFlight
}

export function triggerStartupMemoryReconcile() {
  if (startupReconcileStarted) return
  startupReconcileStarted = true
  void queueMemoryReconcile('startup')
}

