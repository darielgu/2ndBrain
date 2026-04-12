import { NextResponse } from 'next/server'
import { deleteProfile, getProfile } from '@/lib/recognition-store'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  try {
    const { personId } = await params
    const profile = await getProfile(personId)

    if (!profile) {
      return NextResponse.json({ error: 'profile not found' }, { status: 404 })
    }

    return NextResponse.json({ profile })
  } catch (err) {
    console.error('profile get error:', err)
    return NextResponse.json({ error: 'failed to get profile' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  try {
    const { personId } = await params
    const deleted = await deleteProfile(personId)
    if (!deleted) {
      return NextResponse.json({ error: 'profile not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('profile delete error:', err)
    return NextResponse.json({ error: 'failed to delete profile' }, { status: 500 })
  }
}
