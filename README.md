# 🐸 Froggy Kitchen

A friendly, installable **PWA for iPhone** that suggests healthy meals from what's already in your pantry (via LLM) and gently tracks your day — calories, protein, water, weight trend, streaks. Your co-pilot is **Chef Froggy**, a tiny unbothered African dwarf frog in a chef hat.

No accounts, no backend, no build step. All data stays on your device (`localStorage`). The only network calls are the meal-planning requests you explicitly trigger, sent straight from your browser to the LLM provider you choose.

## Features

- **Cook tab** — add pantry ingredients (quick-add chips or free text), pick cuisine / servings / max cook time / dietary notes / allergies, and get 3–5 balanced, beginner-friendly meal ideas with steps, per-serving nutrition, and an honest "Uses X of your Y" match score.
- **Today tab** — log meals ("ate this" from any card or quick-log), track calories & protein against your goals, tap water droplets, log weight (trend chart after 2+ points), see your streak.
- **Favorites tab** — save meals you love; "cooked it" entries land in history.
- **Settings tab** — provider + model, API key, daily calorie/protein/water goals.
- **Backups** — one-tap JSON backup of all your data (pantry, log, water, weight, favorites, settings) to your phone's Downloads folder, optional auto-backup on an interval you choose (off / hourly / every 6 h / daily), and restore-from-file.

Health-positive by design: balanced meals first, honest `indulgent` flagging for the occasional treat, and zero diet-shaming language anywhere.

## Run it locally

Any static file server works (no build step):

```bash
cd froggy-kitchen
python3 -m http.server 8080
# open http://localhost:8080
```

Or just double-click `index.html` — the app also runs from `file://`, though a local server is recommended so the service worker (offline shell) can register.

## Where does the API key go?

**In the app, on the Settings tab.** There is no `.env`, no config file, no backend.

1. Open **Settings**.
2. Pick a provider:
   - **Claude · Anthropic** (default, model `claude-haiku-4-5`) — key from <https://console.anthropic.com>. Haiku 4.5 is $1 / $5 per M tokens; casual use costs well under ~$2/month.
   - **Gemini · Google AI Studio** (`gemini-2.5-flash`) — free-tier key from <https://aistudio.google.com>, no credit card needed.
   - **Groq** (`llama-3.3-70b-versatile`) — free-tier key from <https://console.groq.com>.
3. Paste your API key, hit **Save**. The key is stored only in this browser's `localStorage` and sent only to the provider you selected (Anthropic calls include the `anthropic-dangerous-direct-browser-access: true` header so they work straight from a browser).

> Tip for testing without spending tokens: point the **API base URL** field (visible under the Anthropic option) at any local proxy that speaks the Anthropic `/v1/messages` shape, and use any non-empty key. That's exactly how this project's QA runs its "local LLM" mode.

## Backups & restore

All data lives in your browser's `localStorage`, which Safari can wipe (e.g. "Clear Website Data", storage pressure, or a reinstall). The **Your data** card on the Settings tab protects against that:

- **Save backup now** — downloads `froggy-kitchen-backup-YYYYMMDD-HHMMSS.json` containing everything (pantry, meal log, water, weight history, favorites, settings incl. your API key).
  - On iPhone: it lands in the **Files app → Downloads**. You can move it to iCloud Drive / another folder from there if you want an off-device copy.
- **Auto-backup interval** — Off / Every hour / Every 6 hours / Daily (default). When the interval has elapsed, the app saves a backup automatically on launch and re-checks every minute while open. The card shows when your last backup was saved.
- **Restore from file…** — pick one of your backup files; after a confirm dialog the current data is replaced with the backup's contents and the app reloads.

The backup format is plain JSON (`{app, version, exportedAt, data: {froggy.* keys}}`) — human-readable, and restore accepts both the wrapped file and a bare key map.

## Install on your iPhone home screen

The app must be served over **HTTPS** (or `localhost`) for PWA install to work.

**It's already deployed:** <https://sbuzh.github.io/froggy-kitchen/> (GitHub Pages, repo: `sbuzh/froggy-kitchen`).

1. On your iPhone, open <https://sbuzh.github.io/froggy-kitchen/> in **Safari**.
2. Tap **Share** (the square-with-up-arrow icon) → **Add to Home Screen** → **Add**.
3. The frog icon appears on your home screen; it launches full-screen like a native app and works offline for the shell (meal generation obviously needs internet).

Want your own copy? Push this folder to any static host — GitHub Pages, Netlify, Cloudflare Pages, Vercel… all paths in the app are relative, so subpath deploys work as-is.

## Project layout

```
froggy-kitchen/
├── index.html            # single page, all four tabs inline
├── manifest.webmanifest  # PWA manifest (name, icons, theme)
├── sw.js                 # service worker — caches the app shell only, never API calls
├── css/styles.css        # all styling (mobile-first, iPhone Safari tested)
├── js/
│   ├── store.js          # FroggyStore: localStorage persistence (pantry, log, water, weight, settings)
│   ├── providers.js      # FroggyProviders: Anthropic / Gemini / Groq + JSON validation & normalization
│   └── app.js            # UI wiring, tabs, meal cards, match scores, toasts
└── icons/                # icon.svg source + PNGs (192, 512, apple-touch-icon)
```

## How the "match score" stays honest

The model returns `usedIngredients` per meal; the app **re-checks that list against your actual pantry** and computes "Uses X of your Y ingredients" client-side. If the model hallucinates an ingredient you don't have, it simply isn't counted — the badge can never overstate what's in your kitchen.

## Notes & limitations

- Data is per-browser `localStorage` — clearing site data clears your history. Use the **Backups** feature (Settings → Your data) to keep a JSON copy in Files → Downloads and restore it any time; there is no cloud sync.
- Nutrition values are the model's honest estimates for one serving; they're guidance, not lab analysis.
- The service worker caches only static assets; it never intercepts or caches provider API calls.
