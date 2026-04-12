'use client'

import { useCallback, useRef, useState } from 'react'
import type {
  RecordingStatus,
  TranscriptChunk,
  TranscriptSegment,
  ExtractionResult,
  SampledFrame,
  VisualPerson,
} from '@/lib/types'
import {
  analyzeFrames,
  buildVisualPeople,
  remapChunkSpeakers,
} from '@/lib/vision-client'

// 30s chunks give whisper/gpt-4o-transcribe enough context to avoid
// mid-sentence splits that were garbling transcription at 15s.
const CHUNK_INTERVAL_MS = 30_000
const AUDIO_BITS_PER_SECOND = 128_000

// Frame sampler: one JPEG every 3s off the display video track. Used after
// stopRecording to detect Meet participants and map audio speaker labels to
// real names via an offline vision analysis pass.
const FRAME_SAMPLE_INTERVAL_MS = 3_000
const FRAME_MAX_WIDTH = 1280

function getSupportedMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ]
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return 'audio/webm'
}

// Mixes screen/tab audio and mic into a single stream via Web Audio so
// MediaRecorder can capture both simultaneously.
function mixAudioStreams(
  ctx: AudioContext,
  sources: MediaStream[]
): MediaStream {
  const destination = ctx.createMediaStreamDestination()
  for (const src of sources) {
    if (src.getAudioTracks().length === 0) continue
    const node = ctx.createMediaStreamSource(src)
    node.connect(destination)
  }
  return destination.stream
}

export function canCaptureSystemAudio(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    /Chrome|Edg/.test(navigator.userAgent)
  )
}

