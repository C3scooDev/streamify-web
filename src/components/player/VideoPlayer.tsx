'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import type { StreamLink } from '@/types'
import { clsx } from 'clsx'

interface Props {
  links:      StreamLink[]
  title:      string
  episodeId?: string
  mediaId?:   string
  providerId: string
  season?:    number
  epNumber?:  number
  onBack:     () => void
}

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

export default function VideoPlayer({
  links, title, episodeId, mediaId, providerId, season, epNumber, onBack,
}: Props) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const hlsRef     = useRef<Hls | null>(null)
  const timerRef   = useRef<ReturnType<typeof setInterval>>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [currentLink,  setCurrentLink]  = useState<StreamLink | null>(null)
  const [playing,      setPlaying]      = useState(false)
  const [currentTime,  setCurrentTime]  = useState(0)
  const [duration,     setDuration]     = useState(0)
  const [uiVisible,    setUiVisible]    = useState(true)
  const [uiTimer,      setUiTimer]      = useState<ReturnType<typeof setTimeout> | null>(null)
  const [buffering,    setBuffering]    = useState(true)
  const [fullscreen,   setFullscreen]   = useState(false)
  const [volume,       setVolume]       = useState(1)

  const progress = duration > 0 ? currentTime / duration : 0

  // ── Load stream ─────────────────────────────────────────────────────────────
  const loadLink = useCallback((link: StreamLink) => {
    const video = videoRef.current
    if (!video) return
    setCurrentLink(link)
    setBuffering(true)

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (link.type === 'hls' && Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: (xhr) => {
          if (link.headers) {
            Object.entries(link.headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
          }
        },
      })
      hls.loadSource(link.url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
      })
      hlsRef.current = hls
    } else if (link.type === 'hls' && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari)
      video.src = link.url
      video.play().catch(() => {})
    } else {
      video.src = link.url
      video.play().catch(() => {})
    }
  }, [])

  // ── Auto-load first link ─────────────────────────────────────────────────────
  useEffect(() => {
    if (links.length > 0 && !currentLink) loadLink(links[0])
  }, [links, currentLink, loadLink])

  // ── Video event listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay     = () => setPlaying(true)
    const onPause    = () => setPlaying(false)
    const onTimeUpdate = () => setCurrentTime(video.currentTime)
    const onDuration = () => setDuration(video.duration)
    const onWaiting  = () => setBuffering(true)
    const onCanPlay  = () => setBuffering(false)

    video.addEventListener('play',       onPlay)
    video.addEventListener('pause',      onPause)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDuration)
    video.addEventListener('waiting',    onWaiting)
    video.addEventListener('canplay',    onCanPlay)

    return () => {
      video.removeEventListener('play',       onPlay)
      video.removeEventListener('pause',      onPause)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDuration)
      video.removeEventListener('waiting',    onWaiting)
      video.removeEventListener('canplay',    onCanPlay)
    }
  }, [])

  // ── Progress save every 5s ──────────────────────────────────────────────────
  useEffect(() => {
    if (!episodeId || !mediaId) return
    timerRef.current = setInterval(async () => {
      const video = videoRef.current
      if (!video || video.paused || !video.duration) return
      const { progressSave } = await import('@/lib/db')
      await progressSave({
        episodeId, mediaId, providerId,
        season:     season ?? 1,
        number:     epNumber ?? 1,
        positionMs: Math.floor(video.currentTime * 1000),
        durationMs: Math.floor(video.duration * 1000),
        completed:  false,
        updatedAt:  Date.now(),
      })
    }, 5000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [episodeId, mediaId, providerId, season, epNumber])

  // ── UI auto-hide ────────────────────────────────────────────────────────────
  const showUI = useCallback(() => {
    setUiVisible(true)
    if (uiTimer) clearTimeout(uiTimer)
    const t = setTimeout(() => setUiVisible(false), 3000)
    setUiTimer(t)
  }, [uiTimer])

  // ── Seek ─────────────────────────────────────────────────────────────────────
  const seek = (pct: number) => {
    const video = videoRef.current
    if (!video || !video.duration) return
    video.currentTime = pct * video.duration
  }

  const skip = (seconds: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds))
  }

  // ── Fullscreen ───────────────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
      setFullscreen(true)
    } else {
      document.exitFullscreen()
      setFullscreen(false)
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      hlsRef.current?.destroy()
      if (timerRef.current) clearInterval(timerRef.current)
      if (uiTimer) clearTimeout(uiTimer)
    }
  }, [uiTimer])

  // ── Iframe mode (embed players: supervideo, guardahd, etc.) ─────────────────
  if (currentLink?.type === 'iframe') {
    return (
      <div ref={containerRef} className="relative w-full h-full bg-black flex flex-col">
        {/* Top bar with back + quality selector */}
        <div className="flex items-center gap-3 px-4 py-2 bg-black/80 shrink-0">
          <button onClick={onBack} className="text-white hover:text-signal transition-colors p-1">← </button>
          <span className="text-sm font-body text-white/80 truncate flex-1">{title}</span>
          {links.length > 1 && (
            <div className="flex gap-1 flex-wrap">
              {links.map((l, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentLink(l)}
                  className={`text-[10px] px-2 py-0.5 border tracking-widest transition-colors ${
                    l === currentLink
                      ? 'border-signal signal-text bg-signal/10'
                      : 'border-ink-600 text-ink-300 hover:border-signal/50'
                  }`}
                >
                  {l.label ?? `Server ${i + 1}`}
                </button>
              ))}
            </div>
          )}
        </div>
        <iframe
          key={currentLink.url}
          src={currentLink.url}
          className="flex-1 w-full border-0"
          allowFullScreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          referrerPolicy="no-referrer"
        />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black select-none"
      style={{ aspectRatio: '16/9' }}
      onMouseMove={showUI}
      onTouchStart={showUI}
      onClick={showUI}
    >
      <video
        ref={videoRef}
        className="w-full h-full"
        playsInline
        onClick={() => videoRef.current?.paused
          ? videoRef.current.play()
          : videoRef.current?.pause()
        }
      />

      {/* Buffering spinner */}
      {buffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="w-10 h-10 border-2 border-signal border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Controls overlay */}
      <div className={clsx(
        'absolute inset-0 flex flex-col justify-between transition-opacity duration-300 pointer-events-none',
        uiVisible ? 'opacity-100' : 'opacity-0'
      )}>
        {/* Top bar */}
        <div className="flex items-center gap-3 p-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-auto">
          <button
            onClick={onBack}
            className="text-white hover:text-signal transition-colors p-1"
          >
            ← 
          </button>
          <span className="text-sm font-body text-white/90 truncate">{title}</span>

          {/* Quality selector */}
          {links.length > 1 && (
            <div className="ml-auto flex gap-1">
              {links.map((l, i) => (
                <button
                  key={i}
                  onClick={() => loadLink(l)}
                  className={clsx(
                    'text-[10px] px-2 py-0.5 border tracking-widest transition-colors',
                    l === currentLink
                      ? 'border-signal signal-text bg-signal/10'
                      : 'border-ink-600 text-ink-300 hover:border-signal/50'
                  )}
                >
                  {l.label ?? l.quality ?? `Q${i+1}`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom controls */}
        <div className="p-4 bg-gradient-to-t from-black/70 to-transparent pointer-events-auto">
          {/* Seek bar */}
          <div className="relative h-1 mb-3 group cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              seek((e.clientX - rect.left) / rect.width)
            }}
          >
            <div className="absolute inset-0 bg-white/20 rounded" />
            <div
              className="absolute top-0 left-0 h-full bg-signal rounded transition-none"
              style={{ width: `${progress * 100}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-signal rounded-full -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${progress * 100}%` }}
            />
          </div>

          {/* Buttons row */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => videoRef.current?.paused
                ? videoRef.current.play()
                : videoRef.current?.pause()
              }
              className="text-white hover:text-signal transition-colors text-xl w-8"
            >
              {playing ? '⏸' : '▶'}
            </button>
            <button onClick={() => skip(-10)} className="text-white/70 hover:text-white transition-colors text-sm">−10s</button>
            <button onClick={() => skip(30)}  className="text-white/70 hover:text-white transition-colors text-sm">+30s</button>

            <span className="text-white/50 text-xs font-mono ml-1">
              {fmtTime(currentTime)} / {fmtTime(duration)}
            </span>

            {/* Volume */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => {
                  const v = volume === 0 ? 1 : 0
                  setVolume(v)
                  if (videoRef.current) videoRef.current.volume = v
                }}
                className="text-white/70 hover:text-white transition-colors text-sm"
              >
                {volume === 0 ? '🔇' : '🔊'}
              </button>
              <input
                type="range" min="0" max="1" step="0.05"
                value={volume}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setVolume(v)
                  if (videoRef.current) videoRef.current.volume = v
                }}
                className="w-16 accent-signal"
              />
            </div>

            <button
              onClick={toggleFullscreen}
              className="text-white/70 hover:text-white transition-colors text-sm ml-2"
            >
              {fullscreen ? '⊡' : '⊞'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
