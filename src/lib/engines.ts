// Provider engines — mirrors Flutter's ApiJsonEngine + ScraperHtmlEngine
// All HTTP calls go through /api/proxy to avoid CORS

import type {
  ProviderConfig, MediaItem, MediaDetail, SearchResult,
  StreamLink, Season, Episode, MediaType,
} from '@/types'

// ── Proxy fetch ───────────────────────────────────────────────────────────────

async function proxied(
  url: string,
  headers: Record<string, string> = {},
  accept: 'html' | 'json' = 'json'
): Promise<string> {
  const res = await fetch('/api/proxy', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ url, headers, accept }),
  })
  if (!res.ok) throw new Error(`Proxy error ${res.status} for ${url}`)
  return res.text()
}

async function proxiedJson(url: string, headers: Record<string, string> = {}) {
  const text = await proxied(url, headers, 'json')
  return JSON.parse(text)
}

async function proxiedHtml(url: string, headers: Record<string, string> = {}) {
  return proxied(url, headers, 'html')
}

// ── Inertia page extractor ────────────────────────────────────────────────────

async function getInertiaProps(url: string, headers: Record<string, string> = {}) {
  const html  = await proxiedHtml(url, headers)
  const match = html.match(/data-page="([^"]+)"/)
  if (!match) return {}
  const raw = match[1]
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&amp;', '&')
  try { return JSON.parse(raw)?.props ?? {} } catch { return {} }
}

// ── URL builder ───────────────────────────────────────────────────────────────

function buildUrl(baseUrl: string, path: string): string {
  if (path.startsWith('http')) return path
  return baseUrl.replace(/\/$/, '') + path
}

function fill(tpl: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, v), tpl
  )
}

// ── Image resolution ──────────────────────────────────────────────────────────

function resolveImage(config: ProviderConfig, filename?: string): string | undefined {
  if (!filename) return undefined
  if (filename.startsWith('http')) return filename
  if (!config.imageBaseUrl) return undefined
  return `${config.imageBaseUrl.replace(/\/$/, '')}/${filename}`
}

function pickImage(config: ProviderConfig, images: unknown[], type: string): string | undefined {
  for (const img of images) {
    if (img && typeof img === 'object' && (img as Record<string,unknown>)['type'] === type) {
      return resolveImage(config, (img as Record<string,unknown>)['filename'] as string)
    }
  }
  return undefined
}

// ── ApiJsonEngine ─────────────────────────────────────────────────────────────

function titleFromJson(config: ProviderConfig, j: Record<string, unknown>): MediaItem {
  const images  = (j['images'] as unknown[]) ?? []
  const typeStr = (j['type'] as string) ?? 'movie'
  const id      = j['id']?.toString() ?? ''
  const slug    = (j['slug'] as string) ?? ''

  const epTpl  = config.endpoints['detail'] ?? '/titles/{id}-{slug}'
  const detailUrl = buildUrl(config.baseUrl, fill(epTpl, { id, slug }))

  return {
    id,
    title:       (j['name'] as string) ?? (j['title'] as string) ?? '',
    providerId:  config.id,
    posterUrl:   pickImage(config, images, 'poster'),
    backdropUrl: pickImage(config, images, 'background') ?? pickImage(config, images, 'cover'),
    year:        parseYear((j['last_air_date'] as string) ?? (j['release_date'] as string)),
    rating:      parseRating(j),
    type:        (typeStr === 'tv' ? 'series' : 'movie') as MediaType,
    genres:      ((j['tags'] as string[]) ?? []),
    url:         (j['url'] as string) ?? detailUrl,
    extra:       {
      slug,
      seasons_count: j['seasons_count'] ?? 0,
      sub_ita:       j['sub_ita'] ?? false,
    },
  }
}

function parseYear(s?: string): number | undefined {
  if (!s) return undefined
  return parseInt(s.split('-')[0]) || undefined
}

function parseRating(j: Record<string, unknown>): number | undefined {
  const raw = j['score'] ?? j['rating']
  if (raw == null) return undefined
  const d = parseFloat(String(raw))
  return isNaN(d) ? undefined : (d > 10 ? d / 1000 : d)
}

