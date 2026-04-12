import { NextResponse } from 'next/server'
import { resetRecognitionStore } from '@/lib/recognition-store'

export async function POST() {
  try {
    await resetRecognitionStore()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('recognition reset error:', err)
    return NextResponse.json({ error: 'failed to reset recognition store' }, { status: 500 })
  }
}
