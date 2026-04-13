'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, MessageSquare, UserPlus, Users } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PromptInputBox } from '@/components/ui/ai-prompt-box'
import type { Person } from '@/lib/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type ToolCallItem = {
  id: string
  name: string
  status: 'running' | 'done' | 'error'
  arguments?: string
  result_preview?: string
  error?: string
}

type Citation = {
  context_id: string
  title: string
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  pending?: boolean
  toolCalls?: ToolCallItem[]
  citations?: Citation[]
}

type StreamPayload = Record<string, unknown>

function parseSseChunk(
  chunk: string,
  onEvent: (event: string, payload: StreamPayload) => void
) {
  const lines = chunk.split('\n')
  let event = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }

  const raw = dataLines.join('\n').trim()
  let payload: StreamPayload = {}
  if (raw) {
    try {
      payload = JSON.parse(raw) as StreamPayload
    } catch {
      payload = { message: raw }
    }
  }
  onEvent(event, payload)
}

function statusTone(status: ToolCallItem['status']): string {
  if (status === 'done') return 'text-emerald-300'
  if (status === 'error') return 'text-destructive'
  return 'text-blue-300'
}

function statusDotTone(status: ToolCallItem['status']): string {
  if (status === 'done') return 'bg-emerald-300'
  if (status === 'error') return 'bg-destructive'
  return 'bg-blue-300'
}

function StreamingMarkdown({
  text,
  pending,
}: {
  text: string
  pending: boolean
}) {
  const [displayText, setDisplayText] = useState(text)

  useEffect(() => {
    if (text === displayText) return
    if (text.length < displayText.length) {
      setDisplayText(text)
      return
    }

    const timer = window.setInterval(() => {
      setDisplayText((prev) => {
        if (prev.length >= text.length) return prev
        const step = pending ? 3 : 5
        const next = text.slice(0, prev.length + step)
        return next
      })
    }, 14)

    return () => {
      window.clearInterval(timer)
    }
  }, [displayText, pending, text])

  return (
    <div className="space-y-2 lowercase [&_a]:text-blue-300 [&_a]:underline [&_blockquote]:border-l [&_blockquote]:border-border/70 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-background/50 [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_p]:leading-relaxed [&_pre]:overflow-x-auto [&_pre]:rounded-sm [&_pre]:border [&_pre]:border-border/70 [&_pre]:bg-background/40 [&_pre]:p-2 [&_ul]:list-disc [&_ul]:space-y-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
    </div>
  )
}

