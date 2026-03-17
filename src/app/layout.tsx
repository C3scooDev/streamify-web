import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title:       'Streamify',
  description: 'Open media center — add your own providers',
}

export const viewport: Viewport = {
  themeColor: '#080806',
  width:      'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className="dark">
      <body className="min-h-screen bg-ink-900 text-ink-50 antialiased">
        {children}
      </body>
    </html>
  )
}
