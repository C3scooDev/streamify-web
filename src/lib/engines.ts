// Provider engines — supports both Inertia/JSON providers AND plain-HTML (DLE CMS) providers.
// All HTTP calls go through /api/proxy to avoid CORS.

import type {
  ProviderConfig, MediaItem, MediaDetail, SearchResult,
  StreamLink, Season, Episode, MediaType, StreamType,
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

async function proxiedPost(
  url: string,
  formBody: string,
  headers: Record<string, string> = {}
): Promise<string> {
  const res = await fetch('/api/proxy', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ url, headers, accept: 'html', method: 'POST', formBody }),
  })
  if (!res.ok) throw new Error(`Proxy POST error ${res.status} for ${url}`)
  return res.text()
}

// ── Inertia helpers ───────────────────────────────────────────────────────────

function extractInertiaProps(html: string): Record<string, unknown> {
  const match = html.match(/data-page="([^"]+)"/)
  if (!match) return {}
  const raw = match[1]
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&amp;', '&')
  try { return JSON.parse(raw)?.props ?? {} } catch { return {} }
}

async function getInertiaProps(url: string, headers: Record<string, string> = {}) {
  const html = await proxiedHtml(url, headers)
  return extractInertiaProps(html)
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

// ── ApiJsonEngine (Inertia path) ──────────────────────────────────────────────

function titleFromJson(config: ProviderConfig, j: Record<string, unknown>): MediaItem {
  const images  = (j['images'] as unknown[]) ?? []
  const typeStr = (j['type'] as string) ?? 'movie'
  const id      = j['id']?.toString() ?? ''
  const slug    = (j['slug'] as string) ?? ''

  const epTpl     = config.endpoints['detail'] ?? '/titles/{id}-{slug}'
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

// ── HTML tile parser (DLE CMS / SC-style homepages & search) ─────────────────
// Handles: <a href="/cat/ID-slug.html" data-id="ID" data-category="..." data-s="N">
//           <img data-src="/uploads/...">

function parseHtmlTiles(html: string, config: ProviderConfig): MediaItem[] {
  const base  = config.baseUrl.replace(/\/$/, '')
  const items: MediaItem[] = []
  const seen  = new Set<string>()

  // Strategy: Find all tile containers and extract data from their structure
  // HTML structure: <div class="slider-tile">...<a href="..." data-id="..." data-category="...">...<img data-src="...">...</div>
  const tileRe = /<div[^>]*class="[^"]*slider-tile[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi
  let tileMatch: RegExpExecArray | null

  while ((tileMatch = tileRe.exec(html)) !== null) {
    const tileBlock = tileMatch[1]

    // Extract anchor with data-id and data-category
    const anchorMatch = tileBlock.match(/<a[^>]+href="([^"]+)"[^>]*data-id="(\d+)"[^>]*data-category="([^"]*)"[^>]*>/i)
    if (!anchorMatch) continue

    const [, href, id, categoryStr] = anchorMatch
    if (seen.has(id)) continue

    // Skip non-media anchors
    if (!href.includes('/titles/') && !href.match(/\/[a-z][\w-]+\/\d+-/)) continue
    seen.add(id)

    // Extract image data-src (try multiple patterns)
    let imgPath: string | undefined
    // Try data-src first (lazy loading)
    const dataSrcMatch = tileBlock.match(/<img[^>]+data-src="([^"]+)"/i)
    if (dataSrcMatch) imgPath = dataSrcMatch[1]
    // Fallback to src
    if (!imgPath) {
      const srcMatch = tileBlock.match(/<img[^>]+src="([^"]+)"/i)
      if (srcMatch) imgPath = srcMatch[1]
    }

    // data-s="N" on the anchor tag → series
    const dataSMatch  = anchorMatch[0].match(/data-s="(\d+)"/i)
    const type: MediaType = dataSMatch ? 'series' : 'movie'

    // Slug: take last path segment without .html, then strip numeric ID prefix
    const filename   = href.split('/').pop() ?? ''
    const htmlSlug   = filename.replace(/\.html$/i, '')   // 33148-war-machine-streaming
    const rawSlug    = htmlSlug.replace(/^\d+-/, '')      // war-machine-streaming (or guarda-title for search results)
    const actualSlug = rawSlug.replace(/^guarda-/i, '')   // strip "guarda-" watch-page prefix if present
    const title = actualSlug
      .replace(/-streaming$/i, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())

    const posterUrl = imgPath
      ? (imgPath.startsWith('http') ? imgPath : `${base}${imgPath.startsWith('/') ? '' : '/'}${imgPath}`)
      : undefined

    // Build item URL: use absolute href as-is, or prepend base for relative paths
    const itemUrl = href.startsWith('http')
      ? href
      : `${base}${href.startsWith('/') ? '' : '/'}${href}`

    items.push({
      id,
      title,
      providerId:  config.id,
      posterUrl,
      url:         itemUrl,
      type,
      genres:      categoryStr ? categoryStr.split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean) : [],
      extra:       {
        htmlSlug,
        actualSlug,
        seasonsCount: dataSMatch ? parseInt(dataSMatch[1]) : 0,
      },
    })
  }

  // Fallback: if no tiles found with container approach, try the old inline approach
  if (items.length === 0) {
    const re = /<a[^>]+href="([^"]+)"[^>]*data-id="(\d+)"[^>]*data-category="([^"]*)"[^>]*>[\s\S]*?data-src="([^"]+)"/gi
    let m: RegExpExecArray | null

    while ((m = re.exec(html)) !== null) {
      const [fullMatch, href, id, categoryStr, imgPath] = m
      if (seen.has(id)) continue
      if (!href.includes('/titles/') && !href.match(/\/[a-z][\w-]+\/\d+-/)) continue
      seen.add(id)

      const anchorEnd   = fullMatch.indexOf('>')
      const anchorTag   = fullMatch.substring(0, anchorEnd)
      const dataSMatch  = anchorTag.match(/data-s="(\d+)"/)
      const type: MediaType = dataSMatch ? 'series' : 'movie'

      const filename   = href.split('/').pop() ?? ''
      const htmlSlug   = filename.replace(/\.html$/i, '')
      const rawSlug    = htmlSlug.replace(/^\d+-/, '')
      const actualSlug = rawSlug.replace(/^guarda-/i, '')
      const title = actualSlug
        .replace(/-streaming$/i, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())

      const posterUrl = imgPath.startsWith('http')
        ? imgPath
        : `${base}${imgPath.startsWith('/') ? '' : '/'}${imgPath}`

      const itemUrl = href.startsWith('http')
        ? href
        : `${base}${href.startsWith('/') ? '' : '/'}${href}`

      items.push({
        id,
        title,
        providerId:  config.id,
        posterUrl,
        url:         itemUrl,
        type,
        genres:      categoryStr ? categoryStr.split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean) : [],
        extra:       {
          htmlSlug,
          actualSlug,
          seasonsCount: dataSMatch ? parseInt(dataSMatch[1]) : 0,
        },
      })
    }
  }

  return items
}

