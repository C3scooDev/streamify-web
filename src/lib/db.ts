// IndexedDB via idb — replaces Drift/SQLite from Flutter version
import { openDB, type IDBPDatabase } from 'idb'
import type { WatchlistEntry, ProgressEntry } from '@/types'

const DB_NAME    = 'streamify'
const DB_VERSION = 1

let _db: IDBPDatabase | null = null

async function getDb() {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Watchlist store
      if (!db.objectStoreNames.contains('watchlist')) {
        const ws = db.createObjectStore('watchlist', { keyPath: 'id' })
        ws.createIndex('addedAt', 'addedAt')
      }
      // Progress store
      if (!db.objectStoreNames.contains('progress')) {
        const ps = db.createObjectStore('progress', { keyPath: 'id' })
        ps.createIndex('mediaId', 'mediaId')
        ps.createIndex('updatedAt', 'updatedAt')
      }
    },
  })
  return _db
}

// ── Watchlist ─────────────────────────────────────────────────────────────────

export async function watchlistGetAll(): Promise<WatchlistEntry[]> {
  const db = await getDb()
  return db.getAllFromIndex('watchlist', 'addedAt')
    .then(items => [...items].reverse()) // newest first
}

export async function watchlistIsIn(mediaId: string, providerId: string): Promise<boolean> {
  const db  = await getDb()
  const key = `${mediaId}::${providerId}`
  const row = await db.get('watchlist', key)
  return row != null
}

export async function watchlistAdd(entry: Omit<WatchlistEntry, 'id' | 'addedAt'>) {
  const db = await getDb()
  await db.put('watchlist', {
    ...entry,
    id:      `${entry.mediaId}::${entry.providerId}`,
    addedAt: Date.now(),
  })
}

export async function watchlistRemove(mediaId: string, providerId: string) {
  const db = await getDb()
  await db.delete('watchlist', `${mediaId}::${providerId}`)
}

export async function watchlistClear() {
  const db = await getDb()
  await db.clear('watchlist')
}

// ── Progress ──────────────────────────────────────────────────────────────────

export async function progressGet(episodeId: string, providerId: string): Promise<ProgressEntry | undefined> {
  const db = await getDb()
  return db.get('progress', `${episodeId}::${providerId}`)
}

export async function progressGetForMedia(mediaId: string, providerId: string): Promise<ProgressEntry[]> {
  const db  = await getDb()
  const all = await db.getAllFromIndex('progress', 'mediaId', mediaId)
  return all
    .filter(r => r.providerId === providerId)
    .sort((a, b) => a.season - b.season || a.number - b.number)
}

export async function progressSave(entry: Omit<ProgressEntry, 'id'>) {
  const db        = await getDb()
  const completed = entry.durationMs > 0 && (entry.positionMs / entry.durationMs) >= 0.90
  await db.put('progress', {
    ...entry,
    id:        `${entry.episodeId}::${entry.providerId}`,
    completed,
    updatedAt: Date.now(),
  })
}