export function useScreenRecorder() {
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [chunks, setChunks] = useState<TranscriptChunk[]>([])
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [visualPeople, setVisualPeople] = useState<VisualPerson[]>([])
  const [isAnalyzingVision, setIsAnalyzingVision] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mixedStreamRef = useRef<MediaStream | null>(null)
  const chunkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // True while recording — gates the stop/restart cycle in startChunkCycle.
  // Flipped to false in stopRecording so the final onstop doesn't spawn
  // another recorder after we've torn everything down.
  const recordingActiveRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chunkIndexRef = useRef(0)
  const transcriptRef = useRef('')
  // Track in-flight transcription requests
  const pendingRef = useRef(0)
  const [isTranscribing, setIsTranscribing] = useState(false)
  // Speaker continuity across chunks: known labels seen so far + the last
  // segment produced, so the next chunk's segmentation can reuse labels.
  const knownSpeakersRef = useRef<string[]>([])
  const lastSegmentRef = useRef<TranscriptSegment | null>(null)
  // Parallel chunks ref so stopRecording can read the latest chunk list
  // without a stale closure over React state.
  const chunksRef = useRef<TranscriptChunk[]>([])
  // Frame sampler state: we hold an offscreen <video> bound to the display
  // stream and a setInterval that pushes JPEG blobs into framesRef every
  // FRAME_SAMPLE_INTERVAL_MS. Processed after stopRecording.
  const framesRef = useRef<SampledFrame[]>([])
  const samplerVideoRef = useRef<HTMLVideoElement | null>(null)
  const samplerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  )
  const recordingStartTsRef = useRef<number>(0)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (chunkTimeoutRef.current) {
      clearTimeout(chunkTimeoutRef.current)
      chunkTimeoutRef.current = null
    }
    if (samplerIntervalRef.current) {
      clearInterval(samplerIntervalRef.current)
      samplerIntervalRef.current = null
    }
    if (samplerVideoRef.current) {
      try {
        samplerVideoRef.current.pause()
        samplerVideoRef.current.srcObject = null
      } catch {}
      samplerVideoRef.current = null
    }
    if (mediaRecorderRef.current?.state !== 'inactive') {
      try {
        mediaRecorderRef.current?.stop()
      } catch {}
    }
    mediaRecorderRef.current = null
    mixedStreamRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop())
      micStreamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    setStream(null)
  }, [])

  // Pull one frame off the offscreen sampler video and push a JPEG blob
  // into framesRef. Downscaled to FRAME_MAX_WIDTH to keep memory + vision
  // token cost bounded. Silently skips if the video isn't ready yet.
  const captureFrame = useCallback(() => {
    const video = samplerVideoRef.current
    if (!video) return
    const sourceW = video.videoWidth
    const sourceH = video.videoHeight
    if (sourceW === 0 || sourceH === 0) return
    const scale = Math.min(1, FRAME_MAX_WIDTH / sourceW)
    const w = Math.max(1, Math.round(sourceW * scale))
    const h = Math.max(1, Math.round(sourceH * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    try {
      ctx.drawImage(video, 0, 0, w, h)
    } catch {
      return
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        framesRef.current.push({
          t_ms: Date.now() - recordingStartTsRef.current,
          blob,
          width: w,
          height: h,
        })
      },
      'image/jpeg',
      0.72
    )
  }, [])

  const transcribeChunk = useCallback(async (blob: Blob, index: number) => {
    // Skip empty chunks
    if (blob.size < 1000) return

    pendingRef.current++
    setIsTranscribing(true)

    try {
      const formData = new FormData()
      formData.append('audio', blob, `chunk-${index}.webm`)
      // Rolling context: the tail of what's been transcribed so far gives
      // the model cross-chunk continuity it otherwise lacks.
      if (transcriptRef.current) {
        formData.append('prior_context', transcriptRef.current.slice(-400))
      }
      // Speaker continuity: send the labels we've already assigned and the
      // last segment so the next chunk's segmentation can stay consistent.
      formData.append(
        'known_speakers',
        JSON.stringify(knownSpeakersRef.current)
      )
      if (lastSegmentRef.current) {
        formData.append('last_segment', JSON.stringify(lastSegmentRef.current))
      }

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })
      const { text, segments } = (await res.json()) as {
        text: string
        segments?: TranscriptSegment[]
      }

      if (text) {
        transcriptRef.current += (transcriptRef.current ? ' ' : '') + text
        setCurrentTranscript(transcriptRef.current)

        const cleanSegments: TranscriptSegment[] =
          Array.isArray(segments) && segments.length > 0
            ? segments
            : [{ speaker: 'person1', text }]

        // Update known speakers + last segment pointers for continuity.
        for (const seg of cleanSegments) {
          if (!knownSpeakersRef.current.includes(seg.speaker)) {
            knownSpeakersRef.current = [
              ...knownSpeakersRef.current,
              seg.speaker,
            ]
          }
        }
        lastSegmentRef.current = cleanSegments[cleanSegments.length - 1]

        const newChunk: TranscriptChunk = {
          text,
          timestamp: Date.now(),
          chunk_index: index,
          segments: cleanSegments,
        }
        chunksRef.current = [...chunksRef.current, newChunk]
        setChunks((prev) => [...prev, newChunk])
      }
    } catch (err) {
      console.error(`chunk ${index} transcription failed:`, err)
    } finally {
      pendingRef.current--
      if (pendingRef.current === 0) setIsTranscribing(false)
    }
  }, [])

  // Produces one complete, self-contained webm file per chunk.
  //
  // Background: MediaRecorder.start(timeslice) only writes the webm/opus
  // init segment to the FIRST dataavailable blob. Subsequent blobs are
  // raw clusters that can't be decoded standalone — whisper-1 tolerated
  // this; gpt-4o-transcribe rejects them with "audio file might be
  // corrupted". So instead we start a fresh recorder, wait 30s, stop it
  // (which gives us a complete file), transcribe, and cycle.
  const startChunkCycle = useCallback(() => {
    const mixedStream = mixedStreamRef.current
    if (!mixedStream || !recordingActiveRef.current) return

    const mimeType = getSupportedMimeType()
    const recorder = new MediaRecorder(mixedStream, {
      mimeType,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    })

    const pieces: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) pieces.push(e.data)
    }
    recorder.onstop = () => {
      // Assemble a complete standalone file from all dataavailable events
      // emitted by this recorder instance.
      if (pieces.length > 0) {
        const blob = new Blob(pieces, { type: mimeType })
        if (blob.size > 1000) {
          const index = chunkIndexRef.current++
          transcribeChunk(blob, index)
        }
      }
      // Cycle into the next chunk only if still recording.
      if (recordingActiveRef.current) {
        startChunkCycle()
      }
    }

    mediaRecorderRef.current = recorder
    // No timeslice — let the recorder buffer until we manually stop it,
    // which is what guarantees a complete, parseable webm file.
    recorder.start()

    chunkTimeoutRef.current = setTimeout(() => {
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {}
      }
    }, CHUNK_INTERVAL_MS)
  }, [transcribeChunk])

  const startRecording = useCallback(async () => {
    setError(null)
    setChunks([])
    setCurrentTranscript('')
    setExtraction(null)
    setElapsed(0)
    setVisualPeople([])
    setIsAnalyzingVision(false)
    transcriptRef.current = ''
    chunkIndexRef.current = 0
    knownSpeakersRef.current = []
    lastSegmentRef.current = null
    chunksRef.current = []
    framesRef.current = []
    recordingStartTsRef.current = Date.now()

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })

      streamRef.current = displayStream
      setStream(displayStream)

      // Bind an offscreen <video> to the display stream so we can pull
      // frames via canvas.drawImage. Muted + playsInline so autoplay is
      // allowed even though we never attach it to the DOM.
      try {
        const samplerVideo = document.createElement('video')
        samplerVideo.muted = true
        samplerVideo.playsInline = true
        samplerVideo.srcObject = displayStream
        await samplerVideo.play().catch(() => {})
        samplerVideoRef.current = samplerVideo
        samplerIntervalRef.current = setInterval(
          captureFrame,
          FRAME_SAMPLE_INTERVAL_MS
        )
      } catch (err) {
        // Sampler failure shouldn't kill the recording — audio path is
        // still the primary memory surface.
        console.error('frame sampler init failed:', err)
      }

      // Listen for user stopping the share via browser UI
      displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        stopRecording()
      })

      // Try to grab the mic in parallel — if the user denies, we fall back
      // to whatever system audio the display stream gave us.
      let micStream: MediaStream | null = null
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        })
        micStreamRef.current = micStream
      } catch {
        // Mic denied or unavailable — continue with display audio only.
      }

      const displayAudioTracks = displayStream.getAudioTracks()
      const hasDisplayAudio = displayAudioTracks.length > 0
      const hasMic = !!micStream && micStream.getAudioTracks().length > 0

      if (!hasDisplayAudio && !hasMic) {
        setError(
          'no audio captured. enable "share audio" in the browser dialog, or allow mic access.'
        )
      } else if (!hasDisplayAudio) {
        setError(
          'system audio not shared — recording mic only. tick "share audio" next time to capture both.'
        )
      } else if (!hasMic) {
        setError(
          'mic not available — recording system audio only. allow mic access to capture your voice.'
        )
      }

      if (hasDisplayAudio || hasMic) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext
        const audioContext = new AudioCtx()
        audioContextRef.current = audioContext

        const sources: MediaStream[] = []
        if (hasDisplayAudio) {
          sources.push(new MediaStream(displayAudioTracks))
        }
        if (hasMic && micStream) {
          sources.push(micStream)
        }
        const mixedStream = mixAudioStreams(audioContext, sources)
        mixedStreamRef.current = mixedStream

        recordingActiveRef.current = true
        startChunkCycle()
      }

      // Start elapsed timer
      setElapsed(0)
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1)
      }, 1000)

      setStatus('recording')
    } catch {
      setError('screen share cancelled or denied.')
      cleanup()
    }
  }, [cleanup, startChunkCycle, captureFrame])

  const stopRecording = useCallback(async () => {
    // Flip the flag FIRST so the in-flight recorder's onstop doesn't
    // start a new chunk cycle after we tear things down.
    recordingActiveRef.current = false
    if (chunkTimeoutRef.current) {
      clearTimeout(chunkTimeoutRef.current)
      chunkTimeoutRef.current = null
    }
    // Stop the current recorder — its onstop handler will assemble the
    // final blob and kick off one last transcribeChunk call.
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      try {
        mediaRecorderRef.current.stop()
      } catch {}
    }

    // Snapshot the sampled frames BEFORE cleanup so vision analysis can
    // still consume them after the stream is torn down. Clearing the ref
    // here also means a subsequent recording starts fresh.
    const capturedFrames = framesRef.current
    framesRef.current = []

    cleanup()
    setStatus('processing')

    // Wait a beat for the final onstop + transcription to finish.
    await new Promise((resolve) => setTimeout(resolve, 3000))

    const fullTranscript = transcriptRef.current

    if (!fullTranscript.trim()) {
      setStatus('idle')
      return null
    }

    // --- Vision pipeline: detect meet participants, remap speakers ---
    // Runs before extraction so the extraction pass sees real names in
    // context (the transcript text itself is unchanged — only the
    // segment speaker labels — so no content is fabricated).
    let visualPeopleResult: VisualPerson[] = []
    if (capturedFrames.length > 0) {
      setIsAnalyzingVision(true)
      try {
        const analyses = await analyzeFrames(capturedFrames)
        visualPeopleResult = await buildVisualPeople(
          capturedFrames,
          analyses
        )
        setVisualPeople(visualPeopleResult)

        // Rewrite speaker labels in place using the latest chunks ref,
        // which stays in sync with the chunks state during transcription.
        const { newChunks } = remapChunkSpeakers(
          chunksRef.current,
          analyses,
          CHUNK_INTERVAL_MS
        )
        chunksRef.current = newChunks
        setChunks(newChunks)
      } catch (err) {
        console.error('vision pipeline failed:', err)
      } finally {
        setIsAnalyzingVision(false)
      }
    }

    // Build a name → face_image lookup so person saves can attach faces
    // for the matching extracted people. normalize for comparison.
    const faceByName = new Map<string, string>()
    for (const vp of visualPeopleResult) {
      faceByName.set(vp.name.trim().toLowerCase(), vp.face_image)
    }

    try {
      // Extract structured memory
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: fullTranscript }),
      })
      const extractionResult: ExtractionResult = await extractRes.json()
      setExtraction(extractionResult)

      const now = new Date().toISOString()

      // Save episode to Nia (no dedupe — each conversation is its own episode)
      const episode = {
        episode_id: `ep_${Date.now()}`,
        person_ids: extractionResult.people.map(
          (p) => p.name.toLowerCase().replace(/\s+/g, '_')
        ),
        topics: extractionResult.topics,
        promises: extractionResult.promises,
        next_actions: extractionResult.next_actions,
        timestamp: now,
        source: 'screen' as const,
        prose: extractionResult.episode_prose,
      }

      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'episode', data: episode }),
      }).catch((err) => console.error('failed to save episode:', err))

      // Save each extracted person. Attach face_image from vision when
      // the normalized name matches a detected Meet participant.
      const extractedNameSet = new Set<string>()
      for (const person of extractionResult.people) {
        const normalized = person.name.trim().toLowerCase()
        extractedNameSet.add(normalized)
        const face_image = faceByName.get(normalized)
        const personData = {
          person_id: person.name.toLowerCase().replace(/\s+/g, '_'),
          name: person.name.toLowerCase(),
          where_met: 'screen recording',
          summary: person.role_or_context || '',
          open_loops: extractionResult.promises,
          last_seen: now,
          // Seed notes with this session's prose. On first save it becomes
          // the initial content; on dedupe it gets appended to existing notes
          // and the content is regenerated from the merged history.
          notes: person.prose_summary ? [person.prose_summary] : [],
          prose: person.prose_summary,
          face_image,
        }

        await fetch('/api/memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'person', data: personData }),
        }).catch((err) => console.error('failed to save person:', err))
      }

      // Passive enrollment: for every visual person not named in the
      // extraction, write a minimal Person record so their face thumbnail
      // is still captured for next time. They might have been silent,
      // a new coworker who wasn't called by name, etc.
      for (const vp of visualPeopleResult) {
        const normalized = vp.name.trim().toLowerCase()
        if (extractedNameSet.has(normalized)) continue
        const personData = {
          person_id: normalized.replace(/\s+/g, '_'),
          name: normalized,
          where_met: 'google meet',
          summary: 'seen on a meet call (passive enrollment)',
          open_loops: [],
          last_seen: now,
          notes: [],
          prose: `${vp.name} appeared on a google meet call on ${new Date(now).toLocaleDateString()}. captured passively from the participant grid.`,
          face_image: vp.face_image,
        }
        await fetch('/api/memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'person', data: personData }),
        }).catch((err) =>
          console.error('failed to save passive-enrolled person:', err)
        )
      }

      setStatus('idle')
      return extractionResult
    } catch (err) {
      console.error('extraction/save failed:', err)
      setError('memory extraction failed. transcript was still captured.')
      setStatus('error')
      return null
    }
  }, [cleanup])

  return {
    status,
    elapsed,
    chunks,
    currentTranscript,
    extraction,
    error,
    stream,
    isTranscribing,
    visualPeople,
    isAnalyzingVision,
    startRecording,
    stopRecording,
  }
}