// ── DLE search-result parser (no data-id / data-category needed) ─────────────
// Falls back to parsing href patterns like /category/ID-slug.html

function parseDleSearch(html: string, config: ProviderConfig): MediaItem[] {
  const base  = config.baseUrl.replace(/\/$/, '')
  const items: MediaItem[] = []
  const seen  = new Set<string>()

  // Match both relative (/cat/ID-slug.html) and absolute (https://base/cat/ID-slug.html) hrefs
  const re = /href="((?:https?:\/\/[^"]*)?\/[a-z0-9_-]+\/(\d+)-([a-z0-9_-]+)\.html)"/gi
  let m: RegExpExecArray | null

  while ((m = re.exec(html)) !== null) {
    const [, href, id, slug] = m
    if (seen.has(id)) continue
    // Skip obvious nav/pagination slugs
    if (slug.length < 3 || /^(page|cat|tag|user|index)/.test(slug)) continue
    seen.add(id)

    // Grab the nearest /uploads/ image (search within surrounding 600 chars)
    const ctx      = html.substring(Math.max(0, m.index - 400), m.index + 700)
    const imgMatch = ctx.match(/(?:src|data-src)="([^"]*\/uploads\/[^"]+)"/i)
    const imgSrc   = imgMatch?.[1]
    const posterUrl = imgSrc
      ? (imgSrc.startsWith('http') ? imgSrc : `${base}${imgSrc.startsWith('/') ? '' : '/'}${imgSrc}`)
      : undefined

    const title = slug
      .replace(/-streaming$/i, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())

    const itemUrl = href.startsWith('http')
      ? href
      : `${base}${href.startsWith('/') ? '' : '/'}${href}`

    items.push({
      id,
      title,
      providerId:  config.id,
      posterUrl,
      url:         itemUrl,
      type:        'unknown' as MediaType,
      genres:      [],
      extra:       { htmlSlug: `${id}-${slug}`, actualSlug: slug },
    })
  }

  return items
}

