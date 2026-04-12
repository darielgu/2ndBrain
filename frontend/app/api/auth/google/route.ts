import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { buildAuthUrl } from '@/lib/google'

export const runtime = 'nodejs'

// GET /api/auth/google?user=<slug>
// Kicks off the google oauth flow. The user slug (derived from onboarding
// profile name) is embedded in `state` along with a CSRF nonce.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const user = url.searchParams.get('user')?.trim()
    if (!user) {
      return NextResponse.json(
        { error: 'missing ?user=<slug>' },
        { status: 400 },
      )
    }

    const nonce = crypto.randomBytes(16).toString('hex')
    const state = Buffer.from(JSON.stringify({ user, nonce })).toString(
      'base64url',
    )

    const authUrl = buildAuthUrl(state)

    const res = NextResponse.redirect(authUrl)
    res.cookies.set('sb_oauth_state', nonce, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60,
    })
    return res
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'oauth start failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
