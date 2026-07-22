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

~~### 1. Copy question + answer + explanation, for asking an LLM to go deeper~~
Done. `formatItemForCopy(item, resp)` (next to `QuestionView`) is the single
shared plain-text formatter; `CopyForAIButton` wraps it with
`navigator.clipboard.writeText` + a transient "Copied ✓" label flip (no
toast system added). Wired into `QuestionLogEntry`, `PracticeMode`'s
post-submit state, and each per-question card in `Results`.

~~### 2. Skip question~~
Done, Daily-Practice-only per the interpretation above. `PracticeMode` has a
`skip()` alongside `submit()` that logs `answered:false, correct:false,
chosenResponse:null, mode:"daily"` and immediately draws the next question
(no reveal step). Full Test's implicit skip-by-leaving-blank behavior was
left as-is, untouched.

~~### 3. Review/retry failed or skipped questions~~
Done. `History`'s `correctFilter` gained a `"SKIPPED"` option (alongside
`"WRONG"`, which now correctly excludes skipped rows via
`!e.answered`-aware filtering). `PracticeMode` takes an optional `seedQueue`
prop — an array of items to work through in order (tracked via
`retryTotal`/`retryDone` for the "Retrying N of M" banner) before falling
back to the normal random draw once exhausted. `History` passes an `onRetry`
callback down to both a per-entry "Retry" button (`QuestionLogEntry`) and a
"Retry all filtered" bulk button; `App()` holds it in `practiceSeed` state
and clears it when leaving Daily Practice. Retried answers log as new
`questionLog` entries as intended — nothing overwrites the original record.

All three verified locally with Playwright against `vite preview` (skip,
copy-to-clipboard content, single-entry retry, bulk-filtered retry all
behaved as expected) before pushing.
