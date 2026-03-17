'use client'
import { useState } from 'react'
import type { MediaItem } from '@/types'
import { clsx } from 'clsx'

interface Props {
  item:    MediaItem
  onClick: (item: MediaItem) => void
  size?:   'sm' | 'md' | 'lg'
}

const sizes = {
  sm: 'w-28',
  md: 'w-36',
  lg: 'w-44',
}

export default function MediaCard({ item, onClick, size = 'md' }: Props) {
  const [imgError, setImgError] = useState(false)
  const [loaded,   setLoaded]   = useState(false)

  const typeColor: Record<string, string> = {
    movie:   'bg-signal/20 text-signal',
    series:  'bg-blue-500/20 text-blue-300',
    anime:   'bg-ember/20 text-ember',
    live:    'bg-red-500/30 text-red-300',
    unknown: 'bg-ink-700 text-ink-300',
  }

  return (
    <button
      onClick={() => onClick(item)}
      className={clsx(
        'media-card group text-left shrink-0 focus-visible:outline-signal',
        sizes[size]
      )}
    >
      {/* Poster */}
      <div className="relative overflow-hidden rounded aspect-[2/3] bg-ink-800 mb-2">
        {/* Shimmer while loading */}
        {!loaded && !imgError && <div className="absolute inset-0 shimmer" />}

        {item.posterUrl && !imgError ? (
          <img
            src={item.posterUrl}
            alt={item.title}
            className={clsx(
              'w-full h-full object-cover transition-opacity duration-300',
              loaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={() => setLoaded(true)}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-display text-3xl font-bold text-ink-600 select-none">
              {item.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Type badge */}
        <div className={clsx(
          'absolute top-1.5 left-1.5 text-[9px] tracking-widest px-1.5 py-0.5 rounded font-body uppercase',
          typeColor[item.type] ?? typeColor['unknown']
        )}>
          {item.type}
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
          <div className="text-[10px] signal-text tracking-widest">▶ PLAY</div>
        </div>
      </div>

      {/* Title */}
      <p className="text-xs text-ink-100 leading-snug line-clamp-2 font-body">
        {item.title}
      </p>
      {item.year && (
        <p className="text-[10px] text-ink-500 mt-0.5 font-body">{item.year}</p>
      )}
    </button>
  )
}
