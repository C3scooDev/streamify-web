import Link from 'next/link'

interface Props {
  icon:      string
  title:     string
  subtitle:  string
  action?:   { label: string; href: string }
}

export default function EmptyState({ icon, title, subtitle, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
      <div className="text-6xl mb-6 opacity-20 select-none">{icon}</div>
      <h2 className="font-display text-xl font-bold mb-2">{title}</h2>
      <p className="text-sm text-ink-400 max-w-xs mb-6">{subtitle}</p>
      {action && (
        <Link
          href={action.href}
          className="px-4 py-2 bg-signal text-ink-900 text-xs font-bold tracking-widest hover:bg-signal-dim transition-colors"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
