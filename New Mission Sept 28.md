# New Mission — 28 September 2026

Handoff for the **current** scientific and product goal. This supersedes the “can people identify the category?” framing as the **paper** goal. The existing Vite quiz remains a **prototype / play mode**, not the confirmatory instrument.

Workspace: `C:\Users\asus\Desktop\pred test`  
Author context: DLSU **BS-MS Computer Science**, HCI-adjacent; project is independent unless a faculty sponsor and ethics board are attached.  
Target venue: **INTERACT 2027 short paper** (Tallinn, Estonia, 23–27 August 2027). Short-paper deadline historically later than full papers; **3 May 2027** was posted for other tracks — **reconfirm on [interact2027.org](https://interact2027.org/)** before submitting. Typical short length (2025): **8 pages + 2 pages references**, Springer LNCS, anonymous.

---

## 1. One-sentence mission

People already make snap judgments from faces. This project tests whether a **3-alternative forced-choice (3AFC) UI** **trains** that judgment via trial-by-trial feedback, and **what visual recipe** it installs — using a legally defined conviction label only as **scoring / feedback ground truth**, never as a detector, hunt, or public ranking of people.

---

## 2. Research questions (in order)

**RQ1 (HCI / primary for INTERACT).**  
Does silent 3AFC vs trial-by-trial **correct/incorrect** feedback change later picks (learning curve, final accuracy, confidence)?

**RQ2 (mechanism / “the recipe”).**  
What are people being trained **on**? Traits and image properties (perceived/recorded age, threat, trustworthiness, image quality, facial hair, crop, source artifacts, etc.) — **not** a published gallery of faces.

**RQ3 (secondary).**  
Is group accuracy above chance (**33%** in 3AFC) in the silent arm, the feedback arm, or both? Treat this as **setup**, not the headline.

**RQ4 (harm-containment, must appear in the paper).**  
Even if accuracy is ~50% and feedback helps, the result is **unusable as identification** at real-world base rates and must not be framed as skill at spotting a person.

---

## 3. What this is not

- Not a tool to identify, screen, accuse, or hunt anyone.
- Not “spot the offender,” “creep,” “guilty face,” or equivalent.
- Not a public answer key, leaderboard, or “most selected” mugshot gallery.
- Not an affective-computing / face-classifier product. **Do not train a model** to predict the target category.
- Not a joke talk. Tone is stone-faced and precise even if the private motivation was morbid curiosity.
- Not “AI snuck a paper past reviewers.” AI is **labor**; the author **owns** design, verification, and claims.

Operational participant language (or equivalent, ethics-approved):

> Individuals convicted of a sexual offense involving a child.

Debrief concept (required):

> This study does not show that criminal behavior or sexual interests can be diagnosed from a face. Any group-level effect may be small, confounded, and unsuitable for judging any individual. Feedback in an interface can train shortcuts (for example age or photo quality), not a valid detector.

---

## 4. Why this topic (sayable vs private)

**Sayable (paper, INTERACT, faculty, ethics).**  
First impressions of **this legal category already exist** in the world (e.g. “he looks like…”). The experiment instruments that judgment and asks whether **UI feedback** trains it and **onto what recipe**. Convictions are an **external label** for the 3AFC, not a claim of moral essence.

**Do not say in the paper or talk.**  
Hook, spice, try harder, funny, dark, morbid, provocative, “neutral topics are boring.” Those read as using stigma for engagement.

**Methods, not the moral.**  
“We needed a verifiable label” is true but **does not uniquely justify this label** (AI-vs-real also has a label). Do not oversell convictions as “clear-cut truth.”

---

## 5. INTERACT 2027 packaging (short paper)

**Theme:** “Meanings and experiences.”  
Fit = the **interface is a reading situation**; feedback changes what later faces **mean**. Do not wallpaper Lotman or Estonian e-ID.

**Title / abstract pattern (required shape):**

> What trial-by-trial feedback trains in a matched 3AFC first-impression task.

Not: *Can people identify individuals convicted of …*

**Lead with RQ1–RQ2.** Put ~50% vs 33% in Results, not in the first sentence of the abstract.

**Hypothetical “strong results” pack** (only if true; do not chase):

1. Mean accuracy clearly above 33% (e.g. ~50%).  
2. Feedback arm significantly outperforms silent arm.  
3. A surprising **recipe** (traits / image stats from paths: trial index, choices, optional RT, optional self-report) explains the training.

If (3) is “they learned older / harsher / grainier,” that is the **benevolent punchline**: the UI trained a stereotype that correlates in this set.

**Venue stats (context, not a promise):**  
INTERACT 2023 short-paper accept rate **~31%** (peer-reviewed track); 2025: 34 shorts + 69 full from 330 mixed-track submissions. CORE/ICORE **B**, CCF **C**, Springer LNCS.

**If everything is by the book and the strong pack is real:** treat short-paper odds as **~40–50%**, not a lock. Topic tax remains. Wrong headline (“people detect at 50%”) knocks this down.

**Talk:** stone-faced; ethics and matching early; contribution = **feedback + recipe**; Q&A will still ask “why these photos?” Answer with §4 sayable paragraph, not spice.

---

## 6. Experimental design

### 6.1 Task

- **3AFC:** exactly three faces, labels A/B/C, **must pick** (no skip / none).  
- Chance = **1/3**.  
- **Exactly one** target per round: convicted of a **sexual offense involving a child** (minor-victim operationalization; adult-victim sex offenses are **not** targets).  
- **Two foils:** other **non-sex** convictions (property, drug, non-sexual violent, financial, traffic, etc.). Not adult-victim sex offenses; not mixed/ambiguous; not arrests-only.  
- No names, sources, filenames that leak category, or offense text **before** the pick.  
- Same sex within a round (all male or all female).  
- Recorded **age at photograph** within **±5 years** inside a round.  
- **Grayscale.** Drop unusable images (text-heavy, tiny, extreme crop mismatch).  
- Shuffle A/B/C and trial order. **Do not** randomize age *inside* the triplet.  
- Prefer different source offices within a round when possible.  
- **No face repeat** within a participant’s scored session.

### 6.2 Session length and pool (target protocol)

| Item | Target |
|------|--------|
| Scored rounds | **30** (90 unique people) |
| Pool shape | **~100** verified targets, **~200** non-sex foils, all adults, photos of people **18+** |
| Collection | Foils **fill the same age-by-sex bins** as targets (distributions, not only means/medians) |
| Female lineups | Only when three matches exist; do not mix sex; male-only sessions are acceptable if the pool is male-heavy |

Prototype today: **18** fixed trials in `src/data/trials.json`, per-trial reveal — **not** this protocol.

### 6.3 Two silent arms (the HCI manipulation)

On first visit, assign **at random** (cookie is OK for a prototype; **server-side** assignment for the paper):

| Arm | During the 30 | Purpose |
|-----|----------------|---------|
| **Silent** | Pick → next trial. No ✓/✗, no “this card was the target.” | Untrained first impression |
| **Feedback** | Pick → **which card** matched the target **category** (A/B/C only). No names, no foil crime list. | Does the UI train? |

- Do **not** label arms “training” vs “control” on screen.  
- Consent must mention: *you may or may not see whether each pick was correct.*  
- **Play mode** (family, professor demo) may reveal every time; **do not mix** with the logged first session.  
- **First finished session only** per device (best-effort). Do not overwrite the first complete with later tries.

### 6.4 End of session (both arms)

- Score: **X / 30**, chance ≈ **10 / 30**. No grades, badges, or “you have a knack.”  
- Short debrief (§3).  
- Share **the URL only**, not a prefilled “I scored 67% spotting ….”  
- No leaderboards. No review gallery of identifiable faces.

### 6.5 Sample size (paper, not family)

- Aim **~100+ valid completers per arm** (total **~200–250** finished first sessions after dropout).  
- Floor for a thin short paper is higher than “20 relatives.”  
- Family scores on the **current 18-trial revealing app** (e.g. ~67% and 50%+) are **not** the finding; they suggest **shared cues + answer-key training** on unmatched items.

---

## 7. Analysis (respectful, confirmatory-ready)

Pre-specify as much as possible before looking at the full sample.

**Primary.**  
- Accuracy over trial index (e.g. rounds 1–10 vs 21–30) by arm.  
- Final accuracy: feedback vs silent (and each vs 33%).

**Mechanism.**  
- Face-level pick probability **conditional on exposure** (choice model / mixed-effects), **not** raw click totals.  
- Correlate face effects with **ratings and metadata** (age, quality, source, optional independent ratings).  
- Optional: “what did you go on?” after some rounds or at the end.  
- “Path” = trial sequence, choices, optional RT — not extra invasive tracking.

**Report in the paper.** Trait/image **coefficients**. Anonymous stimulus IDs in a restricted file. **Never** a ranked mugshot plate.

**If above chance:** localize the cue; if it dies after age/quality/threat, say so. If a residual remains, call it **unexplained in this dataset**, show it is still useless at realistic base rates, refuse detector claims.

---

## 8. Ethics, law, DLSU

- **Human subjects:** US (or other) adults taking 30 rounds **is** research. A tasteful PDF does not replace a board.  
- **Order:** demo + one-page protocol → **faculty sponsor** → DLSU ethics (BS-MS students may use **graduate conference / research** paths once official) → then recruitment.  
- **Do not** run Reddit / 200-person collection first and ask for a stamp later. That dataset is usually **unusable** for INTERACT.  
- Conviction-only, adults in photos, no minors photographed.  
- Restricted storage of identity/source; participants never see it.  
- **INTERACT/ACM-style AI policy:** if AI is used to **conduct** research (code, analysis, figures, trial construction), **describe it in Methods**. Writing polish may not require disclosure under current ACM text, but **authors remain fully responsible**. AI is **not** an author. No fabricated data or citations.

DLSU typically **subsidizes** faculty (and some graduate) presenters (e.g. Science Foundation travel **US$600–800** by region + registration cap) — **not** a full Manila–Tallinn ticket for an unofficial hobby project. A faculty coauthor on an official paper is how funding becomes possible.

---

## 9. AI orchestration (allowed intent vs disallowed story)

**Allowed:** use AI to implement matching, the quiz, analysis pipelines, drafts; **you** specify the design, write tests, check every number, reject bad completions.

**CV / recruiter line (if asked):**  
> I used AI to move faster on engineering. I designed the study, verified the pipeline, and owned every claim. INTERACT would be evidence the **work** survived review, not that a model fooled anyone.

**Disallowed as the pitch:** “I orchestrated AI to get a finding past reviewers.” Peer review is not an LLM benchmark.

**Developer jobs:** an INTERACT short paper is a **footnote**. Internships and shipped code hire. Keep the paper title boring if they Google it.

---

## 10. Implementation split

| Mode | Behavior | Data |
|------|----------|------|
| **Study (paper)** | Random silent vs feedback; 30 matched rounds; end score only | First complete session, arm ID, trials, choices, RT, optional survey |
| **Play / demo** | Current-style reveal-after-each is OK | **Exclude** from confirmatory analysis |

Near-term engineering (prototype → protocol):

1. Arm assignment + consent text for feedback uncertainty.  
2. Kill scored-path per-trial reveal unless arm = feedback (category card only).  
3. Triplet builder: same sex, ±5 years, grayscale, disjoint 30, non-sex foils.  
4. End screen: chance comparison, debrief, share URL only.  
5. Logging without identity leakage in client payloads.

---

## 11. Paper outline (8-page short)

1. **Introduction** — First impressions already happen; UI feedback may train them; legal label as operationalization; not a detector.  
2. **Related work** — Person perception / stereotype vs accuracy; feedback and perceptual learning; lineup matching; dual-use / ethics of sensitive images.  
3. **Method** — Pool, matching, 3AFC, two arms, N, ethics ID, what was logged.  
4. **Results** — Learning curves; arm contrast; recipe (traits).  
5. **Discussion** — What the UI trained; base rates; limitations (Reddit/device cookie, US photos, remaining confounds).  
6. **Conclusion** — Interface trains a recipe; unsuitable for judging individuals.

---

## 12. Success definition

The project **succeeds as science** if:

- Arms are randomized and logged; matching is enforced; no public key/gallery; analysis is face/trait-level as well as accuracy.  
- The write-up would still be honest if the result is **null** (no training, ~33%).

The project **succeeds as INTERACT** only with ethics, adequate N, faculty as appropriate, and the **feedback/recipe** packaging.

**Not** success: family 67% on 18 unmatched revealing rounds; a viral share card; a classifier; a provocative talk.

---

## 13. Pointers

- Older prototype rules: `Cursor Restore Aug 14 2025.md`  
- Full research-platform spec (ethics/matching north star, not the stack to rebuild): `C:\Users\asus\Desktop\Pred Study\Cursor_Superprompt_Research_Study_Platform.md`  
- App: `src/App.jsx`, `src/utils/study.js`, `src/data/trials.json`

---

*End of mission. If a later session changes RQ1–RQ2, update this file rather than silently reverting to a detection quiz.*
