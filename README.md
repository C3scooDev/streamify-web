# Streamify Web

Open media center — add your own provider repos, watch anything in the browser.  
Built with Next.js 15 + Cloudflare Pages + HLS.js. Zero providers included.

## Local development

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Docker (condivisione su piu dispositivi)

### Avvio rapido con Docker Compose

```bash
docker compose up --build -d
```

L'app verra esposta sulla porta `3000` del tuo host, quindi accessibile da:

- stesso dispositivo: `http://localhost:3000`
- altri dispositivi in LAN: `http://IP_DEL_TUO_HOST:3000`

Per fermare:

```bash
docker compose down
```

### Build/run senza Compose

```bash
docker build -t streamify-web .
docker run --rm -p 3000:3000 --name streamify-web streamify-web
```

### Nota rete locale

Per la condivisione su altri dispositivi assicurati che:

- host e dispositivi siano sulla stessa rete
- firewall del computer host permetta traffico in ingresso sulla porta `3000`

## Deploy to Cloudflare Pages (free, permanent)

### Option A — GitHub auto-deploy (recommended)

1. Push this folder to a GitHub repo
2. Go to **Cloudflare Dashboard → Pages → Create a project**
3. Connect your GitHub repo
4. Set build settings:
   - **Framework preset**: Next.js
   - **Build command**: `npx @cloudflare/next-on-pages`
   - **Build output directory**: `.vercel/output/static`
5. Click **Save and Deploy**

Every `git push` auto-deploys. Your URL: `https://streamify.pages.dev`

### Option B — Manual deploy via CLI

```bash
npm install
npm run cf:deploy
```

Requires `wrangler login` first:
```bash
npx wrangler login
```

## Architecture

```
src/
  app/
    api/proxy/route.ts    ← CORS proxy (Cloudflare Edge Function)
    page.tsx              ← Home: provider rows
    search/               ← Multi-provider search
    browse/               ← Browse by provider
    browse/detail/        ← Detail + HLS player + episodes
    watchlist/            ← Saved titles (IndexedDB)
    settings/             ← Add/remove repos
  lib/
    engines.ts            ← ApiJsonEngine + ScraperHtmlEngine
    registry.ts           ← Provider registry (localStorage-backed)
    db.ts                 ← Watchlist + progress (IndexedDB via idb)
  store/index.ts          ← Zustand global state
  types/index.ts          ← All TypeScript types
```

## Adding a provider repo

In Settings, paste a URL pointing to a JSON file:

```json
{
  "name": "My Repo",
  "providers": [{
    "id": "my_provider",
    "name": "My Provider",
    "baseUrl": "https://example.com",
    "type": "api_json",
    "language": "it",
    "categories": ["movie", "series"],
    "imageBaseUrl": "https://cdn.example.com/images",
    "endpoints": {
      "search":   "/api/search?q={query}",
      "detail":   "/titles/{id}-{slug}",
      "episodes": "/titles/{id}/seasons/{season}",
      "watch":    "/watch/{titleId}?e={episodeId}",
      "stream":   "https://cdn.example.com/master/{scwsId}",
      "token":    "/api/token",
      "homepage": "/"
    },
    "headers": { "Referer": "https://example.com" },
    "enabled": true
  }]
}
```

Host the JSON on GitHub (raw URL), Cloudflare R2, or any CDN.

## How CORS is solved

All HTTP requests to external sites go through `/api/proxy` —  
a Cloudflare Edge Function that:
- Adds browser-like headers (User-Agent, Accept-Language, etc.)
- Follows redirects
- Extracts Inertia.js page data for SPA sites
- Returns JSON or HTML transparently

No external proxy service needed. Everything runs on your Cloudflare account.

## Engine types

| `type`          | Use case                                      |
|-----------------|-----------------------------------------------|
| `api_json`      | REST JSON APIs + Inertia.js SPAs (Laravel)    |
| `scraper_html`  | Plain HTML with `extra.selectors` CSS map     |
