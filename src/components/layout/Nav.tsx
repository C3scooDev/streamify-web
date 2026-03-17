'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAppStore } from '@/store'
import { clsx } from 'clsx'

const links = [
  { href: '/',         label: 'HOME',     icon: '◈' },
  { href: '/browse',   label: 'BROWSE',   icon: '◉' },
  { href: '/search',   label: 'SEARCH',   icon: '◎' },
  { href: '/watchlist',label: 'SAVED',    icon: '◆' },
  { href: '/settings', label: 'SETTINGS', icon: '◇' },
]

export default function Nav() {
  const pathname  = usePathname()
  const providers = useAppStore(s => s.providers)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-ink-700/50 bg-ink-900/80 backdrop-blur-md">
      <nav className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between gap-8">

        {/* Logo */}
        <Link href="/" className="font-display text-lg font-bold tracking-widest signal-text shrink-0">
          STREAMIFY
        </Link>

        {/* Links */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {links.map(({ href, label, icon }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'px-3 py-1.5 text-xs tracking-widest font-body transition-all duration-200 whitespace-nowrap',
                  active
                    ? 'signal-text border-b border-signal'
                    : 'text-ink-300 hover:text-ink-50'
                )}
              >
                <span className="mr-1.5 opacity-60">{icon}</span>
                {label}
              </Link>
            )
          })}
        </div>

        {/* Provider count badge */}
        <div className="shrink-0 text-xs text-ink-400 font-body whitespace-nowrap">
          {providers.length > 0
            ? <span className="signal-text">{providers.length}</span>
            : <span className="ember-text">0</span>
          }
          {' '}SRC
        </div>
      </nav>
    </header>
  )
}
