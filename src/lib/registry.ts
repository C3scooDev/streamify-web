import type { ProviderConfig, RepoManifest, MediaItem, MediaDetail, SearchResult, StreamLink } from '@/types'
import {
  apiJsonSearch, apiJsonDetail, apiJsonGetLinks, apiJsonHomepage,
  scraperSearch,
} from './engines'

const STORAGE_KEY = 'streamify_repos'

// ── In-memory registry (hydrated from localStorage on mount) ─────────────────

let _providers: Map<string, ProviderConfig> = new Map()
let _repos:     RepoManifest[]              = []
let _repoUrls:  string[]                    = []

export function getAllProviders(): ProviderConfig[] {
  return [..._providers.values()].filter(p => p.enabled)
}

export function getProvider(id: string): ProviderConfig | undefined {
  return _providers.get(id)
}

export function getRepos(): RepoManifest[] { return _repos }
export function getRepoUrls(): string[]    { return _repoUrls }

// ── Persistence ───────────────────────────────────────────────────────────────

export function saveRepoUrls(urls: string[]) {
  _repoUrls = urls
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(urls))
  }
}

export function loadRepoUrls(): string[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[]
  } catch { return [] }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initRegistry(): Promise<void> {
  _providers.clear()
  _repos    = []
  const raw = loadRepoUrls()
  _repoUrls = [...new Set(raw)]
  if (_repoUrls.length !== raw.length) saveRepoUrls(_repoUrls)
  for (const url of _repoUrls) {
    await fetchRepo(url)
  }
}

async function fetchRepo(repoUrl: string): Promise<RepoManifest | null> {
  try {
    const res      = await fetch('/api/proxy', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url: repoUrl, accept: 'json' }),
    })
    const data     = await res.json() as Record<string, unknown>
    const manifest: RepoManifest = {
      name:        (data['name'] as string) ?? repoUrl,
      url:         repoUrl,
      description: data['description'] as string | undefined,
      providers:   ((data['providers'] as ProviderConfig[]) ?? []),
    }
    _repos = _repos.filter(r => r.url !== repoUrl)
    _repos.push(manifest)
    for (const cfg of manifest.providers) {
      if (cfg.enabled !== false) _providers.set(cfg.id, cfg)
    }
    return manifest
  } catch { return null }
}

// ── Add/remove repos ──────────────────────────────────────────────────────────

export async function addRepo(url: string): Promise<RepoManifest | null> {
  if (_repoUrls.includes(url)) return _repos.find(r => r.url === url) ?? null
  const manifest = await fetchRepo(url)
  if (manifest) {
    _repoUrls = [..._repoUrls, url]
    saveRepoUrls(_repoUrls)
  }
  return manifest
}

export async function removeRepo(url: string): Promise<void> {
  const idx = _repoUrls.indexOf(url)
  if (idx === -1) return
  _repoUrls.splice(idx, 1)
  saveRepoUrls([..._repoUrls])
  // Re-init to remove that repo's providers
  await initRegistry()
}

// ── Engine dispatch ───────────────────────────────────────────────────────────

export async function search(
  query: string, providerId?: string, page = 1
): Promise<MediaItem[]> {
  const configs = providerId
    ? [_providers.get(providerId)].filter(Boolean) as ProviderConfig[]
    : getAllProviders()

  const results = await Promise.allSettled(
    configs.map(cfg =>
      cfg.type === 'api_json'
        ? apiJsonSearch(cfg, query, page)
        : scraperSearch(cfg, query)
    )
  )
  return results
    .filter((r): r is PromiseFulfilledResult<SearchResult> => r.status === 'fulfilled')
    .flatMap(r => r.value.items)
}

export async function loadDetail(item: MediaItem): Promise<MediaDetail> {
  const cfg = _providers.get(item.providerId)
  if (!cfg) return { item, seasons: [], related: [] }
  return apiJsonDetail(cfg, item)
}

export async function getLinks(
  url: string, providerId: string, extra: Record<string, unknown> = {}
): Promise<StreamLink[]> {
  const cfg = _providers.get(providerId)
  if (!cfg) return []
  return apiJsonGetLinks(cfg, url, extra)
}

export async function getHomepage(providerId: string): Promise<SearchResult | null> {
  const cfg = _providers.get(providerId)
  if (!cfg) return null
  return apiJsonHomepage(cfg)
}
