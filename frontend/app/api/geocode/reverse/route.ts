import { NextResponse } from 'next/server'

type NominatimResponse = {
  display_name?: string
  address?: Record<string, string | undefined>
}

function parseStateCode(address: Record<string, string | undefined>): string {
  const iso = address['ISO3166-2-lvl4'] || address['ISO3166-2-lvl3'] || ''
  if (iso.includes('-')) {
    const code = iso.split('-')[1]
    if (code) return code
  }
  return address.state || ''
}

function compactPlace(payload: NominatimResponse): string {
  const address = payload.address || {}
  const area =
    address.neighbourhood ||
    address.suburb ||
    address.city_district ||
    address.borough ||
    ''
  const city =
    address.city ||
    address.town ||
    address.village ||
    address.hamlet ||
    address.county ||
    ''
  const state = parseStateCode(address)
  const country = (address.country_code || address.country || '').toUpperCase()

  const parts = [area, city, state, country].filter(Boolean)
  const deduped: string[] = []
  for (const part of parts) {
    if (!deduped.includes(part)) deduped.push(part)
  }

  if (deduped.length > 0) return deduped.join(', ')
  return payload.display_name || ''
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = Number(searchParams.get('lat'))
  const lon = Number(searchParams.get('lon'))

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: 'lat and lon are required numeric query params' },
      { status: 400 }
    )
  }

  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lon))
    url.searchParams.set('zoom', '16')
    url.searchParams.set('addressdetails', '1')

    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'SecondBrain-Hackathon/0.1 (reverse geocoding)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ place: '' }, { status: 200 })
    }

    const payload = (await res.json()) as NominatimResponse
    const place = compactPlace(payload)

    return NextResponse.json({ place })
  } catch (err) {
    console.error('reverse geocode failed:', err)
    return NextResponse.json({ place: '' }, { status: 200 })
  }
}
