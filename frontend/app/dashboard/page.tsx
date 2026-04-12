'use client'

import { useState } from 'react'
import {
  Bot,
  Camera,
  Clock3,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
} from 'lucide-react'
import { PromptInputBox } from '@/components/ui/ai-prompt-box'
import { SessionPanel } from '@/components/session-panel'
import { RecordingProvider } from '@/components/recording-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePeople, useEpisodes } from '@/hooks/use-memory'
import type { Person, Episode } from '@/lib/types'

// --- Mock data used as fallback when Nia has no data or errors ---

const mockPeople: (Person & { avatar?: string })[] = [
  {
    person_id: 'maya',
    name: 'maya',
    where_met: 'hackathon',
    summary: 'works on voice infra',
    open_loops: ['send repo'],
    last_seen: '3h ago',
    avatar:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240&h=240&fit=crop&auto=format',
  },
  {
    person_id: 'elijah',
    name: 'elijah',
    where_met: 'co-working loft',
    summary: 'shipping a wearables prototype',
    open_loops: ['intro to camera ml lead'],
    last_seen: 'yesterday',
    avatar:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240&h=240&fit=crop&auto=format',
  },
  {
    person_id: 'sara',
    name: 'sara',
    where_met: 'product meetup',
    summary: 'building agent onboarding flows',
    open_loops: ['share memory schema'],
    last_seen: '2d ago',
    avatar:
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=240&h=240&fit=crop&auto=format',
  },
]

const mockEpisodes = [
  {
    person: 'maya',
    topic: 'voice infra',
    promise: 'send repo link before monday',
    timestamp: 'apr 12, 09:10',
  },
  {
    person: 'elijah',
    topic: 'camera latency',
    promise: 'review fallback identity ux',
    timestamp: 'apr 11, 16:44',
  },
]

const chatMessages = [
  {
    role: 'user',
    text: 'who should i follow up with this week?',
  },
  {
    role: 'assistant',
    text: 'maya (repo), elijah (camera intro), and sara (memory schema) are open loops.',
  },
]

// Format a timestamp like "apr 12, 09:10" from ISO
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    const month = d.toLocaleString('en-US', { month: 'short' }).toLowerCase()
    const day = d.getDate()
    const time = d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    return `${month} ${day}, ${time}`
  } catch {
    return iso
  }
}

// Relative time "3h ago"
function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  } catch {
    return iso
  }
}

