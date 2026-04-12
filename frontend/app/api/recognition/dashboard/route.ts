import { NextResponse } from 'next/server'
import { listActiveLoops, listEpisodes, listProfiles } from '@/lib/recognition-store'
import { triggerStartupMemoryReconcile } from '@/lib/memory-reconcile'

export async function GET() {
  try {
    triggerStartupMemoryReconcile()
    const [profiles, episodes, activeLoops] = await Promise.all([
      listProfiles(),
      listEpisodes(50),
      listActiveLoops(20),
    ])

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      profiles,
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
