# Appearance & Offense Identification Study

React app (Vite) that tests whether people can identify someone convicted of a **sex offense involving a minor** from booking-style photos alone.

## Run locally

```powershell
cd "C:\Users\asus\Desktop\pred test"
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Build for production

```powershell
npm run build
npm run preview
```

## Fair test design

| Feature | Purpose |
|--------|---------|
| 18 forced-choice trials | Exactly one sex offense per round; pick A, B, or C |
| No “none” option | Every round requires a choice among three faces |
| Shuffled A/B/C order | Target position randomized each session |
| Diverse foil crimes | Property, drug, violent, financial, traffic, etc. |
| Multi-jurisdiction photos | Mugshots from AL, AR, MO, IA sheriff sources — not one jail |
| Signal-detection metrics | Hits, correct rejections, false alarms |

## Project structure

```
pred test/
├── public/images/       # real booking/registry photos (mug-*.jpg)
├── src/
│   ├── App.jsx          # study state + screen routing
│   ├── components/      # Consent, Trial, Scoreboard, Results
│   ├── data/trials.json # stimulus set
│   └── utils/study.js   # shuffle, scoring, feedback
└── scripts/
    ├── fetch-mugshots.mjs  # pull photos from public sheriff sites
    └── generate-faces.js # legacy SVG placeholders
```

## Refresh mugshots from public records

Photos come from **multiple sheriff booking rosters and sex offender registries** (Alabama, Arkansas, Missouri, Iowa, Texas, and Faulkner County’s Green/FASO roster) so backgrounds and uniforms are not all from one jail.

```powershell
npm run fetch-mugshots
```

This **replaces** all `mug-*.jpg` files and rebuilds the pool and trials.

To **add new jurisdictions without wiping** photos you already validated:

```powershell
npm run expand-pool
```

Source definitions live in `scripts/lib/sources.mjs` (BJM jail rosters, county SOR pages, Iowa-style rosters, Green/FASO rosters).

After fetching or expanding the pool, backfill **name, age, gender, and race** from sheriff detail pages:

```powershell
npm run enrich-profile
```

Then refresh `/validation`. New scrapes also store age/name when available.

For rows **without booking age**, estimate age locally (lineup matching only, never shown in the study):

```powershell
npm install
npm run estimate-face-age
npm run apply-age-matching
npm run rebuild-trials
```

Booking age always wins over model estimates. Under-18 (booking or estimate) is excluded from trial building.

**Photo variety:** Targets (often registry) and foils (often jail bookings) may differ in uniform, background, and resolution. That is acceptable for this study; note `sourceType` in methods. Jail scrapes can still add **target** passes when someone with a qualifying charge is on the roster.

## Manual edits

1. Add photos to `public/images/`, or run `npm run fetch-mugshots`.
2. Edit `src/data/trials.json` if needed — `"category": "sex"` marks the target on target-present trials.
3. Obtain IRB approval before collecting human data.

## Ethics

Do not use registry or mugshot data to harass or dox individuals. Research use should follow institutional review and applicable law.
