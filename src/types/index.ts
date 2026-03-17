// ── Provider config (mirrors Flutter ProviderConfig) ────────────────────────

export type EngineType = 'api_json' | 'scraper_html' | 'm3u_playlist'
export type MediaType  = 'movie' | 'series' | 'anime' | 'live' | 'unknown'
export type StreamType = 'hls' | 'mp4' | 'dash' | 'iframe'

export interface ProviderConfig {
  id:           string
  name:         string
  baseUrl:      string
  type:         EngineType
  version?:     number
  language?:    string
  iconUrl?:     string
  description?: string
  categories:   string[]
  headers?:     Record<string, string>
  endpoints:    Record<string, string>
  imageBaseUrl?: string
  enabled:      boolean
  extra?:       Record<string, unknown>
}

export interface RepoManifest {
  name:         string
  url:          string   // the URL this manifest was fetched from
  description?: string
  providers:    ProviderConfig[]
}

// ── Media models ─────────────────────────────────────────────────────────────

export interface MediaItem {
  id:           string
  title:        string
  providerId:   string
  posterUrl?:   string
  backdropUrl?: string
  description?: string
  year?:        number
  rating?:      number
  type:         MediaType
  genres:       string[]
  url?:         string
  extra:        Record<string, unknown>
}

export interface Episode {
  id:            string
  number:        number
  season:        number
  title?:        string
  description?:  string
  thumbnailUrl?: string
  url?:          string
  durationMs?:   number
  extra:         Record<string, unknown>
}

export interface Season {
  number:   number
  title?:   string
  episodes: Episode[]
}

export interface MediaDetail {
  item:     MediaItem
  seasons:  Season[]
  related:  MediaItem[]
}

export interface SearchResult {
  items:       MediaItem[]
  hasNextPage: boolean
  nextPage?:   number
}

export interface StreamLink {
  url:       string
  type:      StreamType
  quality?:  string
  label?:    string
  headers?:  Record<string, string>
  subtitles?: SubtitleTrack[]
}

export interface SubtitleTrack {
  url:       string
  language:  string
  label?:    string
}

// ── Watchlist / Progress (IndexedDB) ─────────────────────────────────────────

export interface WatchlistEntry {
  id:         string   // composite: `${mediaId}::${providerId}`
  mediaId:    string
  providerId: string
  title:      string
  posterUrl?: string
  url?:       string
  type:       MediaType
  year?:      number
  addedAt:    number   // Date.now()
}

export interface ProgressEntry {
  id:          string  // composite: `${episodeId}::${providerId}`
  episodeId:   string
  mediaId:     string
  providerId:  string
  season:      number
  number:      number
  positionMs:  number
  durationMs:  number
  completed:   boolean
  updatedAt:   number
}