export async function apiJsonSearch(
  config: ProviderConfig, query: string, page = 1
): Promise<SearchResult> {
  const tpl  = config.endpoints['search'] ?? '/api/search?q={query}'
  const path = fill(tpl, { query: encodeURIComponent(query) })
  const data = await proxiedJson(buildUrl(config.baseUrl, path), config.headers)
  const list = (data['data'] ?? data['titles'] ?? data['results'] ?? []) as Record<string, unknown>[]
  return { items: list.map(j => titleFromJson(config, j)), hasNextPage: false }
}

export async function apiJsonDetail(
  config: ProviderConfig, item: MediaItem
): Promise<MediaDetail> {
  if (!item.url) return { item, seasons: [], related: [] }
  const props    = await getInertiaProps(item.url, config.headers)
  const tj       = props['title'] as Record<string, unknown> | undefined
  const enriched = tj
    ? { ...titleFromJson(config, { ...tj, url: item.url }),
        description: (tj['plot'] as string) ?? (tj['description'] as string) }
    : item

  const seasons: Season[] = []
  if (enriched.type === 'series') {
    const count = (enriched.extra['seasons_count'] as number) ?? 0
    for (let s = 1; s <= count; s++) {
      const season = await loadSeason(config, enriched.id, s)
      if (season) seasons.push(season)
    }
  }

  const related: MediaItem[] = ((props['sliders'] as unknown[]) ?? [])
    .flatMap((sl: unknown) => {
      const s = sl as Record<string, unknown>
      return ((s['titles'] as unknown[]) ?? [])
        .map(t => titleFromJson(config, t as Record<string, unknown>))
    })

  return { item: enriched, seasons, related }
}

async function loadSeason(
  config: ProviderConfig, titleId: string, seasonNum: number
): Promise<Season | null> {
  const tpl  = config.endpoints['episodes'] ?? '/titles/{id}/seasons/{season}'
  const path = fill(tpl, { id: titleId, season: String(seasonNum) })
  try {
    const data   = await proxiedJson(buildUrl(config.baseUrl, path), config.headers)
    const epList = (data['episodes'] as Record<string, unknown>[]) ?? []
    const episodes: Episode[] = epList.map((j, i) => {
      const images = (j['images'] as unknown[]) ?? []
      const epId   = j['id']?.toString() ?? `${titleId}_s${seasonNum}_${i}`
      const watchTpl = config.endpoints['watch'] ?? '/watch/{titleId}?e={episodeId}'
      return {
        id:           epId,
        number:       (j['number'] as number) ?? (i + 1),
        season:       seasonNum,
        title:        j['name'] as string | undefined,
        description:  j['description'] as string | undefined,
        thumbnailUrl: pickImage(config, images, 'cover'),
        durationMs:   j['duration'] ? (j['duration'] as number) * 60000 : undefined,
        url:          buildUrl(config.baseUrl, fill(watchTpl, {
          titleId, episodeId: epId,
        })),
        extra: { scws_id: j['scws_id'] },
      }
    })
    return { number: seasonNum, episodes }
  } catch { return null }
}

export async function apiJsonGetLinks(
  config: ProviderConfig, url: string, extra: Record<string, unknown> = {}
): Promise<StreamLink[]> {
  const scwsId = extra['scws_id']?.toString()
  if (scwsId) return resolveScws(config, scwsId, url)

  const props = await getInertiaProps(url, config.headers)
  const direct = (props['playerUrl'] ?? props['streamingUrl']) as string | undefined
  if (direct) return [{ url: direct, type: 'hls' }]

  const pageScwsId = (props['episode'] as Record<string,unknown>)?.['scws_id']?.toString()
                  ?? (props['scws_id'] as string | undefined)
  if (pageScwsId) return resolveScws(config, pageScwsId, url)

  // Fallback: scan HTML for m3u8
  const html  = await proxiedHtml(url, config.headers)
  const m3u8  = html.match(/"(https?:\/\/[^"]+\.m3u8[^"]*)"/)?.[1]
  if (m3u8) return [{ url: m3u8, type: 'hls' }]

  return []
}

