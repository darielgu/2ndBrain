"use client"

import { useState } from "react"
import { Check, Copy, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"

const INSTALL_COMMAND =
  "git clone https://github.com/darielgu/2ndBrain.git && cd 2ndBrain/frontend && npm install && npm run dev"

export default function SetupPage() {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(INSTALL_COMMAND)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="border border-border bg-background/40 p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">secondbrain / setup</p>
          <h1 className="mt-2 text-xl tracking-tight text-foreground md:text-2xl">Setup Wizard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            fastest path to run secondbrain locally in under 2 minutes.
          </p>
        </div>

        <section className="space-y-3 border border-border bg-background/30 p-4 sm:p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">step 1 — run command</p>
          <div className="border border-border bg-muted/20">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Terminal className="h-4 w-4" />
                terminal
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-7 px-2 text-xs lowercase text-muted-foreground hover:text-foreground"
              >
                {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                {copied ? "copied" : "copy"}
              </Button>
            </div>
            <div className="px-4 py-3">
              <code className="break-all text-sm text-foreground">
                <span className="text-muted-foreground">{">"}</span> {INSTALL_COMMAND}
              </code>
            </div>
          </div>
        </section>

        <section className="space-y-3 border border-border bg-background/30 p-4 sm:p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">step 2 — configure env</p>
          <p className="text-sm text-muted-foreground">
            add your keys in <code className="text-foreground">frontend/.env.local</code>:
            <span className="text-foreground"> OPENAI_API_KEY</span>, <span className="text-foreground">NIA_API_KEY</span>.
          </p>
        </section>

        <section className="space-y-3 border border-border bg-background/30 p-4 sm:p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">step 3 — open app</p>
          <p className="text-sm text-muted-foreground">
            go to <code className="text-foreground">http://localhost:3000</code>, then use onboarding and start session.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="h-9 rounded-none bg-foreground px-4 text-background hover:bg-foreground/90 lowercase text-xs">
              <a href="/">back to landing</a>
            </Button>
            <Button asChild variant="outline" className="h-9 rounded-none border-border px-4 lowercase text-xs hover:bg-muted">
              <a href="/onboarding">open onboarding</a>
            </Button>
          </div>
        </section>
      </div>
    </main>
  )
}