export default function ChatPage() {
  const [people, setPeople] = useState<Person[]>([])
  const [selectedPeopleIds, setSelectedPeopleIds] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/memory?type=person')
      .then((r) => r.json())
      .then((data: { people?: Person[] }) => {
        if (cancelled) return
        setPeople(Array.isArray(data.people) ? data.people : [])
      })
      .catch((err) => console.error('failed to load people:', err))
    return () => {
      cancelled = true
    }
  }, [])

  const selectedPeople = useMemo(
    () => people.filter((person) => selectedPeopleIds.includes(person.person_id)),
    [people, selectedPeopleIds]
  )

  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    el.scrollTo({
      top: el.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages])

  const togglePerson = (personId: string) => {
    setSelectedPeopleIds((prev) =>
      prev.includes(personId)
        ? prev.filter((id) => id !== personId)
        : [...prev, personId],
    )
  }

  const handleSend = async (message: string, _files?: File[]) => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage || isSending) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmedMessage,
    }
    const pendingId = `assistant-${Date.now() + 1}`
    const pendingMsg: ChatMessage = {
      id: pendingId,
      role: 'assistant',
      text: '',
      pending: true,
      toolCalls: [],
      citations: [],
    }

    const nextMessages = [...messages, userMsg]
    setMessages([...nextMessages, pendingMsg])
    setIsSending(true)

    try {
      const res = await fetch('/api/chat/memory-agent?stream=1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          message: trimmedMessage,
          selected_people: selectedPeopleIds,
        }),
      })

      if (!res.ok || !res.body) {
        throw new Error(`stream failed (${res.status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const applyEvent = (event: string, payload: StreamPayload) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== pendingId) return m

            if (event === 'tool_call_started') {
              const id = String(payload.id || `tool-${Date.now()}`)
              const next: ToolCallItem = {
                id,
                name: String(payload.name || 'tool'),
                status: 'running',
                arguments:
                  payload.arguments && typeof payload.arguments === 'object'
                    ? JSON.stringify(payload.arguments)
                    : undefined,
              }
              const existing = m.toolCalls || []
              const without = existing.filter((item) => item.id !== id)
              return { ...m, toolCalls: [...without, next] }
            }

            if (event === 'tool_call_finished') {
              const id = String(payload.id || '')
              const ok = Boolean(payload.ok)
              const previewItems = Array.isArray(payload.result_preview)
                ? payload.result_preview
                    .map((row) => {
                      if (!row || typeof row !== 'object') return ''
                      const title = String((row as Record<string, unknown>).title || '').trim()
                      return title
                    })
                    .filter(Boolean)
                : []
              return {
                ...m,
                toolCalls: (m.toolCalls || []).map((item) =>
                  item.id === id
                    ? {
                        ...item,
                        status: ok ? 'done' : 'error',
                        result_preview: previewItems.join(' • '),
                        error: ok ? undefined : String(payload.error || 'tool call failed'),
                      }
                    : item,
                ),
              }
            }

            if (event === 'assistant_delta') {
              const delta = String(payload.text || '')
              return { ...m, text: `${m.text}${delta}` }
            }

            if (event === 'assistant_done') {
              const answer = String(payload.answer || m.text || '')
              const citations = Array.isArray(payload.citations)
                ? payload.citations
                    .filter((row): row is Citation => {
                      if (!row || typeof row !== 'object') return false
                      const id = (row as Record<string, unknown>).context_id
                      const title = (row as Record<string, unknown>).title
                      return typeof id === 'string' && typeof title === 'string'
                    })
                    .slice(0, 6)
                : []
              return {
                ...m,
                text: answer,
                pending: false,
                citations,
              }
            }

            if (event === 'error') {
              const message = String(payload.message || 'memory agent failed')
              return {
                ...m,
                text: m.text || message,
                pending: false,
              }
            }

            return m
          }),
        )
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        let boundary = buffer.indexOf('\n\n')

        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          if (rawEvent.trim()) {
            parseSseChunk(rawEvent, applyEvent)
          }
          boundary = buffer.indexOf('\n\n')
        }
      }

      if (buffer.trim()) {
        parseSseChunk(buffer, applyEvent)
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId && m.pending
            ? { ...m, pending: false, text: m.text || 'no response returned.' }
            : m,
        ),
      )
    } catch (err) {
      console.error('chat stream failed:', err)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? {
                ...m,
                text: 'memory lookup failed.',
                pending: false,
              }
            : m,
        ),
      )
    } finally {
      setIsSending(false)
    }
  }

  const promptBox = (
    <PromptInputBox
      placeholder="ask: what did i promise maya?"
      showSearchToggle={false}
      showThinkToggle={false}
      showCanvasToggle={false}
      leftActionsAddon={
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="ml-1 inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background/60 px-2 text-xs lowercase text-muted-foreground transition-all duration-200 hover:border-foreground/40 hover:bg-background hover:text-foreground"
            >
              <UserPlus className="h-3.5 w-3.5" />
              people
              {selectedPeople.length > 0 && (
                <span className="rounded border border-foreground/40 bg-secondary px-1 text-[10px] text-foreground">
                  {selectedPeople.length}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72 rounded-none border-border bg-background/95 p-2"
          >
            <div className="mb-2 flex items-center gap-2 border-b border-border pb-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              add indexed people
            </div>
            <div className="space-y-1">
              {people.length === 0 ? (
                <p className="px-2 py-2 text-[11px] lowercase text-muted-foreground">
                  no people indexed yet. record a session first.
                </p>
              ) : (
                people.map((person) => {
                  const isSelected = selectedPeopleIds.includes(person.person_id)
                  const openLoop =
                    person.open_loops.length > 0
                      ? person.open_loops[0]
                      : 'none'

                  return (
                    <button
                      key={person.person_id}
                      type="button"
                      onClick={() => togglePerson(person.person_id)}
                      className="flex w-full items-start justify-between rounded-sm border border-transparent px-2 py-2 text-left transition-all duration-150 hover:border-border hover:bg-secondary/40"
                    >
                      <div>
                        <p className="text-xs lowercase text-foreground">{person.name}</p>
                        <p className="text-[11px] lowercase text-muted-foreground">
                          {person.where_met || 'unknown'} • open loop: {openLoop}
                        </p>
                      </div>
                      <span className="mt-0.5 h-4 w-4 text-foreground">
                        {isSelected && <Check className="h-4 w-4" />}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      }
      onSend={handleSend}
      isLoading={isSending}
    />
  )

  return (
    <div className="micro-stagger space-y-4">
      <div className="border border-border bg-background/40 px-4 py-4 md:px-5 md:py-5">
        <h1 className="text-xl tracking-tight text-foreground md:text-2xl">Memory Chat</h1>
      </div>

      <Card className="rounded-none border-border bg-background/40 shadow-none">
        <CardHeader className="gap-1 px-4 py-4">
          <CardTitle className="flex items-center gap-2 text-sm lowercase">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            conversational retrieval
          </CardTitle>
          <CardDescription className="text-xs lowercase">
            ask about people, commitments, and prior context sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {messages.length === 0 ? (
            <div className="flex min-h-[56vh] items-center justify-center">
              <div className="w-full max-w-3xl">{promptBox}</div>
            </div>
          ) : (
            <div className="flex h-[62vh] flex-col">
              <div ref={chatScrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={`micro-enter max-w-[88%] border p-3 text-sm lowercase transition-all duration-200 hover:-translate-y-px ${
                      message.role === 'user'
                        ? 'ml-auto border-foreground/40 bg-background text-foreground'
                        : 'border-border bg-secondary/40 text-muted-foreground'
                    }`}
                  >
                    {message.text ? (
                      message.role === 'assistant' ? (
                        <StreamingMarkdown text={message.text} pending={Boolean(message.pending)} />
                      ) : (
                        <p>{message.text}</p>
                      )
                    ) : null}

                    {message.pending && !message.text ? (
                      <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-blue-300">
                        <span className="micro-pulse-dot h-1.5 w-1.5 rounded-full bg-blue-300" />
                        <span className="micro-pulse-dot h-1.5 w-1.5 rounded-full bg-blue-300 [animation-delay:120ms]" />
                        <span className="micro-pulse-dot h-1.5 w-1.5 rounded-full bg-blue-300 [animation-delay:220ms]" />
                        <span className="text-muted-foreground">thinking</span>
                      </div>
                    ) : null}

                    {message.pending && message.toolCalls && message.toolCalls.length > 0 ? (
                      <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2 text-[11px]">
                        {message.toolCalls.map((tool) => (
                          <div
                            key={tool.id}
                            className="micro-enter space-y-1 rounded-sm border border-border/70 bg-background/30 px-2 py-1.5"
                          >
                            <p className={`inline-flex items-center gap-1.5 ${statusTone(tool.status)}`}>
                              <span
                                className={`${tool.status === 'running' ? 'micro-pulse-dot' : ''} h-1.5 w-1.5 rounded-full ${statusDotTone(tool.status)}`}
                              />
                              tool {tool.name} • {tool.status}
                            </p>
                            {tool.result_preview ? (
                              <p className="text-muted-foreground">{tool.result_preview}</p>
                            ) : null}
                            {tool.error ? (
                              <p className="text-destructive">{tool.error}</p>
                            ) : null}
                          </div>
                        ))}
                        {message.pending ? (
                          <p className="micro-enter inline-flex items-center gap-1.5 text-[10px] tracking-wide text-muted-foreground">
                            <span className="micro-pulse-dot h-1.5 w-1.5 rounded-full bg-blue-300" />
                            stitching tool results into final answer
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {message.citations && message.citations.length > 0 ? (
                      <div className="mt-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                        {message.citations.map((citation) => (
                          <p key={citation.context_id}>{citation.title}</p>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
              <div className="mt-3">{promptBox}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
