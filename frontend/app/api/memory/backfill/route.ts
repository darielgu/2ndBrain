import { NextResponse } from 'next/server'
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

type BackfillError = {
  kind: 'person' | 'episode'
  id: string
  message: string
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

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const n = Math.floor(value)
  return n > 0 ? n : null
}

// Local admin backfill endpoint by request.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      dry_run?: boolean
      limit_profiles?: number
      limit_episodes?: number
    }

    const dryRun = Boolean(body.dry_run)
    const limitProfiles = asPositiveInt(body.limit_profiles)
    const limitEpisodes = asPositiveInt(body.limit_episodes)

    const store = await getRecognitionStoreSnapshot()
    const profiles = Object.values(store.profiles)
    const episodes = store.episodes

    const selectedProfiles =
      limitProfiles === null ? profiles : profiles.slice(0, limitProfiles)
    const selectedEpisodes =
      limitEpisodes === null ? episodes : episodes.slice(0, limitEpisodes)

    let created = 0
    let updated = 0
    let skipped = 0
    let failed = 0
    const errors: BackfillError[] = []

    for (const profile of selectedProfiles) {
      try {
        if (dryRun) {
          const existing = await findPersonByPersonId(profile.person_id)
          if (existing) updated += 1
          else created += 1
          continue
        }

        const result = await upsertPersonContext(toPerson(profile))
        if (result.action === 'created') created += 1
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
      if (!episode.episode_id) {
        skipped += 1
        continue
      }
      try {
        if (dryRun) {
          const existing = await findEpisodeByEpisodeId(episode.episode_id)
          if (existing) updated += 1
          else created += 1
          continue
        }

        const result = await upsertEpisodeContext(toEpisode(episode))
        if (result.action === 'created') created += 1
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

    return NextResponse.json({
      dry_run: dryRun,
      scanned: {
        profiles: selectedProfiles.length,
        episodes: selectedEpisodes.length,
        total: selectedProfiles.length + selectedEpisodes.length,
      },
      created,
      updated,
      skipped,
      failed,
      errors,
    })
  } catch (err) {
    console.error('memory backfill error:', err)
    return NextResponse.json({ error: 'backfill failed' }, { status: 500 })
  }
}
