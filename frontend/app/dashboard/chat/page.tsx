'use client'

import { useMemo, useState } from 'react'
import { Check, MessageSquare, UserPlus, Users } from 'lucide-react'
import { PromptInputBox } from '@/components/ui/ai-prompt-box'
import { people } from '@/lib/dashboard-data'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export default function ChatPage() {
  const [selectedPeopleIds, setSelectedPeopleIds] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const selectedPeople = useMemo(
    () => people.filter((person) => selectedPeopleIds.includes(person.id)),
    [selectedPeopleIds],
  )

  const togglePerson = (personId: string) => {
    setSelectedPeopleIds((prev) =>
      prev.includes(personId)
        ? prev.filter((id) => id !== personId)
        : [...prev, personId],
    )
  }

  const handleSend = (message: string) => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage) return

    const selectedNames = selectedPeople.map((person) => person.name).join(', ')
    const assistantText = selectedNames
      ? `context attached for ${selectedNames}. what do you want to recall first?`
      : 'memory context queued. what should i pull up?'

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', text: trimmedMessage },
      { id: `assistant-${Date.now() + 1}`, role: 'assistant', text: assistantText },
    ])
  }

  const promptBox = (
    <PromptInputBox
      placeholder="ask: what did i promise maya?"
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
              {people.map((person) => {
                const isSelected = selectedPeopleIds.includes(person.id)

                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => togglePerson(person.id)}
                    className="flex w-full items-start justify-between rounded-sm border border-transparent px-2 py-2 text-left transition-all duration-150 hover:border-border hover:bg-secondary/40"
                  >
                    <div>
                      <p className="text-xs lowercase text-foreground">{person.name}</p>
                      <p className="text-[11px] lowercase text-muted-foreground">
                        {person.whereMet} • open loop: {person.openLoop}
                      </p>
                    </div>
                    <span className="mt-0.5 h-4 w-4 text-foreground">
                      {isSelected && <Check className="h-4 w-4" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
      }
      onSend={handleSend}
    />
  )

  return (
    <div className="space-y-4">
      <div className="border border-border bg-background/40 p-3">
        <p className="text-xs tracking-widest text-muted-foreground">secondbrain / chat</p>
        <h1 className="mt-1 text-2xl lowercase tracking-tight md:text-3xl">memory chat</h1>
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
              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={`max-w-[88%] border p-3 text-sm lowercase ${
                      message.role === 'user'
                        ? 'ml-auto border-foreground/40 bg-background text-foreground'
                        : 'border-border bg-secondary/40 text-muted-foreground'
                    }`}
                  >
                    {message.text}
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
