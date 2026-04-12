import { NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/google'
import { upsertGoogleAccount } from '@/lib/db'

export const runtime = 'nodejs'

// GET /api/auth/google/callback?code=...&state=...
// Exchanges the auth code for tokens, fetches the user's google profile,
// persists tokens in sqlite keyed by the user slug, then redirects to the
// onboarding page with a status flag.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const stateRaw = url.searchParams.get('state')
  const errParam = url.searchParams.get('error')

  const back = (status: string, extra?: Record<string, string>) => {
    const redirect = new URL('/onboarding', url.origin)
    redirect.searchParams.set('google', status)
    if (extra) {
      for (const [k, v] of Object.entries(extra)) redirect.searchParams.set(k, v)
    }
    return NextResponse.redirect(redirect)
  }

  if (errParam) return back('denied', { reason: errParam })
  if (!code || !stateRaw) return back('error', { reason: 'missing_params' })

  // Validate state + extract user slug.
  let user: string
  try {
    const decoded = JSON.parse(
      Buffer.from(stateRaw, 'base64url').toString('utf8'),
    ) as { user?: string; nonce?: string }
    const cookieNonce = request.headers
      .get('cookie')
      ?.split(/;\s*/)
      .find((c) => c.startsWith('sb_oauth_state='))
      ?.split('=')[1]
    if (!decoded.user || !decoded.nonce || decoded.nonce !== cookieNonce) {
      return back('error', { reason: 'bad_state' })
    }
    user = decoded.user
  } catch {
    return back('error', { reason: 'bad_state' })
  }

  try {
    const oauth2 = getOAuthClient()
    const { tokens } = await oauth2.getToken(code)
    oauth2.setCredentials(tokens)

    // Fetch identity via the userinfo endpoint.
    const profileRes = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    )
    const profile = (await profileRes.json().catch(() => ({}))) as {
      sub?: string
      email?: string
      name?: string
      picture?: string
    }

    upsertGoogleAccount({
      user_id: user,
      google_sub: profile.sub ?? null,
      email: profile.email ?? null,
      name: profile.name ?? null,
      picture: profile.picture ?? null,
      access_token: tokens.access_token || '',
      refresh_token: tokens.refresh_token ?? null,
      scope: tokens.scope ?? null,
      token_type: tokens.token_type ?? null,
      expiry_date: tokens.expiry_date ?? null,
    })

    const res = back('connected', { email: profile.email ?? '' })
    res.cookies.delete('sb_oauth_state')
    return res
  } catch (err) {
    console.error('google oauth callback error:', err)
    return back('error', { reason: 'token_exchange_failed' })
  }
}