// ── HTML detail page scraper (DLE CMS) ───────────────────────────────────────
// Parses a category detail page like /azione/33148-war-machine-streaming.html

async function scrapeHtmlDetail(
  html: string, config: ProviderConfig, item: MediaItem
): Promise<MediaDetail> {
  const base = config.baseUrl.replace(/\/$/, '')

  // Title from H1 or og:title
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1]
               ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i)?.[1]
  const h1Title = html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1]?.trim()
  const title = ogTitle ?? h1Title ?? item.title

  // Description from meta (short) or plot class (full)
  const metaDesc = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)?.[1]
                ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+name="description"/i)?.[1]
  // Try to get full plot from <p class="plot">
  const plotMatch = html.match(/<p[^>]*class="[^"]*plot[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
  const fullPlot = plotMatch ? cleanHtmlText(plotMatch[1]) : metaDesc

  // Images: og:image = backdrop/poster, /uploads/logos/... = poster
  const ogImg    = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1]
                ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i)?.[1]
  const logoImg  = html.match(/src="([^"]*\/uploads\/logos\/[^"]+)"/i)?.[1]

  const posterUrl = logoImg
    ? (logoImg.startsWith('http') ? logoImg : `${base}${logoImg}`)
    : (ogImg ? (ogImg.startsWith('http') ? ogImg : `${base}${ogImg}`) : item.posterUrl)
  const backdropUrl = ogImg && !logoImg
    ? (ogImg.startsWith('http') ? ogImg : `${base}${ogImg}`)
    : item.backdropUrl

  // Type: series if there are season tab panes or "Serie TV" in categories
  const isSeries = /id="season-\d+"/i.test(html) ||
                   html.match(/<a[^>]*href="[^"]*serie-tv[^"]*"[^>]*>[^<]*Serie TV/i) !== null ||
                   item.type === 'series'
  const type: MediaType = isSeries ? 'series' : 'movie'

  // Extract genres from <div class="extra"> or category links
  const extraMatch = html.match(/<div[^>]*class="[^"]*extra[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
  let genres: string[] = item.genres || []
  if (extraMatch) {
    const genreLinks = [...extraMatch[1].matchAll(/<a[^>]*href="[^"]*\/([a-z-]+)\/"[^>]*>([^<]+)<\/a>/gi)]
    genres = genreLinks.map(m => m[2].trim()).filter(g => g.length > 0 && g !== 'Serie TV' && g !== 'Film')
  }

  // Extract year from title or page content
  const yearMatch = html.match(/(\d{4})/g)
  const year = yearMatch ? parseInt(yearMatch[0]) : item.year

  // Watch page URL: look for href containing /guarda/ and watching.html
  const watchUrl = html.match(/href="(https?:\/\/[^"]*\/titles\/[^"]*guarda[^"]*watching\.html[^"]*)"/i)?.[1]
                ?? html.match(/href="(https?:\/\/[^"]*watching\.html[^"]*)"/i)?.[1]
                ?? null

  // Extract related/similar titles from page
  const related: MediaItem[] = []
  const relatedSection = html.match(/<div[^>]*class="[^"]*owl-carousel[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)
  if (relatedSection) {
    const relatedTiles = parseHtmlTiles(relatedSection[0], config)
    related.push(...relatedTiles.slice(0, 10))
  }

  const enriched: MediaItem = {
    ...item,
    title,
    description: fullPlot,
    posterUrl,
    backdropUrl,
    type,
    year,
    genres: genres.length > 0 ? genres : item.genres,
    extra: { ...item.extra, watchUrl },
  }

  // Seasons + episodes for series
  let seasons: Season[] = []
  if (isSeries && watchUrl) {
    try {
      const watchHtml = await proxiedHtml(watchUrl, config.headers)
      seasons = parseWatchPageSeasons(watchHtml, config, item.id)
    } catch { /* fall through, return empty seasons */ }
  }

  return { item: enriched, seasons, related }
}

// Helper to clean HTML text (remove tags, decode entities)
function cleanHtmlText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&ensp;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '...')
    .replace(/&[a-z]+;/gi, '')
    .replace(/\.\.\./g, '...')
    .replace(/\s+/g, ' ')
    .trim()
}

