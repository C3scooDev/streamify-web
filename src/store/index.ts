import { create } from 'zustand'
import type { MediaItem, ProviderConfig, RepoManifest } from '@/types'

interface AppStore {
  // Providers
  providers:     ProviderConfig[]
  repos:         RepoManifest[]
  repoUrls:      string[]
  setProviders:  (p: ProviderConfig[]) => void
  setRepos:      (r: RepoManifest[])   => void
  setRepoUrls:   (u: string[])         => void

  // Search
  searchQuery:   string
  searchResults: MediaItem[]
  searching:     boolean
  setSearchQuery:   (q: string)    => void
  setSearchResults: (r: MediaItem[]) => void
  setSearching:     (b: boolean)   => void

  // Selected item (passed between pages via state to avoid URL serialisation)
  selectedItem:  MediaItem | null
  setSelectedItem: (item: MediaItem | null) => void

  // Player
  playerUrl:        string | null
  playerProviderId: string | null
  playerTitle:      string
  playerExtra:      Record<string, unknown>
  setPlayer: (url: string, providerId: string, title: string, extra?: Record<string, unknown>) => void
  clearPlayer: () => void
}

export const useAppStore = create<AppStore>((set) => ({
  providers:    [],
  repos:        [],
  repoUrls:     [],
  setProviders: (providers)  => set({ providers }),
  setRepos:     (repos)      => set({ repos }),
  setRepoUrls:  (repoUrls)   => set({ repoUrls }),

  searchQuery:      '',
  searchResults:    [],
  searching:        false,
  setSearchQuery:   (searchQuery)   => set({ searchQuery }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setSearching:     (searching)     => set({ searching }),

  selectedItem:    null,
  setSelectedItem: (selectedItem) => set({ selectedItem }),

  playerUrl:        null,
  playerProviderId: null,
  playerTitle:      '',
  playerExtra:      {},
  setPlayer: (url, providerId, title, extra = {}) =>
    set({ playerUrl: url, playerProviderId: providerId, playerTitle: title, playerExtra: extra }),
  clearPlayer: () =>
    set({ playerUrl: null, playerProviderId: null, playerTitle: '', playerExtra: {} }),
}))
