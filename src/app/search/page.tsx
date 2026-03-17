'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'
import { search } from '@/lib/registry'
import MediaCard from '@/components/ui/MediaCard'
import Spinner from '@/components/ui/Spinner'
import AppShell from '@/components/layout/AppShell'
import type { MediaItem } from '@/types'
import { clsx } from 'clsx'

export default function SearchPage() {
  const router    = useRouter()
  const providers = useAppStore(s => s.providers)
  const setItem   = useAppStore(s => s.setSelectedItem)

  const [query,      setQuery]      = useState('')
  const [results,    setResults]    = useState<MediaItem[]>([])
  const [searching,  setSearching]  = useState(false)
  const [searched,   setSearched]   = useState(false)
  const [providerId, setProviderId] = useState<string | undefined>()

  const runSearch = useCallback(async (q: string, pid?: string) => {
    if (!q.trim()) return
    setSearching(true)
    setSearched(false)
    try {
      const items = await search(q.trim(), pid)
      setResults(items)
    } finally {
      setSearching(false)
      setSearched(true)
    }
  }, [])

  const handleClick = (item: MediaItem) => {
    setItem(item)
    router.push('/browse/detail')
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Search input */}
        <div className="mb-6">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-500 text-sm">◎</span>
            <input
              type="search"
              placeholder="Search titles..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch(query, providerId)}
              className="w-full bg-ink-800 border border-ink-700 text-ink-50 pl-10 pr-4 py-3 font-body text-sm focus:outline-none focus:border-signal transition-colors placeholder:text-ink-600"
              autoFocus
            />
            <button
              onClick={() => runSearch(query, providerId)}
              className="absolute right-0 top-0 bottom-0 px-5 bg-signal text-ink-900 text-xs font-bold tracking-widest hover:bg-signal-dim transition-colors"
            >
              SEARCH
            </button>
          </div>

          {/* Provider filter */}
          {providers.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => { setProviderId(undefined); if (query) runSearch(query) }}
                className={clsx(
                  'px-3 py-1 text-xs tracking-widest border shrink-0 transition-colors',
                  !providerId
                    ? 'border-signal signal-text bg-signal/10'
                    : 'border-ink-700 text-ink-400 hover:border-ink-500'
                )}
              >
                ALL
              </button>
              {providers.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setProviderId(p.id); if (query) runSearch(query, p.id) }}
                  className={clsx(
                    'px-3 py-1 text-xs tracking-widest border shrink-0 transition-colors',
                    providerId === p.id
                      ? 'border-signal signal-text bg-signal/10'
                      : 'border-ink-700 text-ink-400 hover:border-ink-500'
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        {searching && (
          <div className="flex justify-center py-16"><Spinner size={32} /></div>
        )}

        {!searching && searched && results.length === 0 && (
          <p className="text-center text-ink-500 py-16 font-body">
            No results for <span className="signal-text">"{query}"</span>
          </p>
        )}

        {!searching && results.length > 0 && (
          <>
            <p className="text-xs text-ink-500 mb-4 font-body">
              {results.length} results
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {results.map(item => (
                <MediaCard
                  key={`${item.id}-${item.providerId}`}
                  item={item}
                  onClick={handleClick}
                  size="sm"
                />
              ))}
            </div>
          </>
        )}

        {!searching && !searched && (
          <div className="text-center py-24">
            <div className="text-5xl mb-4 opacity-10">◎</div>
            <p className="text-ink-500 text-sm font-body">
              {providers.length === 0
                ? 'No providers installed — add one in Settings'
                : `Search across ${providers.length} provider${providers.length > 1 ? 's' : ''}`
              }
            </p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