// Parse episodes from a SC watch page (series only)
// Structure: <div id="season-N"><ul><li><a data-num="SxE" data-title="..."><select class="smirrors"><option value="url">label</option></select></li></ul></div>
function parseWatchPageSeasons(html: string, config: ProviderConfig, titleId: string): Season[] {
  const seasons: Season[] = []

  // Split on season tab panes
  const seasonRe = /id="season-(\d+)"[^>]*>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/gi
  let sm: RegExpExecArray | null

  while ((sm = seasonRe.exec(html)) !== null) {
    const seasonNum = parseInt(sm[1])
    const block     = sm[2]
    const episodes: Episode[] = []

    // Each <li> is one episode
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi
    let lm: RegExpExecArray | null

    while ((lm = liRe.exec(block)) !== null) {
      const li        = lm[1]
      const numMatch  = li.match(/data-num="(\d+)x(\d+)"/)
      const titleAttr = li.match(/data-title="([^"]*)"/)
      if (!numMatch) continue

      const epNum   = parseInt(numMatch[2])
      const epTitle = titleAttr?.[1]?.trim() || undefined

      // Episode thumbnail: try common patterns within the <li>
      // Note: in many SC pages the episode thumbnails are not present in HTML.
      let thumbnailUrl: string | undefined

      // <img src="..."> / <img data-src="...">
      const imgMatch = li.match(/<img[^>]+(?:data-src|src)="([^"]+)"/i)
      const rawThumb = imgMatch?.[1]
      if (rawThumb) {
        thumbnailUrl = rawThumb.startsWith('http')
          ? rawThumb
          : `${config.baseUrl.replace(/\/$/, '')}${rawThumb.startsWith('/') ? '' : '/'}${rawThumb}`
      }

      // style="background-image:url(...)"
      if (!thumbnailUrl) {
        const bgMatch = li.match(/background(?:-image)?\s*:\s*url\(([^)]+)\)/i)
        const rawBg = bgMatch?.[1]?.replace(/['"]/g, '').trim()
        if (rawBg) {
          thumbnailUrl = rawBg.startsWith('http')
            ? rawBg
            : `${config.baseUrl.replace(/\/$/, '')}${rawBg.startsWith('/') ? '' : '/'}${rawBg}`
        }
      }

      // All embed mirrors from <select class="smirrors"><option value="url">label
      const mirrors: { url: string; label: string }[] = []
      const optRe = /<option[^>]+value="([^"]+)"[^>]*>([^<]+)<\/option>/gi
      let om: RegExpExecArray | null
      while ((om = optRe.exec(li)) !== null) {
        mirrors.push({ url: om[1].trim(), label: om[2].trim() })
      }
      if (mirrors.length === 0) continue

      episodes.push({
        id:           `${titleId}_s${seasonNum}_e${epNum}`,
        number:       epNum,
        season:       seasonNum,
        title:        epTitle,
        description:  epTitle,
        thumbnailUrl,
        url:          mirrors[0].url,
        extra:        { embedUrls: mirrors },
      })
    }

    if (episodes.length > 0) seasons.push({ number: seasonNum, episodes })
  }

  return seasons
}

