# Cursor Restore — Aug 14, 2025

Handoff document for continuing work on this project in a new Cursor session. Read this first before making changes.

---

## 1. Project goal (the “why”)

**Research question:** Can people identify someone convicted of a **sex offense involving a minor** from a booking-style photo alone — or is “intuition” mostly **stereotype matching** (working backward from a perceived threat)?

**What the app does:**
- Shows **18 rounds** of **3 mugshots** (A / B / C)
- Participant picks who they think committed the qualifying offense
- **After** the pick, convictions are revealed
- Scoreboard tracks accuracy, hits, misses, hit rate
- Debrief explains that appearance-based detection is unreliable

**What this is NOT:**
- Not a tool to identify real predators in the wild
- Not meant for harassment/doxxing
- Requires IRB / ethics review before collecting human subject data

**Workspace path:** `C:\Users\asus\Desktop\pred test`

**Prior chat transcript (full history):**  
`C:\Users\asus\.cursor\projects\c-Users-asus-Desktop-pred-test\agent-transcripts\d6966403-f166-452d-9215-edcf730c8c48\d6966403-f166-452d-9215-edcf730c8c48.jsonl`

---

## 2. Tech stack

| Layer | Choice |
|--------|--------|
| UI | React 19 |
| Build | Vite 6 |
| Language | JavaScript (ES modules) |
| Styling | Plain CSS (`src/App.css`), **light theme** |
| Data | Static JSON (`trials.json`, `mugshot-pool.json`) |
| Images | `public/images/mug-*.jpg` |

**Run locally:**
```powershell
cd "C:\Users\asus\Desktop\pred test"
npm install
npm run dev
```
Open `http://localhost:5173` (Vite default).

---

## 3. Study design — current rules (important)

These were iterated based on user feedback. **Do not revert without asking.**

### 3.1 Forced choice every round
- **Removed** “None of the above” — user said it wasn’t fair
- Every round: pick **A, B, or C only**
- **Exactly one** qualifying target per round
- Chance baseline = **33%**

### 3.2 Multi-jurisdiction photos (reduce jail-background confounds)
- Mugshots come from **many sheriff offices**, not one jail
- Within a trial, builder **prefers different `sourceId`** for each suspect when possible
- Sources: AL, AR, MO, IA (see §5)

### 3.3 Same-gender lineups
- Each round is **all male OR all female** (never 2+1 mixed)
- Reason: a lone opposite-sex photo looks like a mistake and becomes an unintended cue
- Trial builder alternates male/female when **both** have enough targets + foils
- **Current data limitation:** registry pool has **male-only** minor-victim targets → all 18 trials are male-only until female SOR entries are added

### 3.4 Minor-victim targets only (critical)
- Study prompt says **“sex offense involving a minor”**
- Targets must qualify via `isMinorSexOffense()` in `scripts/lib/offense.mjs`
- **Adult-victim sex crimes are excluded** (e.g. “First Degree Rape — Victim was 30 year old female” is NOT a valid target)
- Qualifying examples:
  - Explicit victim age **under 18** in offense text
  - Charge language: “enticing a child,” “solicitation of a minor,” “child porn,” etc.
- UI label for targets: **“Sex offense (minor)”** (`src/utils/study.js`)

### 3.5 Presentation fairness
- A/B/C order **shuffled per session** (`prepareTrial` in `study.js`)
- Offense text hidden until after answer
- No names, addresses, or registry IDs shown
- Light theme with clear feedback:
  - Correct pick → **green** border/badge “✓ Correct”
  - Wrong pick → **red** on chosen card; actual answer shown in **green** “Correct answer”
  - Target reveal should **not** use red outline on correct picks

---

## 4. App architecture

```
pred test/
├── public/
│   ├── images/              # mug-001.jpg … mug-188.jpg (real booking/registry photos)
│   └── models/              # face-api.js weight manifests (NOT wired into app yet)
├── src/
│   ├── App.jsx              # Screen routing: consent → trial → results
│   ├── App.css              # Light theme + card/reveal styling
│   ├── main.jsx
│   ├── components/
│   │   ├── ConsentScreen.jsx
│   │   ├── TrialScreen.jsx
│   │   ├── Scoreboard.jsx   # Score, Round, Misses, Hit rate (4 columns)
│   │   ├── SuspectCard.jsx  # Photo + A/B/C + result badges
│   │   ├── RevealPanel.jsx  # Post-answer conviction list
│   │   └── ResultsScreen.jsx # Debrief + signal-detection summary
│   ├── data/
│   │   ├── trials.json      # 18 pre-built stimulus sets (what the app loads)
│   │   └── mugshot-pool.json # Full scraped pool + metadata
│   └── utils/
│       └── study.js         # Shuffle, scoring, feedback, category labels
├── scripts/
│   ├── fetch-mugshots.mjs   # Scrape + download + rebuild pool/trials
│   ├── enrich-gender.mjs    # Backfill gender on existing pool
│   ├── reclassify-offenses.mjs # Re-apply minor-target rules; drop adult-only sex
│   ├── rebuild-trials.mjs   # Rebuild trials.json from pool only (fast)
│   ├── generate-faces.js    # LEGACY — SVG placeholders (obsolete)
│   └── lib/
│       ├── offense.mjs      # Minor vs adult sex offense classification
│       ├── trial-builder.mjs # Same-gender trials, source de-confounding
│       └── gender.mjs       # Parse gender from sheriff HTML / name guess (Iowa)
├── package.json
└── README.md                # Partially outdated — see this file for full context
```

