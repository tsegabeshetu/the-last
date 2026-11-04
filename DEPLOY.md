# How to deploy the AEC website

AuraStay Emergency Portal Center (AEC) — everything needed to put the site online.

## What's inside

| Folder | What it is |
| --- | --- |
| `aec/frontend/` | The website itself (HTML, CSS, JavaScript — no build step) |
| `aec/backend-python/` | API for live stats, incident reports, SOS, rentals, deliveries, news |
| `aec/backend-java/` | Optional dispatch simulator (needs JDK 17+) |
| `aurastay-node/` | Optional Node.js host that serves the website plus its own API |

## Option A — Publish the website only (simplest, ~2 minutes)

1. Upload the **contents** of `aec/frontend/` to any static host:
   Netlify (drag & drop the folder), Vercel, Cloudflare Pages, GitHub Pages,
   or the `public_html` / `www` folder of your web host.
2. The site is live. The home page always shows the headline numbers:
   **SOS activations 400+ · Partner pharmacies 23k+ · Vehicles 1.2k+**,
   with the "AuraStay Emergency Portal Center" title left-aligned.
3. Offline mode works out of the box: with no internet the visitor gets the
   cached site plus an offline banner, and every submit (report, SOS, car
   rental, medicine order, missing-person report) turns into an SMS to **611**.

Note: the AI assistant (ASAYECH) and the map (OpenStreetMap tiles, no key) work
without any API. The activity feed, the news list and the live-map incident list need the
API from Option B — without it they show their empty/error state. The headline
numbers still show.

## Option B — Website + live API (recommended)

```bash
cd aec/backend-python
pip install -r requirements.txt
python run.py        # API on http://127.0.0.1:8000
```

Serve `aec/frontend/` on the same origin and reverse-proxy `/api/*` to the
API. For a split deploy, point the browser at the API once:

```js
localStorage.setItem('aec.apiBase', 'https://your-api-domain')
```

Allow your site origin for the API:

```bash
AEC_CORS_ORIGINS=https://your-site-domain
```

### AI assistant (ASAYECH)

No key and no API needed: the assistant answers inside the browser from a
built-in set of common questions with clear steps (English and Amharic), so it
replies instantly and keeps working offline.

### Map

No key needed either: maps use the Leaflet library bundled in
`frontend/vendor/leaflet/` with OpenStreetMap tiles.

- The home page and the live-map page pin every incident that has coordinates;
  click a pin for its title, place, severity, status and time.
- Every form with a place (incident report, missing person, car rental, medicine
  order) drops a pin where the citizen taps, or uses their GPS position, and
  that pin supplies the latitude/longitude sent with the submission.
- Tiles need an internet connection. Offline, the pins and the page still work
  on a plain background.

Optional: if you call the backend's `/api/assistant/chat` endpoint directly,
it can rephrase answers through any OpenAI-compatible model — see
`.env.example` for the three variables to set.

## Option C — Node.js host (alternative)

```bash
cd aurastay-node
npm install
npm start             # http://localhost:3000
```

## Test locally before uploading

```bash
# terminal 1 — API
cd aec/backend-python
pip install -r requirements.txt
python run.py

# terminal 2 — website
cd aec/frontend
python serve.py       # http://127.0.0.1:5173
```

Open http://127.0.0.1:5173 — reduced home-page icons, left-aligned title,
400+/23k+ headline numbers and offline→SMS are all part of this build.