function DashboardContent() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sessionMode, setSessionMode] = useState<'idle' | 'webcam' | 'screen'>(
    'idle'
  )
  const [refreshKey, setRefreshKey] = useState(0)

  const { people: niaPeople, isLoading: peopleLoading } = usePeople(refreshKey)
  const { episodes: niaEpisodes, isLoading: episodesLoading } =
    useEpisodes(refreshKey)

  // Use real data when available, otherwise fall back to mock
  const hasRealPeople = !peopleLoading && niaPeople.length > 0
  const displayPeople = hasRealPeople ? niaPeople : mockPeople

  const hasRealEpisodes = !episodesLoading && niaEpisodes.length > 0
  const displayEpisodes = hasRealEpisodes
    ? niaEpisodes.map((e) => ({
        person: e.person_ids[0] || 'unknown',
        topic: e.topics.join(', '),
        promise: e.promises[0] || 'no promise',
        timestamp: formatTimestamp(e.timestamp),
      }))
    : mockEpisodes

  // Derive active loops from people's open_loops
  const activeLoops = hasRealPeople
    ? niaPeople.flatMap((p) =>
        p.open_loops.map((loop) => `${loop} (${p.name})`)
      )
    : [
        'send repo to maya',
        'intro elijah to camera ml lead',
        'share memory schema with sara',
      ]

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 md:px-6 md:py-8">
        <header className="border border-border bg-secondary/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs tracking-widest text-muted-foreground">
                secondbrain / dashboard
              </p>
              <h1 className="text-2xl lowercase tracking-tight md:text-3xl">
                memory oracle
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {hasRealPeople && (
                <Badge
                  variant="outline"
                  className="rounded-none border-accent/40 bg-accent/10 px-2 py-1 text-[10px] tracking-widest text-accent"
                >
                  live
                </Badge>
              )}
              <Badge
                variant="outline"
                className="rounded-none border-border px-2 py-1 text-[10px] tracking-widest text-muted-foreground"
              >
                powered by nia
              </Badge>
            </div>
          </div>
        </header>

        <section
          className={`grid gap-4 ${
            sidebarOpen ? 'lg:grid-cols-[320px_1fr]' : 'grid-cols-1'
          }`}
        >
          {sidebarOpen && (
            <aside className="border border-border bg-secondary/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  people
                </p>
                <span className="text-xs lowercase text-muted-foreground">
                  {hasRealPeople ? `${displayPeople.length} known` : 'crm view'}
                </span>
              </div>

              <div className="space-y-2">
                {displayPeople.map((person) => {
                  const lastSeenLabel = hasRealPeople
                    ? relativeTime(person.last_seen)
                    : person.last_seen
                  const maybeAvatar = (person as { avatar?: string }).avatar
                  const avatar: string =
                    maybeAvatar ||
                    `https://api.dicebear.com/7.x/initials/svg?seed=${person.name}`
                  return (
                    <article
                      key={person.person_id || person.name}
                      className="border border-border bg-background/40 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <img
                            src={avatar}
                            alt={`${person.name} avatar`}
                            className="h-8 w-8 rounded-full border border-border object-cover"
                          />
                          <p className="text-sm lowercase">{person.name}</p>
                        </div>
                        <span className="text-[11px] lowercase text-muted-foreground">
                          {lastSeenLabel}
                        </span>
                      </div>
                      <p className="text-xs lowercase text-muted-foreground">
                        met at {person.where_met}
                      </p>
                      <p className="mt-2 text-xs lowercase text-foreground/90">
                        {person.summary}
                      </p>
                    </article>
                  )
                })}
              </div>

              <Separator className="my-4" />

              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  active loops
                </p>
                <span className="text-xs lowercase text-muted-foreground">
                  {activeLoops.length} open
                </span>
              </div>

              <div className="space-y-2">
                {activeLoops.map((loop) => (
                  <article
                    key={loop}
                    className="border border-border bg-background/40 p-3"
                  >
                    <p className="text-xs lowercase text-muted-foreground">
                      open loop
                    </p>
                    <p className="mt-1 text-sm lowercase">{loop}</p>
                  </article>
                ))}
              </div>
            </aside>
          )}

          <section className="border border-border bg-secondary/20 p-4">
            <Tabs defaultValue="session" className="gap-4">
              <div className="flex items-center gap-2 border border-border bg-background/40 p-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-none border-border"
                  onClick={() => setSidebarOpen((prev) => !prev)}
                  aria-label={sidebarOpen ? 'close sidebar' : 'open sidebar'}
                >
                  {sidebarOpen ? (
                    <PanelLeftClose className="h-4 w-4" />
                  ) : (
                    <PanelLeftOpen className="h-4 w-4" />
                  )}
                </Button>

                <TabsList className="h-9 w-full rounded-none border border-border bg-muted/30 p-0.5">
                  <TabsTrigger
                    value="session"
                    className="flex-1 gap-2 rounded-none px-4 lowercase data-[state=active]:shadow-none"
                  >
                    <Camera className="h-4 w-4" />
                    start session
                  </TabsTrigger>
                  <TabsTrigger
                    value="chat"
                    className="flex-1 gap-2 rounded-none px-4 lowercase data-[state=active]:shadow-none"
                  >
                    <MessageSquare className="h-4 w-4" />
                    chat
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="session" className="space-y-4">
                <SessionPanel
                  onModeChange={setSessionMode}
                  onMemorySaved={() => setRefreshKey((k) => k + 1)}
                />

                {sessionMode !== 'idle' && !hasRealPeople && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card className="rounded-none border-border bg-background/40 shadow-none">
                      <CardHeader className="gap-1 px-4 py-4">
                        <CardTitle className="flex items-center gap-2 text-sm lowercase">
                          <UserRound className="h-4 w-4 text-muted-foreground" />
                          context card
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 px-4 pb-4 text-sm lowercase">
                        <p>name: maya</p>
                        <p>where met: hackathon</p>
                        <p>last convo: voice infra demo</p>
                        <p>open loop: send repo</p>
                      </CardContent>
                    </Card>

                    <Card className="rounded-none border-border bg-background/40 shadow-none">
                      <CardHeader className="gap-1 px-4 py-4">
                        <CardTitle className="flex items-center gap-2 text-sm lowercase">
                          <Clock3 className="h-4 w-4 text-muted-foreground" />
                          open loop
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 text-sm lowercase">
                        you promised maya the repo. follow-up pending.
                      </CardContent>
                    </Card>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="chat" className="space-y-4">
                <Card className="rounded-none border-border bg-background/40 shadow-none">
                  <CardHeader className="gap-1 px-4 py-4">
                    <CardTitle className="flex items-center gap-2 text-sm lowercase">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      memory chat
                    </CardTitle>
                    <CardDescription className="text-xs lowercase">
                      llm-style retrieval with enhanced prompt box.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 px-4 pb-4">
                    {chatMessages.map((message) => (
                      <div
                        key={`${message.role}-${message.text}`}
                        className="border border-border bg-secondary/30 p-3"
                      >
                        <p className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                          {message.role === 'assistant' ? (
                            <Bot className="h-3 w-3" />
                          ) : (
                            <UserRound className="h-3 w-3" />
                          )}
                          {message.role}
                        </p>
                        <p className="text-sm lowercase">{message.text}</p>
                      </div>
                    ))}

                    <PromptInputBox
                      placeholder="ask: what did i promise maya?"
                      onSend={(message) => {
                        console.log('mock send', message)
                      }}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <Separator className="my-4" />

            <section className="grid gap-3 md:grid-cols-2">
              {displayEpisodes.map((episode, i) => (
                <article
                  key={`${episode.person}-${episode.timestamp}-${i}`}
                  className="border border-border bg-background/40 p-3"
                >
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    episode
                  </p>
                  <p className="mt-1 text-sm lowercase">
                    {episode.person} • {episode.timestamp}
                  </p>
                  <p className="mt-2 text-xs lowercase text-muted-foreground">
                    topic: {episode.topic}
                  </p>
                  <p className="mt-1 text-xs lowercase text-muted-foreground">
                    promise: {episode.promise}
                  </p>
                </article>
              ))}
            </section>
          </section>
        </section>
      </div>
    </main>
  )
}

export default function DashboardPage() {
  return (
    <RecordingProvider>
      <DashboardContent />
    </RecordingProvider>
  )
}