### Screen flow
1. **Consent** — checkbox + instructions
2. **Trial** (×18) — scoreboard, 3 photos, reveal panel after answer
3. **Results** — accuracy, debrief, hits/misses/bias label, restart

### Scoring (`study.js`)
- `category === 'sex'` marks the target in each trial
- Tracks: `correct`, `hits`, `misses`, `falseAlarms`, `targetPresent`
- `getBiasLabel`: over-identify vs under-identify vs balanced

---

## 5. Data sources (scraping)

Script: `scripts/fetch-mugshots.mjs`

### Jail rosters (foils — non-sex booking photos)
| sourceId | State | Base URL |
|----------|-------|----------|
| `al-chilton-jail` | AL | chiltoncountyso.org |
| `ar-logan-jail` | AR | loganso.com |
| `mo-stone-jail` | MO | stonecountymosheriff.com |
| `al-pickens-jail` | AL | pcsoal.org |
| `ia-winneshiek-jail` | IA | winneshiekcounty.iowa.gov (current inmates) |

### Sex offender registries (targets — minor-victim only)
| sourceId | State | Base URL |
|----------|-------|----------|
| `al-chilton-sor` | AL | chiltoncountyso.org |
| `ar-logan-sor` | AR | loganso.com |
| `al-pickens-sor` | AL | pcsoal.org |

**Scrape notes:**
- BJM template sites: roster pages → `roster_view.php?booking_num=` for charges + gender
- SOR pages → `sex_offender_view.php?id=` for offense level text + gender + image
- Iowa jail: parse name from HTML, guess gender via first-name heuristics (`gender.mjs`)
- JailBase API was tried early on — unreachable (522); county scraping worked instead
- `npm run fetch-mugshots` takes ~3–4 minutes (network + rate limiting sleeps)
- Sex offender images saved as `.jpg` (not `.php`)

---

## 6. Data pipeline — how to refresh

```powershell
# Full re-scrape (downloads images + rebuilds pool + trials)
npm run fetch-mugshots

# Backfill gender on existing pool (no re-download)
npm run enrich-gender

# Re-apply minor-target classification; remove adult-only sex records
npm run reclassify-offenses

# Rebuild trials.json from mugshot-pool.json only (fast)
npm run rebuild-trials
```

**Typical order after manual pool edits:**
1. `npm run reclassify-offenses`
2. `npm run rebuild-trials`

### Key files
| File | Role |
|------|------|
| `src/data/mugshot-pool.json` | Master record list: image, offense, category, gender, minorTarget, etc. |
| `src/data/trials.json` | 18 trials consumed by React app |
| `public/images/mug-*.jpg` | Image files referenced by pool/trials |

### Pool record fields (current)
```json
{
  "sourceId": "al-chilton-sor",
  "sourceState": "AL",
  "sourceType": "sex-offender-registry",
  "offense": "Enticing a Child",
  "category": "sex",
  "year": 2026,
  "gender": "male",
  "image": "mug-065.jpg",
  "minorTarget": true,
  "qualifyingMinor": true,
  "faceVisible": true
}
```

- **`minorTarget`** — set by `offense.mjs`; trial builder only uses these as targets
- **`qualifyingMinor`** — duplicate-ish flag present in expanded pool (may have been set in a session whose script isn’t in repo)
- **`faceVisible`** — boolean on pool records; **`public/models/`** has face-api weights but **no app/script currently uses this field** — likely planned for filtering bad photos

Pool metadata timestamps (as of last save):
- `genderEnrichedAt`, `reclassifiedAt`, `offenseAuditAt`, `orientationFixedAt`, `expandedAt`

---

## 7. Classification logic (`scripts/lib/offense.mjs`)

**Target qualification:** `isMinorSexOffense(text)`

1. If offense mentions victim ages (`X year old`), **all** parsed ages must be **< 18**
2. Else if charge matches minor-specific patterns (child, minor, solicitation of minor, etc.) → qualify
3. Else → **not** a study target

**Adult exclusion:** `isAdultSexOffense(text)` — used by `reclassify-offenses.mjs` to remove records from pool

**Important user feedback addressed:**
> “If the victim is a 30 year old female, doesn’t this not make them a pedo?”

**Answer:** Correct. Adult-victim rape is not a minor offense. The old broad `SEX_PATTERNS` (any “rape”) wrongly included those. Fixed by strict minor filtering. User may have misread “15 year old” as “30” in one screenshot — but the underlying fix was still needed.

---

## 8. Trial builder (`scripts/lib/trial-builder.mjs`)

Builds 18 trials from pool:
- 1 **minor-target** (`category === 'sex'` && `minorTarget !== false`) + 2 **foils** (`category !== 'sex'`)
- All three share same **`gender`**
- Prefers unique **`sourceId`** per suspect in a round
- Alternates male/female rounds when both genders have capacity
- Exports trial field `gender: 'male' | 'female'` (metadata, not shown to participant)

