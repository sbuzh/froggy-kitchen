# Froggy Kitchen — Status

_Last updated: 2026-09-20_

## What is being built

**Froggy Kitchen** is a friendly, installable **iPhone PWA** (vanilla JS, no build step) that:

1. Suggests healthy meals from the user's pantry ingredients via an LLM — with cuisine / servings / max cook time / dietary notes / allergy constraints.
2. Tracks daily nutrition gently: calories & protein vs. goals, water droplets, weight trend, streaks, meal history and favorites.

Persona: **Chef Froggy**, a tiny unbothered African dwarf frog in a chef hat. Strictly health-positive language (no diet-shaming; indulgent meals are honestly flagged, never hidden). All data lives in `localStorage` on-device — no accounts, no backend by default. The LLM interface is swappable: LM Studio running locally on your machine (no key, models discovered live from `/v1/models`), or cloud providers — Anthropic Claude Haiku 4.5 (default), Gemini, Groq — chosen and keyed in the app's Settings tab.

## Current status: ✅ Built & QA-verified

### App
- Complete single-page PWA at this folder (`index.html`, `css/`, `js/{store,providers,app}.js`, `manifest.webmanifest`, `sw.js`, `icons/`).
- Four tabs: **Cook** (pantry + constraints + meal generation), **Today** (calories/protein/water/weight/streak/log), **Favorites** (+ history), **Settings** (provider, API key, goals).
- **Local inference (LM Studio):** Settings offers an LM Studio provider — server URL field (default `http://localhost:1234`), model dropdown populated live from the server's `/v1/models` with a 🔄 Refresh button, no API key required (optional token supported if LM Studio auth is on). Talks OpenAI-compatible chat completions; friendly errors when the server is down or CORS isn't enabled.
- **Backups**: one-tap JSON backup of all data to the phone's Downloads folder (`froggy-kitchen-backup-YYYYMMDD-HHMMSS.json`), configurable auto-backup interval (off / 1 h / 6 h / daily, default daily) with on-launch + per-minute checks while open, and restore-from-file behind a confirm dialog.
- PWA-ready for iPhone: manifest, icons (192/512/apple-touch), service worker caching the app shell only (never API calls), `viewport-fit=cover`, full-screen launch.
- Honest match score: model returns `usedIngredients`; the app re-checks against the real pantry and computes "Uses X of your Y" client-side, so badges can never overstate what's in the kitchen.

### QA results
- **Canned-stub E2E (puppeteer-core):** 33/33 checks passed — all UI flows, error paths (incl. real 401 against live Anthropic API), persistence.
- **Backup feature E2E:** 17/17 checks passed — interval setting persists; manual save downloads a valid named JSON file with full data; auto-backup fires on load when due; wipe-all → restore round-trip recovers pantry + water; invalid files rejected with friendly toast and no data change; zero page errors.
- **Live subagent-LLM E2E:** 27/27 checks passed with a *real* LLM in the loop — app → local proxy (`:8322`, Anthropic `/v1/messages` shape) → file queue → background delegate child on `ollama/qwen3.8-27b` generating meal JSON live:
  - Gen 1 (9-item pantry, Mexican, vegetarian, peanut allergy, 3 servings, ≤45 min): **4 meals rendered in 356 s**; model correctly excluded "Chicken breast" due to the vegetarian note.
  - Gen 2 (empty pantry): shopping-list badges, 126 s; `usedIngredients: []` as specified.
  - Match badges verified honest against the subagent's raw output files; request payload verified field-by-field; no console/page errors.
- **LM Studio local E2E (real server, 2026-09-20):** 17/17 functional checks against a live LM Studio instance on `:8080` — provider UI toggles correctly; dead default URL (`:1234`) shows friendly error; **live model discovery** listed all 8 models from `/v1/models`; settings persisted with no API key; **real meal generation via Qwen3.8-27B** (3 meals in 138 s) rendered with honest match badges (“Uses 2 of your 2”); request verified hitting `:8080/v1/chat/completions`; zero page errors. Evidence: `/tmp/froggy-lm-qa/` (`qa.js`, `shots/live-results.png`).
- Evidence: screenshots in `/tmp/froggy-qa/subagent/shots/live-*.png`, logs in `/tmp/froggy-qa/qa-live.out` and `/tmp/froggy-qa/llm-proxy/proxy.log`.

### Docs
- `README.md` — run instructions, API key location (Settings tab), iPhone home-screen install steps, project layout.

## Deployment

- **Live:** <https://sbuzh.github.io/froggy-kitchen/> — GitHub Pages from branch `main` of the public repo `sbuzh/froggy-kitchen` (legacy build, path `/`). Push to `main` = auto-redeploy.
- Private Pages was not possible on this account's plan (API 422: "plan does not support GitHub Pages for this repository" — private-repo Pages needs a paid plan), so the repo is public. The code contains no secrets; API keys live only in each browser's localStorage, entered via Settings.
- Verified post-deploy: all assets 200, manifest served as `application/manifest+json`, service worker activates on the live origin, zero page/console errors (puppeteer smoke test against the deployed URL).

## How to run

```bash
cd froggy-kitchen && python3 -m http.server 8080   # open http://localhost:8080
```

Add an API key in the app's **Settings** tab (Anthropic / Gemini / Groq). For iPhone install, open <https://sbuzh.github.io/froggy-kitchen/> in Safari → Share → Add to Home Screen. See `README.md`.

## Known limitations / open items

- Nutrition values are model estimates per serving — guidance, not lab analysis.
- Data is per-browser `localStorage`; no cloud sync (local JSON backup/restore covers data loss — see Backups above).
- No push notifications (PWA on iOS limits these anyway).
- Optional future work: meal history calendar view, pantry shopping-list export, multi-language UI.

## QA infrastructure (ephemeral, in /tmp — not part of the app)

- `/tmp/froggy-qa/llm-proxy/proxy.js` — local Anthropic-shaped proxy on `127.0.0.1:8322`; queues requests to `pending/<id>.json`, resolves when a worker writes `done/<id>.json` (900 s hold-timeout, CORS, dead-socket-safe).
- `/tmp/froggy-qa/llm-proxy/watcher.js` — blocks ≤240 s; prints `REQUEST <id>` / `TIMEOUT` / `STOPPED` (STOP file triggers exit).
- The "LLM" is a background subagent child given a role-anchored brief: watch the queue, generate Chef Froggy meal JSON per schema, write + verify the done file. Restart pattern and full brief are in this project's session history; engine was stopped via STOP file after QA passed.
- **Puppeteer gotcha (cost hours):** with `isMobile:true`, CDP mouse events (`page.click` / `page.mouse.click`) mis-hit-test by a large y-offset — clicks land on whatever element happens to sit ~300px below the target. The app code is fine; real touch input hit-tests correctly. All QA scripts therefore dispatch clicks via JS (`page.evaluate(sel => el.click())`). Downloads in headless: use CDP `Page.setDownloadBehavior {behavior:'allow'}` (respects suggested filenames) and wait for file-size stability before parsing — Chrome writes downloads incrementally.
