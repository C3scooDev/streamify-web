'use client'
import { useState } from 'react'
import { useAppStore } from '@/store'
import { addRepo, removeRepo, getAllProviders, getRepos } from '@/lib/registry'
import AppShell from '@/components/layout/AppShell'
import Spinner from '@/components/ui/Spinner'

export default function SettingsPage() {
  const { providers, repos, setProviders, setRepos, setRepoUrls } = useAppStore()
  const [url,     setUrl]     = useState('')
  const [adding,  setAdding]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const refresh = () => {
    setProviders(getAllProviders())
    setRepos(getRepos())
    setRepoUrls(getRepoUrls())
  }

  const handleAdd = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setAdding(true); setError(null); setSuccess(null)
    try {
      const manifest = await addRepo(trimmed)
      if (manifest) {
        setSuccess(`Added "${manifest.name}" with ${manifest.providers.length} provider${manifest.providers.length !== 1 ? 's' : ''}`)
        setUrl('')
        refresh()
      } else {
        setError('Repository not found or invalid format.')
      }
    } catch (e) {
      setError(`Error: ${e}`)
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (repoUrl: string) => {
    await removeRepo(repoUrl)
    refresh()
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="font-display text-2xl font-bold mb-8 tracking-wide">SETTINGS</h1>

        {/* Add repo */}
        <section className="mb-8">
          <h2 className="text-xs tracking-widest text-ink-400 mb-3 font-body">ADD REPOSITORY</h2>
          <p className="text-sm text-ink-500 font-body mb-4">
            Paste the URL of a JSON repository manifest. The app ships with zero providers — you control everything.
          </p>

          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://example.com/repo.json"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className="flex-1 bg-ink-800 border border-ink-700 text-ink-50 px-4 py-2.5 text-sm font-body focus:outline-none focus:border-signal transition-colors placeholder:text-ink-600"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !url.trim()}
              className="px-5 py-2.5 bg-signal text-ink-900 text-xs font-bold tracking-widest hover:bg-signal-dim transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {adding && <Spinner size={14} />}
              ADD
            </button>
          </div>

          {error   && <p className="text-xs text-ember mt-2 font-body">{error}</p>}
          {success && <p className="text-xs signal-text mt-2 font-body">✓ {success}</p>}
        </section>

        {/* Installed repos */}
        <section className="mb-8">
          <h2 className="text-xs tracking-widest text-ink-400 mb-3 font-body">
            REPOSITORIES ({repos.length})
          </h2>

          {repos.length === 0 ? (
            <p className="text-sm text-ink-600 font-body py-4 border border-dashed border-ink-800 text-center">
              No repositories added
            </p>
          ) : (
            <div className="space-y-2">
              {repos.map((repo) => (
                <div key={repo.url} className="flex items-center gap-3 p-3 bg-ink-800 border border-ink-700">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-body font-bold">{repo.name}</p>
                    <p className="text-xs text-ink-500 truncate font-body">
                      {repo.providers.length} provider{repo.providers.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemove(repo.url)}
                    className="text-xs text-ink-500 hover:text-ember transition-colors font-body tracking-widest px-2 py-1"
                  >
                    REMOVE
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Provider list */}
        <section>
          <h2 className="text-xs tracking-widest text-ink-400 mb-3 font-body">
            PROVIDERS ({providers.length})
          </h2>

          {providers.length === 0 ? (
            <p className="text-sm text-ink-600 font-body py-4 border border-dashed border-ink-800 text-center">
              Add a repository to get providers
            </p>
          ) : (
            <div className="space-y-1">
              {providers.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 bg-ink-800/50 border border-ink-800">
                  <div className="w-7 h-7 bg-ink-700 flex items-center justify-center text-xs font-display font-bold signal-text shrink-0">
                    {p.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-body">{p.name}</p>
                    <p className="text-[10px] text-ink-500 font-body">{p.categories.join(', ')}</p>
                  </div>
                  <span className="text-[10px] text-ink-500 font-body shrink-0 uppercase">{p.language}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Repo manifest format docs */}
        <section className="mt-10">
          <h2 className="text-xs tracking-widest text-ink-400 mb-3 font-body">MANIFEST FORMAT</h2>
          <pre className="bg-ink-800 border border-ink-700 p-4 text-xs font-mono text-ink-300 overflow-x-auto leading-relaxed">
{`{
  "name": "My Repo",
  "providers": [{
    "id": "my_provider",
    "name": "My Provider",
    "baseUrl": "https://example.com",
    "type": "api_json",
    "language": "it",
    "categories": ["movie","series"],
    "imageBaseUrl": "https://cdn.example.com",
    "endpoints": {
      "search":   "/api/search?q={query}",
      "detail":   "/titles/{id}-{slug}",
      "episodes": "/titles/{id}/seasons/{season}",
      "watch":    "/watch/{titleId}?e={episodeId}",
      "stream":   "https://cdn.example.com/{scwsId}",
      "token":    "/api/token",
      "homepage": "/"
    },
    "headers": { "Referer": "https://example.com" },
    "enabled": true
  }]
}`}
          </pre>
        </section>
      </div>
    </AppShell>
  )
}
