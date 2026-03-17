'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'
import { loadDetail, getLinks } from '@/lib/registry'
import { watchlistAdd, watchlistRemove, watchlistIsIn } from '@/lib/db'
import VideoPlayer from '@/components/player/VideoPlayer'
import MediaCard from '@/components/ui/MediaCard'
import Spinner from '@/components/ui/Spinner'
import AppShell from '@/components/layout/AppShell'
import type { MediaDetail, StreamLink, Episode } from '@/types'
import { clsx } from 'clsx'

export default function DetailPage() {
  const router      = useRouter()
  const item        = useAppStore(s => s.selectedItem)
  const setItem     = useAppStore(s => s.setSelectedItem)

  const [detail,      setDetail]      = useState<MediaDetail | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [inWatchlist, setInWatchlist] = useState(false)
  const [selSeason,   setSelSeason]   = useState(0)
  const [playerLinks, setPlayerLinks] = useState<StreamLink[] | null>(null)
  const [playerEp,    setPlayerEp]    = useState<Episode | null>(null)
  const [loadingPlay, setLoadingPlay] = useState<string | null>(null) // episode id
  const [expanded,    setExpanded]    = useState(false)

  useEffect(() => {
    if (!item) { router.push('/'); return }
    setLoading(true)
    setDetail(null)
    setPlayerLinks(null)

    Promise.all([
      loadDetail(item),
      watchlistIsIn(item.id, item.providerId),
    ]).then(([d, inList]) => {
      setDetail(d)
      setInWatchlist(inList)
    }).finally(() => setLoading(false))
  }, [item, router])

  const toggleWatchlist = async () => {
    if (!item) return
    if (inWatchlist) {
      await watchlistRemove(item.id, item.providerId)
      setInWatchlist(false)
    } else {
      await watchlistAdd({
        mediaId:    item.id,
        providerId: item.providerId,
        title:      item.title,
        posterUrl:  item.posterUrl,
        url:        item.url,
        type:       item.type,
        year:       item.year,
      })
      setInWatchlist(true)
    }
  }

  const playEpisode = async (ep: Episode) => {
    if (!ep.url || !item) return
    setLoadingPlay(ep.id)
    try {
      const links = await getLinks(ep.url, item.providerId, ep.extra)
      setPlayerEp(ep)
      setPlayerLinks(links)
    } finally {
      setLoadingPlay(null)
    }
  }

  const playMovie = async () => {
    if (!item?.url) return
    setLoadingPlay('movie')
    try {
      const links = await getLinks(item.url, item.providerId, item.extra)
      setPlayerLinks(links)
    } finally {
      setLoadingPlay(null)
    }
  }

  if (!item) return null

  if (loading) {
    return (
      <AppShell>
        <div className="flex justify-center py-24"><Spinner size={40} /></div>
      </AppShell>
    )
  }

  const d       = detail
  const seasons = d?.seasons ?? []
  const related = d?.related ?? []
  const info    = d?.item ?? item

  return (
    <AppShell>
      {/* Player overlay */}
      {playerLinks && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <VideoPlayer
            links={playerLinks}
            title={playerEp
              ? `${info.title} — ${playerEp.title ?? `Ep. ${playerEp.number}`}`
              : info.title
            }
            episodeId={playerEp?.id}
            mediaId={item.id}
            providerId={item.providerId}
            season={playerEp?.season}
            epNumber={playerEp?.number}
            onBack={() => { setPlayerLinks(null); setPlayerEp(null) }}
          />
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Back */}
        <button onClick={() => router.back()} className="text-xs text-ink-500 hover:text-signal mb-6 transition-colors font-body tracking-widest">
          ← BACK
        </button>

        {/* Top section */}
        <div className="flex gap-6 mb-8">
          {/* Poster */}
          <div className="shrink-0 w-32 md:w-44">
            {info.posterUrl ? (
              <img src={info.posterUrl} alt={info.title}
                className="w-full aspect-[2/3] object-cover rounded" />
            ) : (
              <div className="w-full aspect-[2/3] bg-ink-800 rounded flex items-center justify-center">
                <span className="font-display text-4xl text-ink-600">{info.title.charAt(0)}</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3 mb-1">
              <h1 className="font-display text-2xl md:text-4xl font-extrabold leading-tight flex-1">
                {info.title}
              </h1>
              <button
                onClick={toggleWatchlist}
                className={clsx(
                  'shrink-0 text-lg transition-colors mt-1',
                  inWatchlist ? 'signal-text' : 'text-ink-600 hover:text-ink-300'
                )}
                title={inWatchlist ? 'Remove from saved' : 'Save'}
              >
                {inWatchlist ? '◆' : '◇'}
              </button>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              {info.year && (
                <span className="text-xs bg-ink-800 px-2 py-0.5 font-body">{info.year}</span>
              )}
              {info.rating && (
                <span className="text-xs bg-signal/20 signal-text px-2 py-0.5 font-body">
                  ★ {info.rating.toFixed(1)}
                </span>
              )}
              <span className="text-xs bg-ink-800 text-ink-300 px-2 py-0.5 uppercase font-body">
                {info.type}
              </span>
              {info.genres.slice(0, 3).map(g => (
                <span key={g} className="text-xs border border-ink-700 text-ink-400 px-2 py-0.5 font-body">{g}</span>
              ))}
            </div>

            {/* Description */}
            {info.description && (
              <div className="mb-4">
                <p className={clsx(
                  'text-sm text-ink-300 font-body leading-relaxed',
                  !expanded && 'line-clamp-3'
                )}>
                  {info.description}
                </p>
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs signal-text mt-1 hover:underline font-body"
                >
                  {expanded ? 'Show less' : 'Show more'}
                </button>
              </div>
            )}

            {/* Play button (movies) */}
            {info.type === 'movie' && info.url && (
              <button
                onClick={playMovie}
                disabled={loadingPlay === 'movie'}
                className="flex items-center gap-2 px-5 py-2.5 bg-signal text-ink-900 text-sm font-bold tracking-widest hover:bg-signal-dim transition-colors disabled:opacity-50"
              >
                {loadingPlay === 'movie' ? <Spinner size={16} /> : '▶'}
                PLAY
              </button>
            )}
          </div>
        </div>

        {/* Episodes */}
        {seasons.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="font-display font-bold tracking-wide">EPISODES</h2>
              {seasons.length > 1 && (
                <div className="flex gap-1 overflow-x-auto scrollbar-none">
                  {seasons.map((s, i) => (
                    <button
                      key={s.number}
                      onClick={() => setSelSeason(i)}
                      className={clsx(
                        'px-3 py-1 text-xs border shrink-0 tracking-widest transition-colors',
                        selSeason === i
                          ? 'border-signal signal-text bg-signal/10'
                          : 'border-ink-700 text-ink-400 hover:border-ink-500'
                      )}
                    >
                      S{s.number}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1">
              {seasons[selSeason]?.episodes.map(ep => (
                <button
                  key={ep.id}
                  onClick={() => playEpisode(ep)}
                  disabled={!ep.url || loadingPlay === ep.id}
                  className="w-full flex items-center gap-4 p-3 bg-ink-800/50 hover:bg-ink-800 border border-transparent hover:border-ink-700 transition-all text-left disabled:opacity-40 group"
                >
                  {/* Thumbnail */}
                  {ep.thumbnailUrl ? (
                    <img src={ep.thumbnailUrl} alt="" className="w-20 h-12 object-cover rounded shrink-0" />
                  ) : (
                    <div className="w-20 h-12 bg-ink-700 rounded shrink-0 flex items-center justify-center text-ink-500 text-sm font-body">
                      {ep.number}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-body truncate">
                      {ep.title ?? `Episode ${ep.number}`}
                    </p>
                    {ep.description && (
                      <p className="text-xs text-ink-500 truncate mt-0.5">{ep.description}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-ink-600 group-hover:text-signal transition-colors">
                    {loadingPlay === ep.id ? <Spinner size={16} /> : '▶'}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Related */}
        {related.length > 0 && (
          <section>
            <h2 className="font-display font-bold tracking-wide mb-4">RELATED</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
              {related.slice(0, 15).map(r => (
                <MediaCard
                  key={`${r.id}-${r.providerId}`}
                  item={r}
                  onClick={(i) => { setItem(i); window.scrollTo(0,0) }}
                  size="sm"
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  )
}
