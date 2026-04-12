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

const people = [
  {
    name: 'maya',
    whereMet: 'hackathon',
    summary: 'works on voice infra',
    openLoop: 'send repo',
    lastSeen: '3h ago',
    avatar:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240&h=240&fit=crop&auto=format',
  },
  {
    name: 'elijah',
    whereMet: 'co-working loft',
    summary: 'shipping a wearables prototype',
    openLoop: 'intro to camera ml lead',
    lastSeen: 'yesterday',
    avatar:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240&h=240&fit=crop&auto=format',
  },
  {
    name: 'sara',
    whereMet: 'product meetup',
    summary: 'building agent onboarding flows',
    openLoop: 'share memory schema',
    lastSeen: '2d ago',
    avatar:
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=240&h=240&fit=crop&auto=format',
  },
]

const recentEpisodes = [
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

const activeLoops = [
  'send repo to maya',
  'intro elijah to camera ml lead',
  'share memory schema with sara',
]

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sessionMode, setSessionMode] = useState<
    'idle' | 'webcam' | 'screen'
  >('idle')

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
            <Badge
              variant="outline"
              className="rounded-none border-border px-2 py-1 text-[10px] tracking-widest text-muted-foreground"
            >
              powered by nia
            </Badge>
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
                  crm view
                </span>
              </div>

              <div className="space-y-2">
                {people.map((person) => (
                  <article
                    key={person.name}
                    className="border border-border bg-background/40 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <img
                          src={person.avatar}
                          alt={`${person.name} avatar`}
                          className="h-8 w-8 rounded-full border border-border object-cover"
                        />
                        <p className="text-sm lowercase">{person.name}</p>
                      </div>
                      <span className="text-[11px] lowercase text-muted-foreground">
                        {person.lastSeen}
                      </span>
                    </div>
                    <p className="text-xs lowercase text-muted-foreground">
                      met at {person.whereMet}
                    </p>
                    <p className="mt-2 text-xs lowercase text-foreground/90">
                      {person.summary}
                    </p>
                  </article>
                ))}
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
                <SessionPanel onModeChange={setSessionMode} />

                {sessionMode !== 'idle' && (
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
              {recentEpisodes.map((episode) => (
                <article
                  key={`${episode.person}-${episode.timestamp}`}
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
