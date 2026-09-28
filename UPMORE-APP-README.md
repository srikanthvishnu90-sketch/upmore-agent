# Upmore

Muse for making basic online money. Helps regular people make their first bit
of extra money online — one simple, vetted offer at a time with easy steps.

## Layout

- `index.html` — the built app (what Vercel serves). Generated, do not edit directly.
- `vercel.json`, `manifest.webmanifest`, icons, `img/` — static assets.
- `src/` — the real source:
  - `upmore-app-template.html` — app template with a `<!--__UPMORE_DATA__-->` placeholder
  - `data/upmore-data.json` — the route catalog: 1990 total routes
    (1402 researched, 265 unverified, 323 retired; retired routes are
    stripped at build time, so the app ships 1667)
  - `build-app.py` — injects the data into the template
  - `build-data.py` — rebuilds the data file from the catalog spreadsheet

## Build

```bash
cd src && python3 build-app.py   # writes src/upmore-app.html
cp src/upmore-app.html ../index.html
```

Edit the template, never `index.html`.

## Backend

Supabase project `upmore` (ref `mrwngntwmnaqrqhupvlt`):
- tables: profiles, routes, proof_log, agent_threads, agent_messages,
  playbook_progress, reminders (RLS on)
- edge function `agent-chat` (Anthropic-powered Guide agent, JWT-gated)

## Product rules

- 3 tabs: Home, Guide, You. Home is a single ranked queue
  (score = dollars × confidence × urgency ÷ effort) plus search and manual
  tracking of subscriptions, renewals, and claims. Guide/chat is central.
  You holds the profile, the money log (verified outcomes only), and the
  bank-sync private-beta waitlist.
- Statuses: `researched` = checked against the provider's own official
  terms; `unverified` = not yet checked; `retired` = dead, stripped at
  build. The agent only presents a route as a live offer when
  `verified_at` is within the last 7 days.
- The app never claims to watch, monitor, or check anything on a schedule —
  there is no background money monitoring. Detectors (duplicate charge,
  bill spike, renewal approaching) run only on data the user entered.
- Palette: green, sky, white, black only. No corporate/AI-serious language.
- The agent is a max-agency co-pilot: deep links, pre-filled info, step-by-step
  guidance, progress tracking, expiry reminders. The user personally does
  KYC, identity attestations, agreements, and Apple ID/Face ID taps.
- Every offer shows its verification state honestly. Nothing is "vetted"
  until it actually is.
