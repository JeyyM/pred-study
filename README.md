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

Photos come from **multiple sheriff booking rosters and sex offender registries** (Alabama, Arkansas, Missouri, Iowa) so backgrounds and uniforms are not all from one jail.

```powershell
npm run fetch-mugshots
```

This downloads images to `public/images/` and rebuilds `src/data/trials.json` with matched offenses. Each trial tries to use suspects from **different source offices**.

## Manual edits

1. Add photos to `public/images/`, or run `npm run fetch-mugshots`.
2. Edit `src/data/trials.json` if needed — `"category": "sex"` marks the target on target-present trials.
3. Obtain IRB approval before collecting human data.

## Ethics

Do not use registry or mugshot data to harass or dox individuals. Research use should follow institutional review and applicable law.