async function resolveScws(
  config: ProviderConfig, scwsId: string, referer: string
): Promise<StreamLink[]> {
  const masterTpl = config.endpoints['stream'] ?? 'https://scws.work/master/{scwsId}'
  const masterUrl = fill(masterTpl, { scwsId })
  const tokenPath = config.endpoints['token'] ?? '/api/token'

  try {
    const td = await proxiedJson(
      buildUrl(config.baseUrl, `${tokenPath}?token=${scwsId}`),
      { ...config.headers, Referer: referer }
    )
    const token   = (td['token'] as string) ?? ''
    const expires = (td['expires'] as string) ?? ''
    return [{
      url:     `${masterUrl}?token=${token}&expires=${expires}`,
      type:    'hls',
      headers: { Referer: config.baseUrl },
    }]
  } catch {
    return [{ url: masterUrl, type: 'hls', headers: { Referer: config.baseUrl } }]
  }
}

export async function apiJsonHomepage(
  config: ProviderConfig
): Promise<SearchResult | null> {
  const hp = config.endpoints['homepage']
  if (!hp) return null
  const props   = await getInertiaProps(buildUrl(config.baseUrl, hp), config.headers)
  const sliders = (props['sliders'] as unknown[]) ?? []
  const items   = sliders.flatMap((sl: unknown) => {
    const s = sl as Record<string, unknown>
    return ((s['titles'] as unknown[]) ?? []).map(t => titleFromJson(config, t as Record<string, unknown>))
  })
  return { items: items.length ? items : [], hasNextPage: false }
}

// ── ScraperHtmlEngine ─────────────────────────────────────────────────────────

function htmlQuery(html: string, selector: string): string | null {
  // Minimal CSS selector parsing for server-side use (no DOM available)
  // Supports: tag, .class, #id, tag.class, [attr], tag[attr]
  const attrMatch = selector.match(/\[(\w[\w-]*)\]$/)
  if (attrMatch) {
    const attr    = attrMatch[1]
    const pattern = new RegExp(`<[^>]+${attr}="([^"]*)"[^>]*>`, 'i')
    return html.match(pattern)?.[1] ?? null
  }
  const tag     = selector.match(/^[a-z][\w]*/i)?.[0] ?? '[^>]+'
  const cls     = selector.match(/\.([^\s.[#]+)/)?.[1]
  const clsPat  = cls ? `class="[^"]*${cls}[^"]*"` : ''
  const pattern = new RegExp(
    `<${tag}[^>]*${clsPat}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'
  )
  const match = html.match(pattern)
  return match ? match[1].replace(/<[^>]+>/g, '').trim() : null
}

export async function scraperSearch(
  config: ProviderConfig, query: string
): Promise<SearchResult> {
  const selectors = (config.extra?.['selectors'] as Record<string, string>) ?? {}
  const tpl  = config.endpoints['search'] ?? '/search?q={query}'
  const path = fill(tpl, { query: encodeURIComponent(query) })
  const html = await proxiedHtml(buildUrl(config.baseUrl, path), config.headers)

  // Extract items via item selector
  const itemSel = selectors['item']
  if (!itemSel) return { items: [], hasNextPage: false }

  // Split HTML into item chunks (simplified)
  const tagMatch = itemSel.match(/^([a-z][\w]*)/i)
  const tag      = tagMatch ? tagMatch[1] : 'div'
  const chunks   = html.split(new RegExp(`(?=<${tag}[\\s>])`, 'i')).slice(1)

  const items = chunks.slice(0, 20).map((chunk, i): MediaItem => {
    const title    = htmlQuery(chunk, selectors['title'] ?? 'h3') ?? `Item ${i}`
    const link     = chunk.match(/href="([^"]+)"/)?.[1]
    const fullUrl  = link ? buildUrl(config.baseUrl, link) : undefined
    const idSlug   = fullUrl?.split('/').filter(Boolean).pop() ?? `item-${i}`
    const rawImg   = htmlQuery(chunk, selectors['poster'] ?? 'img[src]')
    const posterUrl = rawImg?.startsWith('http')
      ? rawImg
      : rawImg ? buildUrl(config.baseUrl, rawImg) : undefined

    return {
      id: idSlug, title, providerId: config.id,
      posterUrl, url: fullUrl, type: 'unknown',
      genres: [], extra: {},
    }
  }).filter(item => item.title)

  return { items, hasNextPage: false }
}
