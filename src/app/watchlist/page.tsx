'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'
import { watchlistGetAll, watchlistRemove } from '@/lib/db'
import AppShell from '@/components/layout/AppShell'
import EmptyState from '@/components/ui/EmptyState'
import type { WatchlistEntry } from '@/types'

export default function WatchlistPage() {
  const router  = useRouter()
  const setItem = useAppStore(s => s.setSelectedItem)
  const [items, setItems] = useState<WatchlistEntry[]>([])

  useEffect(() => {
    watchlistGetAll().then(setItems)
  }, [])

  const handleRemove = async (e: React.MouseEvent, entry: WatchlistEntry) => {
    e.stopPropagation()
    await watchlistRemove(entry.mediaId, entry.providerId)
    setItems(prev => prev.filter(i => i.id !== entry.id))
  }

  const handleClick = (entry: WatchlistEntry) => {
    setItem({
      id: entry.mediaId, title: entry.title,
      providerId: entry.providerId, posterUrl: entry.posterUrl,
      url: entry.url, type: entry.type, year: entry.year,
      genres: [], extra: {},
    })
    router.push('/browse/detail')
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="font-display text-2xl font-bold mb-6 tracking-wide">SAVED</h1>

        {items.length === 0 ? (
          <EmptyState
            icon="◆"
            title="Nothing saved yet"
            subtitle="Tap ◇ on any title to save it here."
            action={{ label: 'BROWSE →', href: '/' }}
          />
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {items.map(entry => (
              <div
                key={entry.id}
                className="group relative cursor-pointer"
                onClick={() => handleClick(entry)}
              >
                <div className="aspect-[2/3] overflow-hidden rounded bg-ink-800 media-card">
                  {entry.posterUrl ? (
                    <img src={entry.posterUrl} alt={entry.title}
                      className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="font-display text-3xl text-ink-600">
                        {entry.title.charAt(0)}
                      </span>
                    </div>
                  )}
                  {/* Remove button */}
                  <button
                    onClick={(e) => handleRemove(e, entry)}
                    className="absolute top-1.5 right-1.5 w-5 h-5 bg-black/60 text-ink-300 hover:text-ember text-xs opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-xs text-ink-200 mt-1.5 line-clamp-2 font-body">{entry.title}</p>
                {entry.year && <p className="text-[10px] text-ink-500 font-body">{entry.year}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
