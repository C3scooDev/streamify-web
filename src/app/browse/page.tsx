'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAppStore } from '@/store'
import { getHomepage, search } from '@/lib/registry'
import MediaCard from '@/components/ui/MediaCard'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import AppShell from '@/components/layout/AppShell'
import type { MediaItem } from '@/types'
import { clsx } from 'clsx'

function BrowseContent() {
  const router      = useRouter()
  const params      = useSearchParams()
  const providers   = useAppStore(s => s.providers)
  const setItem     = useAppStore(s => s.setSelectedItem)

  const [activeId,  setActiveId]  = useState<string>(params.get('provider') ?? '')
  const [items,     setItems]     = useState<MediaItem[]>([])
  const [loading,   setLoading]   = useState(false)

  const activeProvider = providers.find(p => p.id === activeId) ?? providers[0]

  useEffect(() => {
    if (!activeProvider) return
    setLoading(true)
    setItems([])
    getHomepage(activeProvider.id).then(result => {
      setItems(result?.items ?? [])
    }).finally(() => setLoading(false))
  }, [activeProvider])

  const handleClick = (item: MediaItem) => {
    setItem(item)
    router.push('/browse/detail')
  }

  if (providers.length === 0) {
    return (
      <EmptyState
        icon="◉"
        title="No providers installed"
        subtitle="Add a repository in Settings to browse content."
        action={{ label: 'OPEN SETTINGS →', href: '/settings' }}
      />
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-bold mb-6 tracking-wide">BROWSE</h1>

      {/* Provider tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1 scrollbar-none border-b border-ink-800">
        {providers.map(p => (
          <button
            key={p.id}
            onClick={() => setActiveId(p.id)}
            className={clsx(
              'px-4 py-2 text-xs tracking-widest font-body shrink-0 transition-all border-b-2 -mb-px',
              activeProvider?.id === p.id
                ? 'signal-text border-signal'
                : 'text-ink-400 border-transparent hover:text-ink-200'
            )}
          >
            {p.name}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      )}

      {!loading && items.length === 0 && (
        <p className="text-center text-ink-500 py-16 font-body text-sm">
          No content available for this provider.
        </p>
      )}

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {items.map(item => (
            <MediaCard
              key={`${item.id}-${item.providerId}`}
              item={item}
              onClick={handleClick}
              size="sm"
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function BrowsePage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="flex justify-center py-16"><Spinner size={32}/></div>}>
        <BrowseContent />
      </Suspense>
    </AppShell>
  )
}
