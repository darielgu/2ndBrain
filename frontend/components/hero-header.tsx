"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Check, Copy, Github, Terminal } from "lucide-react"
import { Space_Grotesk } from "next/font/google"
import { Button } from "@/components/ui/button"
import { AsciiSignal } from "@/components/ascii-signal"

const spaceGrotesk = Space_Grotesk({ weight: ["500", "700"], subsets: ["latin"] })

export function HeroHeader() {
  const repoUrl = "https://github.com/darielgu/2ndBrain"
  const demoVideoUrl = "https://www.youtube.com/embed/BIZgHGt1pNI"
  const installCommand =
    "curl -fsSL https://codeload.github.com/darielgu/2ndBrain/tar.gz/refs/heads/main | tar -xz && cd 2ndBrain-main/frontend && npm i && npm run dev"
  const [copied, setCopied] = useState(false)
  const [showLocalAuthCtas, setShowLocalAuthCtas] = useState(false)

  useEffect(() => {
    setShowLocalAuthCtas(window.location.host === "localhost:3000")
  }, [])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(installCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <a href="/" className="text-lg font-bold lowercase tracking-tight text-foreground">
              2ndbrain
            </a>
          </div>
          {showLocalAuthCtas ? (
            <div className="flex items-center gap-4">
              <Button asChild variant="ghost" className="text-sm lowercase text-muted-foreground hover:text-foreground">
                <a href="/dashboard/overview">sign in</a>
              </Button>
              <Button asChild className="bg-foreground text-background hover:bg-foreground/90 lowercase text-sm">
                <a href="/onboarding">get started</a>
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center md:py-32">
          {/* Eyebrow */}
          <div className="gleam-badge mb-6 inline-flex items-center gap-2 border border-border px-3 py-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center bg-white">
              <img src="/nia-logo.svg" alt="Nia logo" className="h-3 w-3 text-foreground" />
            </span>
            <span className="text-[10px] tracking-widest text-muted-foreground">
              powered by Nia
            </span>
          </div>

          {/* Main Headline */}
          <h1 className={`${spaceGrotesk.className} mb-6 text-4xl font-medium lowercase tracking-tight text-foreground md:text-6xl lg:text-7xl text-balance`}>
            bring your context into the{' '}
            <span className="font-serif italic normal-case tracking-normal">
              real world
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mb-10 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            2ndbrain brings your context into real life. remember real interactions with real people, recover
            what was said, and surface open loops before the next conversation starts.
          </p>

          {/* CTA Buttons */}
          <div className="mb-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button className="h-12 bg-foreground px-8 text-background hover:bg-foreground/90 lowercase text-sm">
              start for free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button asChild variant="outline" className="h-12 border-border px-8 text-foreground hover:bg-muted lowercase text-sm">
              <a href={repoUrl} target="_blank" rel="noreferrer">
                <Github className="mr-2 h-4 w-4" />
                github
              </a>
            </Button>
          </div>

          {/* Terminal Installation Box */}
          <div className="mx-auto max-w-md">
            <div className="border border-border bg-muted/30">
              <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">terminal</span>
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
                <code className="text-sm text-foreground break-all">
                  <span className="text-muted-foreground">{">"}</span> {installCommand}
                </code>
              </div>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-24">
          <AsciiSignal />
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-24">
          <section className="mx-auto max-w-5xl border border-border bg-muted/20 p-4 md:p-6">
            <h2 className="mb-4 text-left text-xl lowercase tracking-tight text-foreground md:text-2xl">
              see how it works
            </h2>
            <div className="relative w-full overflow-hidden border border-border bg-black pb-[56.25%]">
              <iframe
                className="absolute left-0 top-0 h-full w-full"
                src={demoVideoUrl}
                title="SecondBrain demo video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}
