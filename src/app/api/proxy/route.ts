// Next.js API route — acts as CORS proxy for all provider requests
// On Cloudflare Pages this runs as an Edge Function
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

// Domains that should never be proxied (security)
const BLOCKED = ['localhost', '127.0.0.1', '0.0.0.0', '169.254', '10.', '192.168.', '172.']

interface ProxyBody {
  url:       string
  headers?:  Record<string, string>
  accept?:   'html' | 'json'
  method?:   'GET' | 'POST'
  formBody?: string
}

export async function POST(req: NextRequest) {
  let body: ProxyBody
  try {
    body = await req.json() as ProxyBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { url, headers = {}, accept = 'json' } = body

  // Validate URL
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  }

  let parsed: URL
  try { parsed = new URL(url) } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  // Allow same-origin (e.g. app serving its own manifest at /test.json)
  const requestHost = req.headers.get('host')?.split(':')[0] ?? ''
  const isSameOrigin = parsed.hostname === requestHost

  // Block private/local addresses (unless same-origin)
  if (!isSameOrigin && BLOCKED.some(b => parsed.hostname.includes(b))) {
    return NextResponse.json({ error: 'Blocked' }, { status: 403 })
  }

  // Forward request with browser-like headers
  const fetchHeaders: Record<string, string> = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    'Accept':          accept === 'json'
      ? 'application/json, text/plain, */*'
      : 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control':   'no-cache',
    ...headers,
  }

  try {
    const upstreamMethod = body.method === 'POST' ? 'POST' : 'GET'
    const upstream = await fetch(url, {
      method:  upstreamMethod,
      headers: {
        ...fetchHeaders,
        ...(body.formBody ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body:    body.formBody ?? undefined,
      redirect: 'follow',
    })

    const text = await upstream.text()

    // If JSON was requested and the response is JSON, return parsed
    if (accept === 'json') {
      try {
        const json = JSON.parse(text)
        return NextResponse.json(json, {
          headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
        })
      } catch {
        // Response wasn't JSON — return raw text anyway
        return new NextResponse(text, {
          headers: {
            'Content-Type': 'text/plain',
            'Cache-Control': 's-maxage=30',
          },
        })
      }
    }

    return new NextResponse(text, {
      headers: {
        'Content-Type':  'text/html; charset=utf-8',
        'Cache-Control': 's-maxage=60, stale-while-revalidate=120',
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: `Upstream fetch failed: ${err}` },
      { status: 502 }
    )
  }
}