---

## 9. UI copy (keep consistent)

| Location | Wording |
|----------|---------|
| Consent headline | “Can appearance predict offense type?” |
| Task prompt | “sex offense involving a minor” |
| Category label | “Sex offense (minor)” |
| Correct feedback | “Correct — you identified the person with the minor-victim sex offense.” |
| Debrief | Stereotype matching vs phenotype; accuracy near chance |

---

## 10. Design evolution timeline (conversation summary)

1. **Started** as plain HTML/JS with placeholder SVG faces + balanced target-present/absent trials + “None of the above”
2. **Converted to React + Vite** per user request
3. **Real mugshots** from multiple sheriff jurisdictions (not one jail background)
4. **Removed “None of the above”** — forced A/B/C every round, always one target
5. **Light theme** + clearer green/red feedback (no red on correct answer)
6. **Same-gender lineups** — no mixed-gender rounds
7. **Minor-victim filter** — adult sex crimes excluded from targets; UI label aligned
8. **Pool expanded** to ~188 images (from original ~82) — likely a later session; check pool timestamps

---

## 11. Current state (as of handoff)

| Metric | Value |
|--------|-------|
| Pool records | 188 |
| Image files | 188 (`mug-001` … `mug-188`) |
| Trials | 18 |
| Male minor-targets | ~50 |
| Female minor-targets | 0 |
| Female foils | ~26 |
| Unknown gender | 3 records |
| Trial gender mix | All male-only (data limit, not code limit) |
| `trials.json` meta version | 5 |

---

## 12. Known issues & open work

### Data
- [ ] **No female minor-victim targets** in current SOR scrape → need more jurisdictions or deeper SOR scraping for female registry entries
- [ ] **3 records missing gender** — Iowa name-guess failures; run `enrich-gender` or manual fix
- [ ] Some jail records still have generic offense `"Booking charge"` from imperfect charge parsing
- [ ] `qualifyingMinor` / `faceVisible` fields exist in pool but **no maintained script** in repo references them — clarify or re-implement if needed
- [ ] `public/models/` face-api weights present but **not integrated** — possible future: auto-filter photos where face isn’t visible

### App
- [ ] No backend — responses only in browser memory (lost on refresh)
- [ ] No IRB/consent logging/export
- [ ] README outdated (missing new npm scripts, same-gender rules, minor filter)
- [ ] `trials.json` meta description may drift from `rebuild-trials.mjs` — rebuild to sync

### Ethics / legal
- [ ] IRB approval before human data collection
- [ ] Do not use for harassment; public records ≠ permission to humiliate individuals

---

## 13. Commands cheat sheet

```powershell
npm run dev                 # Dev server
npm run build               # Production build
npm run preview             # Preview production build
npm run fetch-mugshots      # Full scrape + download + rebuild
npm run enrich-gender       # Gender backfill only
npm run reclassify-offenses # Minor-target audit + pool cleanup
npm run rebuild-trials      # Fast trial rebuild from pool
npm run generate-faces      # Legacy placeholders (ignore unless testing without network)
```

---

## 14. How to modify stimuli safely

### Change which photos appear in the study
1. Edit pool or re-scrape
2. `npm run reclassify-offenses`
3. `npm run rebuild-trials`
4. Restart dev server / hard refresh browser

### Mark a trial target manually
In `trials.json`, exactly **one** suspect per trial needs `"category": "sex"`. Offense should pass `isMinorSexOffense()`.

### Add a new sheriff source
1. Add site config to `BJM_ROSTER_SITES` or `BJM_SOR_SITES` in `fetch-mugshots.mjs`
2. Implement/adapt HTML parsers (BJM template vs Iowa format)
3. For SOR: only keep records where `isMinorSexOffense(offense)` is true
4. Run fetch → enrich-gender → reclassify → rebuild-trials

---

## 15. User preferences (for AI assistants)

- **Minimize scope** — small focused diffs, don’t refactor unrelated code
- **Don’t commit** unless user explicitly asks
- **Don’t create markdown/docs** unless asked (this file was explicitly requested)
- User cares deeply about **fairness** of the experimental design — always ask whether a change introduces a confound (gender, jail background, adult vs minor offense, forced vs optional response, etc.)
- User wants the study to measure **stereotype matching**, not jail uniform detection or gender cues

---

## 16. Quick mental model for the next session

```
Public sheriff pages
       ↓ fetch-mugshots.mjs / enrich-gender.mjs
mugshot-pool.json  ← offense.mjs filters minor targets
       ↓ rebuild-trials.mjs (trial-builder.mjs)
trials.json
       ↓ React app (study.js shuffles per session)
Participant sees 18 same-gender lineups → picks A/B/C → reveal → debrief
```

**If something looks wrong in a round:** trace suspect `image` → `mugshot-pool.json` → check `offense`, `minorTarget`, `gender`, `sourceId`.

---

*Generated for Cursor handoff. Update this file when major design or pipeline changes are made.*