// Fetch stream links from a movie watch page
async function fetchMovieMirrors(watchUrl: string, config: ProviderConfig): Promise<StreamLink[]> {
  const html = await proxiedHtml(watchUrl, config.headers)

  // Prefer span data-link mirrors (multiple quality options)
  const spans = [...html.matchAll(/data-link="([^"]+)"[^>]*>([^<]+)/gi)]
    .map(m => ({ url: m[1].trim(), label: m[2].trim() }))
  if (spans.length > 0) {
    return spans.map(s => ({ url: s.url, type: 'iframe' as StreamType, label: s.label }))
  }

  // Fallback: first iframe src
  const iframeSrc = html.match(/<iframe[^>]+src="([^"]+)"/i)?.[1]?.trim()
  if (iframeSrc) return [{ url: iframeSrc, type: 'iframe' as StreamType }]

  return []
}

// ── SCWS resolver (Inertia providers) ────────────────────────────────────────

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

// ── Public engine functions ───────────────────────────────────────────────────

export async function apiJsonSearch(
  config: ProviderConfig, query: string, page = 1
): Promise<SearchResult> {
  const tpl  = config.endpoints['search'] ?? '/api/search?q={query}'
  const path = fill(tpl, { query: encodeURIComponent(query) })
  const url  = buildUrl(config.baseUrl, path)

  // Try JSON first (Inertia providers)
  try {
    const data = await proxiedJson(url, config.headers)
    const list = (data['data'] ?? data['titles'] ?? data['results'] ?? []) as Record<string, unknown>[]
    if (list.length > 0) return { items: list.map(j => titleFromJson(config, j)), hasNextPage: false }
  } catch { /* fall through */ }

  // DLE CMS: search form uses POST — try POST first
  if (tpl.includes('do=search') || tpl.includes('subaction=search')) {
    const base = config.baseUrl.replace(/\/$/, '')
    try {
      const html  = await proxiedPost(
        `${base}/`,
        `do=search&subaction=search&story=${encodeURIComponent(query)}`,
        config.headers
      )
      const tiles = parseHtmlTiles(html, config)
      if (tiles.length > 0) return { items: tiles, hasNextPage: false }
      const flex  = parseDleSearch(html, config)
      if (flex.length > 0)  return { items: flex,  hasNextPage: false }
    } catch { /* fall through to GET */ }
  }

  // GET fallback (other HTML providers or DLE GET mode)
  const html  = await proxiedHtml(url, config.headers)
  const tiles = parseHtmlTiles(html, config)
  if (tiles.length > 0) return { items: tiles, hasNextPage: false }
  return { items: parseDleSearch(html, config), hasNextPage: false }
}

export async function apiJsonDetail(
  config: ProviderConfig, item: MediaItem
): Promise<MediaDetail> {
  if (!item.url) return { item, seasons: [], related: [] }

  // Fetch detail page once and detect format
  const html  = await proxiedHtml(item.url, config.headers)
  const props = extractInertiaProps(html)
  const tj    = props['title'] as Record<string, unknown> | undefined

  // ── Inertia path ──────────────────────────────────────────────────────────
  if (tj) {
    const enriched: MediaItem = {
      ...titleFromJson(config, { ...tj, url: item.url }),
      description: (tj['plot'] as string) ?? (tj['description'] as string),
    }

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

  // ── HTML scraping path (DLE CMS) ──────────────────────────────────────────
  return scrapeHtmlDetail(html, config, item)
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
      const images   = (j['images'] as unknown[]) ?? []
      const epId     = j['id']?.toString() ?? `${titleId}_s${seasonNum}_${i}`
      const watchTpl = config.endpoints['watch'] ?? '/watch/{titleId}?e={episodeId}'
      return {
        id:           epId,
        number:       (j['number'] as number) ?? (i + 1),
        season:       seasonNum,
        title:        j['name'] as string | undefined,
        description:  j['description'] as string | undefined,
        thumbnailUrl: pickImage(config, images, 'cover'),
        durationMs:   j['duration'] ? (j['duration'] as number) * 60000 : undefined,
        url:          buildUrl(config.baseUrl, fill(watchTpl, { titleId, episodeId: epId })),
        extra:        { scws_id: j['scws_id'] },
      }
    })
    return { number: seasonNum, episodes }
  } catch { return null }
}

