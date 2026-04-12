import { NextResponse } from 'next/server'
import { listActiveLoops, listEpisodes, listProfiles } from '@/lib/recognition-store'
import { triggerStartupMemoryReconcile } from '@/lib/memory-reconcile'
import { listPeopleDb } from '@/lib/db'
import type { RecognitionProfile } from '@/lib/recognition-types'
import type { Person } from '@/lib/types'

// Convert a sqlite Person into RecognitionProfile shape so screen-capture
// sessions (which write to the sqlite `people` table via savePersonContext)
// surface alongside live-recognition profiles on the /dashboard/people page.
function personToRecognitionProfile(p: Person): RecognitionProfile {
  const now = new Date().toISOString()
  return {
    person_id: p.person_id,
    name: p.name,
    name_confirmed: false,
    where_met: p.where_met || 'unknown',
    summary: p.summary || [p.job_title, p.company].filter(Boolean).join(' at '),
    open_loops: p.open_loops || [],
    last_location: '',
    conversation_count: (p.notes?.length || 0),
    recent_topics: [],
    last_conversation_summary: p.notes?.[p.notes.length - 1] || '',
    last_seen: p.last_seen || undefined,
    face_frames: [],
    created_at: p.last_seen || now,
    updated_at: p.last_seen || now,
  }
}

export async function GET() {
  try {
    triggerStartupMemoryReconcile()
    const [profiles, episodes, activeLoops] = await Promise.all([
      listProfiles(),
      listEpisodes(50),
      listActiveLoops(20),
    ])

    // Merge sqlite-backed people in. Recognition-store profiles win on
    // conflict since they carry richer data (face frames, conversation stats).
    let sqlitePeople: Person[] = []
    try {
      sqlitePeople = listPeopleDb(200)
    } catch (err) {
      console.error('listPeopleDb failed:', err)
    }

    const byId = new Map<string, RecognitionProfile>()
    for (const p of sqlitePeople) {
      byId.set(p.person_id, personToRecognitionProfile(p))
    }
    for (const profile of profiles) {
      byId.set(profile.person_id, profile)
    }
    const mergedProfiles = Array.from(byId.values()).sort((a, b) => {
      const aTime = a.last_seen || a.updated_at || a.created_at || ''
      const bTime = b.last_seen || b.updated_at || b.created_at || ''
      return bTime.localeCompare(aTime)
    })

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      profiles: mergedProfiles,
      episodes,
      active_loops: activeLoops,
    })
  } catch (err) {
    console.error('dashboard data error:', err)
    return NextResponse.json(
      {
        generated_at: new Date().toISOString(),
        profiles: [],
        episodes: [],
        active_loops: [],
      },
      { status: 500 }
    )
  }
}
