# Golf Weekend Scorer

Mobile web app for the two-round golf weekend at The Warwickshire (Kings Course Day 1, Earls Course Day 2, yellow tees).

- `public/` – the app (plain HTML/CSS/JS, no build step). `data.js` holds course data, handicap tables and scoring rules.
- `api/state.js` – single Vercel function storing everything in Upstash Redis.
- `dev-server.js` – local server (`npm run dev` → http://localhost:3000), stores data in `.data/db.json`.

## Deploy to Vercel

1. `npx vercel login`
2. `npx vercel --prod` (accept the defaults to create the project)
3. In the Vercel dashboard: project → **Storage** → **Create Database** → **Upstash for Redis** (free plan) → connect it to this project.
   This adds the `KV_REST_API_URL` / `KV_REST_API_TOKEN` environment variables.
4. `npx vercel --prod` again so the function picks up the database.

Before the weekend, use **Handicaps → Admin → Reset all data** to clear any test scores.
