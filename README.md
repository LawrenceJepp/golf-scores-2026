# Golf Weekend Scorer ⛳

A mobile web app for scoring a two-round golf weekend at **The Warwickshire Golf & Country Club**, with live scorecards and leaderboards for 10 players.

**Live app:** https://golf-weekend-scorer.vercel.app

---

## The weekend at a glance

| | Day 1 | Day 2 |
|---|---|---|
| **Course** | Kings Course, Yellow tees | Earls Course, Yellow tees |
| **Format** | Individual nett stroke play | Bonus Better Ball (Stableford) |
| **Handicap used** | Kings Course handicap | Earls Course handicap |
| **Ratings** | CR 72.0 · Slope 132 · Par 72 · 6,505 yds | CR 72.3 · Slope 127 · Par 72 · 6,674 yds |

**Players:** Lawrence, Sam, Joe, George, Hammy, Alex, Grail, Jacob, Max, Ben

---

## Using the app

### Getting started
1. Open the link on your phone and add it to your home screen:
   - **iPhone (Safari):** Share → *Add to Home Screen* → *Add*
   - **Android (Chrome):** ⋮ menu → *Add to Home screen* / *Install app*
2. The home screen has three options: **Day 1 – Kings Course**, **Day 2 – Earls Course** and **Handicaps**.

### Handicaps (do this first)
- Enter each player's **Handicap Index** and press **Submit**.
- Once all 10 are in, the page shows each player's index plus their **Kings** and **Earls** course handicaps.
- **Edit Handicaps** (top right) lets you change any handicap. Press **Save** to apply.
- Course handicaps come from the club's official Course Handicap tables for men's yellow tees.

### Scoring a round
1. Open the day, go to the **Scorecard** tab and choose your **Group**.
2. Tap **Submit scores**. Each player comes up in turn for the current hole. Tap their number of strokes, then **Submit**.
3. Once every player in the group has a score, the app moves to the next hole.
4. **Made a mistake?** Use the **‹ ›** arrows to go back to any hole already played. Adjust with **− / +** and press **Save**. If nothing changed, just use the arrows to move on.
5. After hole 18, press **Complete Round**.

> **Tip:** have one person per group enter scores. Everyone else can follow the live leaderboard.

### Leaderboards
- The **Leaderboard** tab is the default view for each day and updates automatically every few seconds.
- A green **● Live** line shows it's connected. If signal drops it shows **Offline** and keeps the last saved scores.

---

## Groups

### Day 1 – Kings Course
| Group 1 | Group 2 | Group 3 |
|---|---|---|
| George, Hammy, Ben | Lawrence, Max, Alex | Sam, Joe, Jacob, Grail |

### Day 2 – Earls Course
Teams are drawn from the final Day 1 leaderboard:

| Team | Player 1 | Player 2 |
|---|---|---|
| A | 1st | 10th |
| B | 2nd | 9th |
| C | 3rd | 8th |
| D | 4th | 7th |
| E | 5th | 6th |

Groups are arranged so team-mates don't play together:

| Group 1 | Group 2 | Group 3 |
|---|---|---|
| A1, B1, C1 | A2, D1, E1 | B2, C2, D2, E2 |

The Day 2 teams and groups appear once **all three Day 1 groups have pressed Complete Round**. They're fixed when the first Day 2 score is entered, so later corrections to Day 1 scores won't reshuffle them.

---

## Scoring rules

### Handicap strokes
Strokes are given by **stroke index (S.I.)**, starting from S.I. 1. A course handicap of 21 gets 2 strokes on S.I. 1–3 and 1 stroke on every other hole. On the scorecard, a red **•** marks each stroke a player receives on that hole.

### Day 1 – Nett stroke play
- **Total** = gross strokes.
- **Nett** is shown against par (e.g. −3, E, +5), using the handicap strokes received on the holes played so far. This keeps the live leaderboard fair mid-round.
- After 18 holes: **Nett = Total − Kings course handicap**.
- Lowest nett leads. Ties after 18 holes are split on **countback** (last 9, then last 6, last 3 and last hole, with handicap reduced proportionally).

### Day 2 – Bonus Better Ball
Each player scores individual **Stableford** points per hole, based on the nett score (strokes minus handicap strokes on that hole):

| Nett score | Points |
|---|---|
| Double bogey or worse | 0 |
| Bogey | 1 |
| Par | 2 |
| Birdie | 3 |
| Eagle | 4 |
| Albatross | 5 |

**Better ball:** on each hole the team scores the **better** of the two partners' points.

**Bonus points**, checked on every hole for each team:
- **+1** if **both** partners score **2 or more** points.
- **−1** if **both** partners score **0** points.

**Final Score = sum of the better ball on each hole + bonus.** Highest Final Score wins. The leaderboard also shows each player's own running Stableford total.

Team-mates play in different groups, so one may be ahead of the other. Until both have played a hole, the team counts whoever has. The bonus for that hole is added once both scores are in.

**Example (Team A):**

| Hole | A1 points | A2 points | Better ball | Bonus | Final Score (running) |
|---|---|---|---|---|---|
| 1 | 3 | 1 | 3 | 0 | 3 |
| 2 | 2 | 2 | 2 | +1 | 6 |
| 3 | 0 | 0 | 0 | −1 | 5 |
| 4 | 1 | 0 | 1 | 0 | 6 |

---

## Admin

**Handicaps → Admin → Reset all data** wipes every handicap, score, completed round and team draw. You have to type `RESET` to confirm. Use it after testing and before the first tee on Day 1. It can be used any number of times.

---

## Technical notes

### How it works
- **Front end:** plain HTML, CSS and JavaScript in `public/`, with no build step and designed for phones.
- **Back end:** a single Vercel serverless function (`api/state.js`) running in London (`lhr1`).
- **Database:** Upstash Redis, connected through the Vercel Marketplace.
- **Live updates:** each phone checks for changes every 3 seconds while the app is on screen. The server answers with a small "nothing new" reply unless something has changed. Phones pause checking when locked or in the background.
- **Many users at once:** each player's score on each hole is stored separately, so simultaneous submissions from different phones never overwrite each other.
- **Offline-safe:** if signal drops, entries are saved on the phone and sent automatically when the connection returns.

### Project structure
```
public/
  index.html      App shell
  app.js          Screens, scoring logic, sync with the server
  data.js         Course data, handicap tables, Stableford rules (shared with the API)
  style.css       Styles
api/
  state.js        GET/POST /api/state: read state, apply changes
  _store.js       Storage: Upstash Redis in production, local JSON file in development
dev-server.js     Local development server
vercel.json       Vercel settings (output folder, London region)
```

### Run locally
```bash
npm run dev
```
Then open http://localhost:3000. Local data is saved to `.data/db.json`, which isn't committed.

### Deploying
The GitHub repo is connected to the Vercel project, so **pushing to `main` deploys to production automatically**.

The database connection details (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) are stored as environment variables in Vercel, never in the code.
