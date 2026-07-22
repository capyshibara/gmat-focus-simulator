# GMAT Focus Simulator — Handoff

Read this first when picking up work here. Update it as you go (strike
through closed gaps with a short note, matching the existing style) rather
than letting it drift out of date.

## What this is

A GMAT Focus Edition practice exam simulator. Started as a single hand-written
`.tsx` artifact (`gmat-focus-sim.tsx` / `.jsx` in the repo root — kept only as
historical reference, gitignored, not part of the build), now a real Vite +
React app deployed to GitHub Pages, with an LLM-fed question bank and optional
Google-account cloud sync.

- **Live site:** https://capyshibara.github.io/gmat-focus-simulator/
- **Repo:** https://github.com/capyshibara/gmat-focus-simulator (public)
- **Firebase project:** `gmat-focus-simulator` (Auth + Firestore, Spark/free
  plan, no Cloud Functions)

## Architecture

Everything lives in one file, `src/App.tsx` (~950 lines) — small components,
no router, no state library, just `useState`/`useEffect`. Key landmarks
(line numbers as of the last commit on this handoff, will drift — grep the
function name if they're off):

- `isAnswered`/`isCorrect` (~106-130) — per-item-type answer/correctness
  logic, shared by every mode.
- `buildPools`/`verbalPool` (~142-166) — flattens the raw JSON banks (RC
  passages become one item per nested question, CR/DI get a `section` tag)
  into three arrays: `Q`, `V`, `DI`.
- `isDeepseek` (183) — `creator?.startsWith("Deepseek")`. This one predicate
  is the entire creator-partition mechanism.
- `buildBank` (187) — **Full Test** pool: `buildPools()` filtered to
  `!isDeepseek` (Claude-authored only), then `sampleSection` draws a
  difficulty-balanced 21/23/20 form.
- `PracticeMode` (531) — **Daily Practice**: filters pools to
  `isDeepseek` only (the inverse), optional section filter, draws one random
  item at a time, no timer, immediate reveal + explanation on submit, "Next
  question" draws another (avoids immediate repeat).
- `QuestionView` (418) — the type-dispatcher every mode renders through
  (PS/CR/RC/DS/TPA/TA/GI/MSR/YN). Reuse this for anything new that displays
  a question — don't reimplement rendering per-mode.
- `History` / `QuestionLogEntry` (705, 743) — two feeds: `attempts` (full
  Full-Test score-band records) and `questionLog` (one row per answered
  question from *either* mode — topic/diff/correct/chosenResponse/timestamp/
  note). Filters: mode / correct-wrong / section. Notes are free-text,
  saved on blur.
- `AuthBar` (456) + `src/firebase.ts` — Google sign-in, styled as its own
  card (was previously a cramped inline row that looked broken — don't
  revert to that layout). Errors surface inline via `authError` state in
  `App()`, mapped from `err.code` — extend the `known` map in `handleSignIn`
  (~line 866 in `App()`) rather than adding a new silent catch.
- `mergeById` (844) + the sync `useEffect` in `App()` — local-first:
  `src/storage.ts` (plain localStorage) is always the cache; when signed in,
  Firestore (`users/{uid}/state/attempts` and `.../questionLog`, one doc
  each holding a `list` array) syncs via `onSnapshot`, merged by id with
  local winning ties on first login so nothing pre-login gets lost.

## Data / question bank

`src/data/{quant,cr,di,rc}.json` (`msr.json` holds the one shared
Multi-Source-Reasoning source set, referenced by `di.json` items). Every
question object has a `creator` field: `"Claude Sonnet 5"` for the
hand-written original bank, `"Deepseek <model>"` for bot-generated ones —
this field is the sole thing that routes a question to Full Test vs Daily
Practice, so **never add a question without a `creator`**, and never hand-edit
it to move a question between modes without understanding that's exactly
what it does.

Current bank size (grep `node -e "console.log(require('./src/data/quant.json').length)"`
etc. for a fresh count — it grows daily):
- Quant 78 (35 Deepseek), CR 43 (25 Deepseek), DI 57 (23 Deepseek), RC 6
  passages (Claude-only, RC generation was never automated — see gaps below).

**Deepseek bot**: `scripts/generate-questions.mjs`, scoped to PS/CR/DS only
(flat schemas an LLM can't easily get numerically inconsistent). TA/GI/TPA/
MSR were deliberately left out of automation — their nested table/chart
structures need a dedicated numeric verifier before it'd be safe to
auto-commit, not just structural validation. Dedup is by lowercased/
whitespace-normalized exact prompt match against the whole existing bank
(not just recent items) — good enough at this scale, would need a real
similarity check if the bank gets much bigger.

## CI/CD

- `.github/workflows/deploy.yml` — build + deploy to Pages on every push to
  `main`. Occasionally the `actions/deploy-pages@v4` step fails with a
  generic "Deployment failed, try again later" even though the build
  succeeded — this is GitHub-side flakiness, not a code bug; `gh run rerun
  <id>` usually succeeds on retry.
- `.github/workflows/generate-questions.yml` — **daily cron is currently
  paused** (removed the `schedule:` trigger, kept `workflow_dispatch`) per
  Hanh's request so she can top up Deepseek balance and trigger manually
  from the Actions tab when she wants new questions. Re-add
  `schedule:\n  - cron: "0 3 * * *"` under `on:` if she wants it back to
  automatic.
- Needs `DEEPSEEK_API_KEY` repo secret (already set). A `402 Insufficient
  Balance` from Deepseek shows up as "Added: 0 PS, 0 CR, 0 DS" in the run
  log with the workflow still marked green/success — check the log body,
  not just the run status, when triaging "did it actually add anything."

## Known gaps / open questions (check before assuming state)

- **Google sign-in end-to-end status is unconfirmed.** We fixed
  `CONFIGURATION_NOT_FOUND` (Authentication needed enabling in Firebase
  Console) and `auth/unauthorized-domain` (github.io domain needed adding
  to the authorized-domains allowlist) by walking Hanh through Firebase
  Console clicks, but never got final confirmation sign-in actually
  completes end-to-end and syncs. If picking this up, ask/verify before
  building anything that assumes cloud sync works.
- RC passage generation was never automated (see above) — still fully
  manual/Claude-only.
- No code-splitting; the production bundle is ~940KB (mostly the Firebase
  SDK) and Vite warns about it on every build. Not urgent, but a
  `manualChunks` split would be the fix if it starts to matter.

## Next up — three features requested for this round

### 1. Copy question + answer + explanation, for asking an LLM to go deeper

Add a "Copy for AI" (or similar) button wherever a question is shown in
review mode — natural homes are `QuestionLogEntry` (History), the
post-submit state in `PracticeMode`, and the per-question review blocks in
`Results`. Rather than duplicating formatting logic three places, write one
shared formatter, e.g. `formatItemForCopy(item, resp)` near `QuestionView`,
that produces a plain-text block: prompt (+ passage/table/sources if
present), the choices with the user's answer and the correct answer marked,
and the stored `exp`. Wire it to `navigator.clipboard.writeText(...)` behind
a button, with a brief "Copied" toast/state flip (there's no toast system in
this app yet — a transient `useState` + `setTimeout` on the button label,
matching how little else here uses global UI chrome, is enough; don't build
a toast system for one button).

### 2. Skip question

Currently `PracticeMode`'s only paths out of a question are "Submit" (does
count as answered/logged) — there's no way to move on without answering.
Add a "Skip" button alongside Submit, calling a variant of `submit()` that
logs `answered: false, correct: false, chosenResponse: null` (matches what
`isAnswered`/`isCorrect` already treat a `null` response as) to
`questionLog` with `mode: "daily"`, then draws the next question immediately
(no reveal step, since there's nothing to reveal). Full Test already has
Skip-equivalent behavior implicitly (leave a question blank, it's marked
wrong at section end) — decide whether "skip" should mean something
different there (e.g. jump to next unanswered without marking a response at
all — check `goTo`/`s.curIdx` navigation in `App()`) or whether the request
is Daily-Practice-only. Ask if unclear from how the feature request reads
in the new conversation.

### 3. Review/retry failed or skipped questions

Natural extension of the existing `History` filters (`modeFilter`/
`correctFilter`/`sectionFilter` in `History`, ~line 743) — the "Wrong only"
filter already exists; needs either (a) a "Skipped only" filter added
alongside it (once #2 exists to produce skipped entries), and (b) a "Retry"
action per entry (or a "Retry all filtered" bulk action) that re-enters
`PracticeMode` seeded with that specific item (or that filtered set) instead
of a random draw. Cleanest approach is probably to give `PracticeMode` an
optional `seedQueue` prop (array of items to work through in order before
falling back to random draw) rather than building a parallel review-mode
component — reuse its existing submit/reveal/next flow rather than
duplicating it. Retried answers should still log to `questionLog` as normal
new entries (don't mutate/overwrite the original failed record — the
history of "I got this wrong on 2026-07-12, then right on retry on
2026-07-20" is more useful than a single overwritten row).

These three interact: #1's copy button is most useful exactly on the
failed/skipped items #3 surfaces, and #3's retry flow is what #2's skip
button feeds into. Worth building in the order listed, but design #3's data
shape (the "skipped" state) before finalizing #1's copy format, so the copy
button can be dropped into the retry view without rework.
