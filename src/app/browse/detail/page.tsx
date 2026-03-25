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
      if (links.length > 0) setPlayerLinks(links)
    } finally {
      setLoadingPlay(null)
    }
  }

  const playMovie = async () => {
    // Use detail.item.extra so watchUrl (set by scrapeHtmlDetail) is available
    const playItem = detail?.item ?? item
    if (!playItem?.url) return
    setLoadingPlay('movie')
    try {
      const links = await getLinks(playItem.url, playItem.providerId, playItem.extra)
      if (links.length > 0) setPlayerLinks(links)
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
  const backgroundUrl = info.backdropUrl ?? info.posterUrl

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

        {/* Backdrop Header */}
        {backgroundUrl && (
          <div className="relative mb-10 -mx-4 md:mx-0 md:rounded-lg overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent z-10" />
            <img
              src={backgroundUrl}
              alt=""
              className="w-full h-56 md:h-96 object-cover opacity-35 blur-[2px] scale-110"
            />
          </div>
        )}

        {/* Top section */}
        <div className="flex gap-6 mb-8 -mt-28 md:-mt-40 relative z-20">
          {/* Poster */}
          <div className="shrink-0 w-36 md:w-52">
            {info.posterUrl ? (
              <img
                src={info.posterUrl}
                alt={info.title}
                className="w-full aspect-[2/3] object-cover rounded-lg shadow-2xl border-2 border-ink-800"
              />
            ) : (
              <div className="w-full aspect-[2/3] bg-ink-800 rounded-lg shadow-2xl flex items-center justify-center">
                <span className="font-display text-4xl text-ink-600">{info.title.charAt(0)}</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 pt-16 md:pt-20">
            <div className="flex items-start gap-3 mb-2">
              <h1 className="font-display text-2xl md:text-4xl font-extrabold leading-tight flex-1">
                {info.title}
              </h1>
              <button
                onClick={toggleWatchlist}
                className={clsx(
                  'shrink-0 text-2xl transition-colors mt-1',
                  inWatchlist ? 'signal-text' : 'text-ink-600 hover:text-ink-300'
                )}
                title={inWatchlist ? 'Rimuovi dai salvati' : 'Salva'}
              >
                {inWatchlist ? '★' : '☆'}
              </button>
            </div>

            {/* Metadata Tags */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {info.year && (
                <span className="text-sm text-ink-300 font-body">{info.year}</span>
              )}
              <span className="text-ink-600">•</span>
              <span className="text-sm text-ink-400 font-body capitalize">
                {info.type === 'series' ? 'Serie TV' : 'Film'}
              </span>
              {seasons.length > 0 && (
                <>
                  <span className="text-ink-600">•</span>
                  <span className="text-sm text-ink-400 font-body">
                    {seasons.length} {seasons.length === 1 ? 'Stagione' : 'Stagioni'}
                  </span>
                </>
              )}
              {info.rating && (
                <>
                  <span className="text-ink-600">•</span>
                  <span className="text-sm signal-text font-body">
                    ★ {info.rating.toFixed(1)}
                  </span>
                </>
              )}
            </div>

            {/* Genres */}
            {info.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {info.genres.map(g => (
                  <span key={g} className="text-xs bg-ink-800/80 text-ink-300 px-3 py-1 rounded-full font-body">{g}</span>
                ))}
              </div>
            )}

            {/* Play button (movies and unknown-type items) */}
            {(info.type === 'movie' || info.type === 'unknown') && info.url && (
              <button
                onClick={playMovie}
                disabled={loadingPlay === 'movie'}
                className="flex items-center gap-3 px-6 py-3 bg-signal text-ink-900 text-sm font-bold tracking-widest hover:bg-signal-dim transition-colors disabled:opacity-50 rounded"
              >
                {loadingPlay === 'movie' ? <Spinner size={18} /> : '▶'}
                GUARDA ORA
              </button>
            )}
          </div>
        </div>

        {/* Description Section */}
        {info.description && (
          <section className="mb-8 bg-ink-900/50 rounded-lg p-6">
            <h2 className="font-display font-bold tracking-wide mb-3 text-sm uppercase text-ink-400">Trama</h2>
            <p className={clsx(
              'text-sm text-ink-200 font-body leading-relaxed',
              !expanded && 'line-clamp-4'
            )}>
              {info.description}
            </p>
            {info.description.length > 200 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-sm signal-text mt-3 hover:underline font-body"
              >
                {expanded ? 'Mostra meno' : 'Mostra di più'}
              </button>
            )}
          </section>
        )}

        {/* Episodes */}
        {seasons.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="font-display font-bold tracking-wide">EPISODI</h2>
              {seasons.length > 1 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-none">
                  {seasons.map((s, i) => (
                    <button
                      key={s.number}
                      onClick={() => setSelSeason(i)}
                      className={clsx(
                        'px-4 py-2 text-sm rounded-full transition-colors whitespace-nowrap',
                        selSeason === i
                          ? 'bg-signal text-ink-900 font-bold'
                          : 'bg-ink-800 text-ink-400 hover:bg-ink-700'
                      )}
                    >
                      Stagione {s.number}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-3">
              {seasons[selSeason]?.episodes.map((ep, idx) => (
                <button
                  key={ep.id}
                  onClick={() => playEpisode(ep)}
                  disabled={!ep.url || loadingPlay === ep.id}
                  className="w-full flex items-center gap-4 p-4 bg-ink-900/50 hover:bg-ink-800 rounded-lg border border-ink-800 hover:border-ink-600 transition-all text-left disabled:opacity-40 group"
                >
                  {/* Episode Number / Thumbnail */}
                  {ep.thumbnailUrl ? (
                    <img src={ep.thumbnailUrl} alt="" className="w-36 h-20 object-cover rounded shrink-0" />
                  ) : (
                    <div className="w-36 h-20 bg-ink-800 rounded shrink-0 flex items-center justify-center border border-ink-700">
                      <span className="text-3xl font-bold text-ink-600">{ep.number}</span>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-ink-500 font-body uppercase tracking-widest truncate">
                      Episodio {ep.number}
                    </p>
                    <p className="text-sm font-bold font-body truncate mt-1">
                      {ep.description ?? ep.title ?? `Episodio ${ep.number}`}
                    </p>
                  </div>

                  <div className="shrink-0">
                    {loadingPlay === ep.id ? (
                      <Spinner size={20} />
                    ) : (
                      <span className="w-10 h-10 rounded-full bg-signal/20 flex items-center justify-center text-signal group-hover:bg-signal group-hover:text-ink-900 transition-all">
                        ▶
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Related */}
        {related.length > 0 && (
          <section className="mb-8">
            <h2 className="font-display font-bold tracking-wide mb-4">SIMILI</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
              {related.slice(0, 15).map(r => (
                <div key={`${r.id}-${r.providerId}`} className="shrink-0 w-32 md:w-40">
                  <MediaCard
                    item={r}
                    onClick={(i) => { setItem(i); window.scrollTo(0,0) }}
                    size="sm"
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  )
}
