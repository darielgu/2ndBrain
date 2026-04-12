import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface EnrichmentInput {
  name: string
  email?: string
  company?: string
  linkedinUrl?: string
  whereMet?: string
  existingSummary?: string
}

export interface EnrichmentResult {
  bio: string
  currentRole: string | null
  company: string | null
  location: string | null
  links: { label: string; url: string }[]
  highlights: string[]
  confidence: 'high' | 'medium' | 'low'
  sources: { title: string; url: string }[]
}

// --- Tavily: ai-optimized web search ---
interface TavilySearchResult {
  title: string
  url: string
  content: string
  score?: number
}

async function tavilySearch(query: string, maxResults = 6): Promise<TavilySearchResult[]> {
  const key = process.env.TAVILY_API_KEY
  if (!key) return []

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: 'basic',
      max_results: maxResults,
      include_answer: false,
    }),
  })

  if (!res.ok) {
    console.error('tavily search failed:', res.status, await res.text().catch(() => ''))
    return []
  }
  const data = (await res.json()) as { results?: TavilySearchResult[] }
  return data.results || []
}

// --- Apollo: structured person enrichment by name/email/linkedin ---
interface ApolloPerson {
  name?: string
  first_name?: string
  last_name?: string
  title?: string
  headline?: string
  email?: string
  linkedin_url?: string
  city?: string
  state?: string
  country?: string
  organization?: {
    name?: string
    website_url?: string
    industry?: string
  }
  employment_history?: Array<{
    title?: string
    organization_name?: string
    start_date?: string
    end_date?: string
    current?: boolean
  }>
}

async function apolloEnrich(input: EnrichmentInput): Promise<ApolloPerson | null> {
  const key = process.env.APOLLO_API_KEY
  if (!key) return null

  const params: Record<string, string> = {}
  if (input.email) params.email = input.email
  if (input.linkedinUrl) params.linkedin_url = input.linkedinUrl
  if (input.name) {
    const [first, ...rest] = input.name.split(' ')
    params.first_name = first
    if (rest.length) params.last_name = rest.join(' ')
  }
  if (input.company) params.organization_name = input.company

  // Apollo's people/match expects api_key as query param OR header — use header.
  const res = await fetch(
    `https://api.apollo.io/api/v1/people/match?${new URLSearchParams(params).toString()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': key,
      },
    },
  )

  if (!res.ok) {
    console.error('apollo enrich failed:', res.status, await res.text().catch(() => ''))
    return null
  }
  const data = (await res.json()) as { person?: ApolloPerson }
  return data.person || null
}

// --- GPT-4o synthesis: combine tavily + apollo into a clean enrichment ---

const SYNTHESIS_PROMPT = `you synthesize a brief factual profile from web snippets and structured apollo data.

rules:
- ground every claim in the provided sources. do NOT invent employment, education, or skills.
- bio: 2-4 sentences, lowercase, terse. include current role + company if known.
- currentRole / company / location: extract verbatim if present, else null.
- highlights: 2-5 specific factual points (e.g. "cto at acme since 2023", "cs degree from berkeley", "wrote a blog on rust memory safety"). skip vague filler.
- links: up to 4 high-signal urls (linkedin, personal site, github, twitter, company). label them.
- sources: the tavily results you actually used.
- confidence: "high" if apollo had a match AND tavily had 3+ relevant results, "medium" if one source was rich, "low" if data was thin or ambiguous.

return valid json matching:
{
  "bio": "string",
  "currentRole": "string or null",
  "company": "string or null",
  "location": "string or null",
  "links": [{"label": "string", "url": "string"}],
  "highlights": ["string"],
  "confidence": "high" | "medium" | "low",
  "sources": [{"title": "string", "url": "string"}]
}`

export async function enrichPerson(input: EnrichmentInput): Promise<EnrichmentResult> {
  const queryParts = [input.name]
  if (input.company) queryParts.push(input.company)
  if (input.whereMet) queryParts.push(input.whereMet)
  const query = queryParts.filter(Boolean).join(' ')

  const [tavilyResults, apolloPerson] = await Promise.all([
    tavilySearch(query),
    apolloEnrich(input),
  ])

  const contextBlocks: string[] = []

  if (apolloPerson) {
    contextBlocks.push(
      `=== apollo structured match ===\n${JSON.stringify(apolloPerson, null, 2)}`,
    )
  }

  if (tavilyResults.length > 0) {
    contextBlocks.push(
      '=== tavily web results ===\n' +
        tavilyResults
          .map(
            (r, i) =>
              `#${i + 1} [${r.title}](${r.url})\n${r.content?.slice(0, 600) || ''}`,
          )
          .join('\n\n'),
    )
  }

  if (input.existingSummary) {
    contextBlocks.push(`=== existing summary from memory ===\n${input.existingSummary}`)
  }

  if (contextBlocks.length === 0) {
    return {
      bio: `no enrichment data found for ${input.name}.`,
      currentRole: null,
      company: null,
      location: null,
      links: [],
      highlights: [],
      confidence: 'low',
      sources: [],
    }
  }

  const userMessage = `subject: ${input.name}` +
    (input.whereMet ? ` (met at: ${input.whereMet})` : '') +
    '\n\n' + contextBlocks.join('\n\n')

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYNTHESIS_PROMPT },
      { role: 'user', content: userMessage },
    ],
  })

  const raw = completion.choices[0]?.message?.content
  if (!raw) {
    return {
      bio: 'synthesis returned no content.',
      currentRole: null,
      company: null,
      location: null,
      links: [],
      highlights: [],
      confidence: 'low',
      sources: [],
    }
  }

  const parsed = JSON.parse(raw) as Partial<EnrichmentResult>
  return {
    bio: parsed.bio || '',
    currentRole: parsed.currentRole ?? null,
    company: parsed.company ?? null,
    location: parsed.location ?? null,
    links: Array.isArray(parsed.links) ? parsed.links.slice(0, 4) : [],
    highlights: Array.isArray(parsed.highlights) ? parsed.highlights.slice(0, 5) : [],
    confidence: (parsed.confidence as EnrichmentResult['confidence']) || 'low',
    sources: Array.isArray(parsed.sources) ? parsed.sources.slice(0, 6) : [],
  }
}
