import { NextResponse } from 'next/server'
import { extractMemory } from '@/lib/openai'
import {
  addConversationEpisode,
  getProfile,
  upsertProfile,
} from '@/lib/recognition-store'
import { saveEpisodeContext, savePersonContext } from '@/lib/nia'
import { queueMemoryReconcile } from '@/lib/memory-reconcile'
import type { Episode, ExtractionResult, Person } from '@/lib/types'

function isPlaceholderName(value: string | undefined | null): boolean {
  const normalized = String(value || '').trim().toLowerCase()
  return (
    !normalized ||
    normalized === 'new contact' ||
    normalized === 'unknown' ||
    normalized === 'n/a' ||
    normalized.startsWith('pid_')
  )
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ')
}

function extractNameHeuristic(transcript: string): string {
  const normalized = transcript.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''

  const patterns = [
    /\bmy name is ([a-z][a-z' -]{1,40})\b/i,
    /\bi(?:'m| am) ([a-z][a-z' -]{1,40})\b/i,
    /\bthis is ([a-z][a-z' -]{1,40})\b/i,
    /\bcall me ([a-z][a-z' -]{1,40})\b/i,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    const candidate = match?.[1]?.trim() || ''
    if (!candidate) continue
    const clean = candidate
      .replace(/[^a-z' -]/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!clean) continue
    if (clean.split(' ').length > 4) continue
    return toTitleCase(clean)
  }

  return ''
}

function buildPersonPayload(input: {
  person_id: string
  name: string
  where_met: string
  summary: string
  open_loops: string[]
  last_seen: string
  last_location?: string
  last_conversation_summary?: string
}): Person {
  const prose = `${input.name} was last seen on ${new Date(input.last_seen).toLocaleDateString('en-US')}. They were met at ${input.where_met}. Current summary: ${input.summary || 'not captured yet'}. Last location: ${input.last_location || 'unknown'}. Recent conversation: ${input.last_conversation_summary || 'no summary yet'}.`

  return {
    person_id: input.person_id,
    name: input.name,
    where_met: input.where_met,
    summary: input.summary,
    open_loops: input.open_loops,
    last_seen: input.last_seen,
    notes: [prose],
    prose,
  }
}

function splitSentences(transcript: string): string[] {
  return transcript
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
}

function dedupeStrings(values: string[], max: number): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).slice(0, max)
}

function extractFallbackOpenLoops(transcript: string): string[] {
  const patterns = [
    /\b(i|we)\s+(will|can|should|need to|plan to)\b/i,
    /\blet'?s\b/i,
    /\b(send|share|introduce|intro|follow up|circle back|remind|schedule|book)\b/i,
    /\b(next week|tomorrow|later today|by friday|by monday)\b/i,
  ]

  const candidates = splitSentences(transcript)
    .filter((line) => line.length >= 12 && line.length <= 180)
    .filter((line) => patterns.some((pattern) => pattern.test(line)))
    .map((line) => line.replace(/[.?!]+$/, ''))

  return dedupeStrings(candidates, 4)
}

function extractFallbackTopics(transcript: string): string[] {
  const lowered = transcript.toLowerCase()
  const signals = [
    'project',
    'product',
    'roadmap',
    'hiring',
    'fundraising',
    'design',
    'marketing',
    'sales',
    'launch',
    'integration',
    'api',
    'customer',
  ]
  const matched = signals.filter((signal) => lowered.includes(signal))
  return dedupeStrings(matched, 3)
}

function buildFallbackEpisodeSummary(transcript: string, name: string): string {
  const sentences = splitSentences(transcript)
    .filter((line) => line.length > 20)
    .slice(0, 3)
  if (sentences.length === 0) {
    return `Conversation captured with ${name}. Summary is still being enriched.`
  }
  return sentences.join(' ')
}

function enrichExtraction(
  extraction: ExtractionResult,
  transcript: string,
  name: string
): ExtractionResult {
  const topics = dedupeStrings(
    [
      ...(extraction.topics || []).filter((topic) => topic && topic !== 'unknown'),
      ...extractFallbackTopics(transcript),
    ],
    3
  )
  const nextActions = dedupeStrings(
    [...(extraction.next_actions || []), ...extractFallbackOpenLoops(transcript)],
    4
  )
  const promises = dedupeStrings(extraction.promises || [], 4)
  const episodeProse =
    extraction.episode_prose?.trim() || buildFallbackEpisodeSummary(transcript, name)

  return {
    ...extraction,
    topics: topics.length > 0 ? topics : ['general catch-up'],
    next_actions: nextActions,
    promises,
    episode_prose: episodeProse,
  }
}

function resolveSummaryFromExtraction(
  extraction: ExtractionResult,
  fallback: string
): string {
  const extractedPersonSummary = dedupeStrings(
    (extraction.people || [])
      .map((person) => String(person.prose_summary || '').trim())
      .filter(Boolean),
    1
  )[0]
  const extractedRoleSummary = dedupeStrings(
    (extraction.people || [])
      .map((person) => String(person.role_or_context || '').trim())
      .filter(Boolean),
    1
  )[0]

  return (
    extractedPersonSummary ||
    extractedRoleSummary ||
    extraction.episode_prose?.trim() ||
    fallback
  )
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const person_id = String(body.person_id || '').trim()
    const transcript = String(body.transcript || '').trim()
    const finalize = Boolean(body.finalize)
    const where_met = body.where_met ? String(body.where_met) : undefined
    const last_location = body.last_location ? String(body.last_location) : undefined
    const resolvedWhereMet = where_met || last_location

    if (!person_id || transcript.length < (finalize ? 1 : 20)) {
      return NextResponse.json(
        { error: 'person_id and transcript are required' },
        { status: 400 }
      )
    }

    const existing = await getProfile(person_id)
    if (!existing) {
      await upsertProfile({
        person_id,
        name: body.name ? String(body.name) : person_id,
        name_confirmed:
          typeof body.name_confirmed === 'boolean'
            ? body.name_confirmed
            : false,
        where_met: resolvedWhereMet || 'live webcam session',
        summary: body.summary ? String(body.summary) : '',
        open_loops: Array.isArray(body.open_loops)
          ? body.open_loops.map((x: unknown) => String(x))
          : [],
        last_location,
      })
    } else if (body.name) {
      const incomingName = String(body.name).trim()
      const incomingConfirmed =
        typeof body.name_confirmed === 'boolean' ? body.name_confirmed : false
      const allowNameUpdate = !existing.name_confirmed || incomingConfirmed
      if (incomingName && allowNameUpdate) {
        await upsertProfile({
          person_id,
          name: incomingName,
          name_confirmed: incomingConfirmed || existing.name_confirmed,
          where_met: resolvedWhereMet || existing.where_met,
          summary: body.summary ? String(body.summary) : existing.summary,
          open_loops: Array.isArray(body.open_loops)
            ? body.open_loops.map((x: unknown) => String(x))
            : existing.open_loops,
          last_location: last_location || existing.last_location,
        })
      }
    }

    const rawExtraction = await extractMemory(transcript)
    const extraction = enrichExtraction(
      rawExtraction,
      transcript,
      existing?.name || (body.name ? String(body.name) : person_id)
    )

    const current = await getProfile(person_id)
    const extractedNameCandidate =
      String(extraction.people?.[0]?.name || '').trim() ||
      extractNameHeuristic(transcript)
    if (
      current &&
      !current.name_confirmed &&
      isPlaceholderName(current.name) &&
      extractedNameCandidate &&
      !isPlaceholderName(extractedNameCandidate)
    ) {
      await upsertProfile({
        person_id: current.person_id,
        name: extractedNameCandidate,
        name_confirmed: false,
        where_met: current.where_met,
        summary: current.summary,
        open_loops: current.open_loops,
        last_location: current.last_location,
      })
    }

    if (!finalize) {
      const liveBase = (await getProfile(person_id)) || current
      if (!liveBase) {
        return NextResponse.json(
          { error: 'profile not found for live sync' },
          { status: 404 }
        )
      }

      const liveSummary = resolveSummaryFromExtraction(extraction, liveBase.summary || '')
      const liveProfile = await upsertProfile({
        person_id: liveBase.person_id,
        name: liveBase.name,
        name_confirmed: liveBase.name_confirmed,
        where_met: resolvedWhereMet || liveBase.where_met,
        summary: liveSummary,
        open_loops: dedupeStrings(
          [
            ...(liveBase.open_loops || []),
            ...(extraction.promises || []),
            ...(extraction.next_actions || []),
          ],
          12
        ),
        last_location: last_location || liveBase.last_location,
        recent_topics: dedupeStrings(
          [
            ...(extraction.topics || []),
            ...(liveBase.recent_topics || []),
          ],
          6
        ),
        last_conversation_summary:
          extraction.episode_prose?.trim() || liveBase.last_conversation_summary || '',
        last_seen: new Date().toISOString(),
      })

      return NextResponse.json({
        profile: liveProfile,
        episode: null,
        extraction,
      })
    }

    const { profile, episode } = await addConversationEpisode({
      person_id,
      transcript,
      extraction,
      where_met: resolvedWhereMet,
      last_location,
    })

    // Best-effort Nia sync on finalize only so a session maps to one episode context.
    try {
      const now = new Date().toISOString()
      const personPayload = buildPersonPayload({
        person_id: profile.person_id,
        name: profile.name,
        where_met: profile.where_met,
        summary: profile.summary,
        open_loops: profile.open_loops,
        last_seen: profile.last_seen || now,
        last_location: profile.last_location,
        last_conversation_summary: profile.last_conversation_summary,
      })
      await savePersonContext(personPayload)

      const niaEpisode: Episode = {
        episode_id: episode.episode_id,
        person_ids: [episode.person_id],
        topics: episode.topics,
        promises: episode.promises,
        next_actions: episode.next_actions,
        timestamp: episode.timestamp,
        source: 'webcam',
        prose: episode.summary,
      }
      await saveEpisodeContext(niaEpisode)
    } catch (err) {
      console.error('nia sync warning (non-fatal):', err)
    }
    void queueMemoryReconcile('finalize')

    return NextResponse.json({
      profile,
      episode,
      extraction,
    })
  } catch (err) {
    console.error('conversation save error:', err)
    return NextResponse.json(
      { error: 'failed to save conversation memory' },
      { status: 500 }
    )
  }
}