export async function apiJsonGetLinks(
  config: ProviderConfig, url: string, extra: Record<string, unknown> = {}
): Promise<StreamLink[]> {
  // ── Series episode: embedUrls already extracted from watch page ───────────
  const embedUrls = extra['embedUrls'] as { url: string; label: string }[] | undefined
  if (embedUrls?.length) {
    return embedUrls.map(e => ({ url: e.url, type: 'iframe' as StreamType, label: e.label }))
  }

  // ── Movie: use watchUrl from item.extra (set by scrapeHtmlDetail) ─────────
  const watchUrl = extra['watchUrl'] as string | undefined
  if (watchUrl) {
    const links = await fetchMovieMirrors(watchUrl, config)
    if (links.length) return links
  }

  // ── Inertia: check page for SCWS id or direct stream URL ─────────────────
  const scwsId = extra['scws_id']?.toString()
  if (scwsId) return resolveScws(config, scwsId, url)

  const props = extractInertiaProps(await proxiedHtml(url, config.headers))
  const direct = (props['playerUrl'] ?? props['streamingUrl']) as string | undefined
  if (direct) return [{ url: direct, type: 'hls' }]

  const pageScwsId = (props['episode'] as Record<string,unknown>)?.['scws_id']?.toString()
                  ?? (props['scws_id'] as string | undefined)
  if (pageScwsId) return resolveScws(config, pageScwsId, url)

  // ── Last resort: scan fetched HTML for m3u8 or iframe ────────────────────
  const html  = await proxiedHtml(url, config.headers)
  const m3u8  = html.match(/"(https?:\/\/[^"]+\.m3u8[^"]*)"/)?.[1]
  if (m3u8) return [{ url: m3u8, type: 'hls' }]

  const iframeSrc = html.match(/<iframe[^>]+src="([^"]+)"/i)?.[1]?.trim()
  if (iframeSrc) return [{ url: iframeSrc, type: 'iframe' as StreamType }]

  return []
}

export async function apiJsonHomepage(
  config: ProviderConfig
): Promise<SearchResult | null> {
  const hp = config.endpoints['homepage']
  if (!hp) return null
  const url  = buildUrl(config.baseUrl, hp)
  const html = await proxiedHtml(url, config.headers)

  // Try Inertia sliders first
  const props   = extractInertiaProps(html)
  const sliders = (props['sliders'] as unknown[]) ?? []
  let items = sliders.flatMap((sl: unknown) => {
    const s = sl as Record<string, unknown>
    return ((s['titles'] as unknown[]) ?? []).map(t => titleFromJson(config, t as Record<string, unknown>))
  })

  // HTML tile fallback (DLE CMS)
  if (items.length === 0) items = parseHtmlTiles(html, config)

  return { items, hasNextPage: false }
}

// ── ScraperHtmlEngine (generic) ───────────────────────────────────────────────

function htmlQuery(html: string, selector: string): string | null {
  const attrMatch = selector.match(/\[(\w[\w-]*)\]$/)
  if (attrMatch) {
    const attr    = attrMatch[1]
    const pattern = new RegExp(`<[^>]+${attr}="([^"]*)"[^>]*>`, 'i')
    return html.match(pattern)?.[1] ?? null
  }
  const tag    = selector.match(/^[a-z][\w]*/i)?.[0] ?? '[^>]+'
  const cls    = selector.match(/\.([^\s.[#]+)/)?.[1]
  const clsPat = cls ? `class="[^"]*${cls}[^"]*"` : ''
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

  const itemSel = selectors['item']
  if (!itemSel) return { items: [], hasNextPage: false }

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
