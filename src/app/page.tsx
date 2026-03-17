'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'
import { getHomepage } from '@/lib/registry'
import MediaCard from '@/components/ui/MediaCard'
import EmptyState from '@/components/ui/EmptyState'
import Spinner from '@/components/ui/Spinner'
import AppShell from '@/components/layout/AppShell'
import type { MediaItem, SearchResult } from '@/types'

export default function HomePage() {
  const router    = useRouter()
  const providers = useAppStore(s => s.providers)
  const setItem   = useAppStore(s => s.setSelectedItem)
  const [rows,    setRows]    = useState<Record<string, SearchResult>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!providers.length) { setLoading(false); return }
    setLoading(true)
    Promise.allSettled(
      providers.map(async p => {
        const result = await getHomepage(p.id)
        if (result) setRows(prev => ({ ...prev, [p.id]: result }))
      })
    ).finally(() => setLoading(false))
  }, [providers])

  const handleClick = (item: MediaItem) => {
    setItem(item)
    router.push('/browse/detail')
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Hero text */}
        <div className="mb-10">
          <h1 className="font-display text-4xl md:text-6xl font-extrabold leading-none mb-2">
            YOUR<br/>
            <span className="signal-text">MEDIA</span><br/>
            CENTER
          </h1>
          <p className="text-ink-400 text-sm font-body mt-3 max-w-sm">
            Zero providers included — add your own sources in{' '}
            <a href="/settings" className="signal-text hover:underline">Settings</a>.
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <Spinner size={32} />
          </div>
        )}

        {!loading && providers.length === 0 && (
          <EmptyState
            icon="◇"
            title="No providers installed"
            subtitle="Add a repository URL in Settings to start browsing content."
            action={{ label: 'OPEN SETTINGS →', href: '/settings' }}
          />
        )}

        {/* Provider rows */}
        {providers.map(p => {
          const result = rows[p.id]
          return (
            <section key={p.id} className="mb-10">
              <div className="flex items-baseline gap-4 mb-4">
                <h2 className="font-display text-lg font-bold tracking-wide">{p.name}</h2>
                <span className="text-xs text-ink-500 font-body">{p.language?.toUpperCase()}</span>
                <a
                  href={`/browse?provider=${p.id}`}
                  className="ml-auto text-xs text-ink-400 hover:text-signal transition-colors tracking-widest"
                >
                  ALL →
                </a>
              </div>

              {!result ? (
                <div className="flex gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="w-36 aspect-[2/3] shimmer rounded" />
                  ))}
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                  {result.items.slice(0, 20).map(item => (
                    <MediaCard key={`${item.id}-${item.providerId}`} item={item} onClick={handleClick} />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </AppShell>
  )
}
