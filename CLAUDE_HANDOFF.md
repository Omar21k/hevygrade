# Hevygrade handoff

Written 15 Nov 2026, afternoon America/Chicago, for continuing this app in Claude Code. Omar (software engineer) is the owner. He prefers working directly in the code. Read this before changing product behavior. `AGENTS.md` / `CLAUDE.md` only say this Next.js version differs from training data: read `node_modules/next/dist/docs/` before using a Next API.

Local app: [http://localhost:3000](http://localhost:3000). A private window is the way to see the landing page again, because a tab that already has a Hevy session and a physique result skips `/` and opens `/report`.

## What this is

Hevygrade grades a user's Hevy workout split. It is not a workout generator. It scores three metrics, **Coverage**, **Growth**, and **Recovery**, then an overall. Optional physique photos (front, side, back) are graded by Claude. When photos exist, they decide what is "lacking." Hevy sets explain why.

Repo: `/Users/omar21k/hevygrade`. Branch `main`. As of this file, `main` is **1 commit ahead of `origin/main`**: `df9f524` (the photo-save fix) has not been pushed.

Do not commit `LLMinds/`. It is an unrelated nested git repo that happens to sit in this working tree.

## Stack

- Next.js 16.3.8 App Router, React 19.2, TypeScript, Tailwind CSS v4 (`@theme inline` in `src/app/globals.css`).
- Vitest. Scripts: `npm run dev`, `npm test`, `npm run lint`, `npx tsc --noEmit`.
- No database. Browser `sessionStorage` holds the session. Photos are not stored; only the assessment JSON is.
- Server env in `.env.local` (gitignored): `ANTHROPIC_API_KEY`. Optional `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`. Never `NEXT_PUBLIC_` that key. See `.env.example`.
- Hevy API key is pasted by the user at `/connect` and sent once to `POST /api/hevy/import`. It is not written to disk.
- React Compiler is on. Do not update a ref during render. Do not call `setState` synchronously in an effect body. The reveal and preparing screens were rewritten around those rules.

## User flow

1. `/` — typed landing line: "Are you leaving gains on the table?" then a Find out button. If `hevygrade.hevy` and `hevygrade.physique` both exist, it redirects to `/report`.
2. `/connect` — paste a Hevy Pro API key, or open the demo. Demo saves `status: "skipped"` physique and example data. Photo analysis is not part of the demo. A ref (`acted`) blocks the returning-user redirect from stealing the demo navigation.
3. `/photos` — three angle uploads. Figures are background-removed cutouts, not a stick figure: `public/physique/front.png`, `side.png`, `back.png` (from `anatomy.jpg`), drawn by `src/components/setup/PoseFigure.tsx`. "Continue with photos" stashes the `File`s in memory and routes to `/preparing`. "Continue without photos" saves `status: "skipped"`.
4. `/preparing` — one status line at a time, fading into the next (`hg-swap`). Lines cycle while the vision request runs. Minimum about 3.2s so the animation is visible. Then `/reveal`.
5. `/reveal` — first a typed "What's already working" stage, then Coverage, Growth, Recovery. Each metric: a "Reading …" scan (`hg-scan`, 1200ms), a count-up ring (1100ms), then the written takeaway. Last stage shows the overall number unboxed. "Skip to overview" goes to `/report`. `prefers-reduced-motion` skips the timers.
6. `/report` — sticky tabs: Overview (`/report`), Your plan (`/report/plan`), Muscle regions (`/report/regions`). Overall score sits top-right of the overview, unboxed, smaller than the three metric cards, and opens the "how scores work" dialog.

## Product rules Omar set

These were corrections after he used the app with his own photos and ~270 Hevy workouts. Do not revert them because a generic coach prompt sounds smarter.

**Photos lead, stats explain.** If photos were graded, "what you're lacking" is only muscles the photos (or an explicit user goal) mark lagging. A muscle that is merely under the set target is not called lacking. The copy should say the photos show the lag and the routines are a cause, for example "your photos show lats behind… your routines look like a cause." Implementation: `lackingFromPhotos` / `lackingRegions` / `coverageTakeaway` in `src/report/view.ts`.

**Glutes, calves, and forearms are low priority.** Most male lifters do not train them directly and do not want them called out. `LOW_AESTHETIC_PRIORITY_REGIONS` in `src/scoring/regions.ts`. The vision prompt says not to mark them lagging. `lagMapFromPhysique` never tags them lagging. They stay out of lacking lists and plan recommendations unless the user sets that goal. Their score weight is 0.25.

**Major muscles matter more.** `MAJOR_PHYSIQUE_REGIONS`: upper chest, mid chest, lats, upper back, side delts, rear delts, biceps, triceps, quads, hamstrings. Weight 1.0. Other regions 0.65. Lagging priority multiplies weight by 3; overdeveloped by 0.35 (`regionScoreWeight`).

**Hard-to-see muscles need a confident read.** Traps, erectors, forearms, abs need confidence ≥ 0.7 before a photo can call them lagging (`HARD_TO_SEE` in `src/physique/lagMap.ts`). A low trap score was once dragging Growth to 2.0 by itself. Growth is now a weighted mean across every region, so one lagging muscle shifts the score instead of becoming it.

**"What's already working" is photo praise, not training praise.** Before the scores, type 1–2 visual compliments from the assessment, such as "Delts look full and strong." or "Chest looks full and strong." Do not praise set counts or the schedule there. `strengthLines` in `src/report/view.ts` uses developments with confidence ≥ 0.55, development ≥ 3.4, and at least 0.35 above the praise-set baseline. Lagging regions are excluded. Front/side/rear delts share one line. No photos: say so. Graded but the assessment object is missing: say the read didn't save and to run photos again. Nothing stands out: say that, do not invent a compliment.

**Preparing shows one line.** Not an accumulating list. `LINES` in `src/components/setup/PreparingScreen.tsx`. The line fades via `.hg-swap` and is replaced.

**Overall score.** `0.4 * coverage + 0.35 * growth + 0.25 * recovery`, then capped at `min(coverage, growth, recovery) + 3` (`OVERALL_FLOOR_MARGIN`). Shown unboxed, top-right, smaller than the metric cards.

**Import the whole account, score a recent window.** Hevy workouts are paginated up to 300 pages × 10 (3,000 workouts), 4 pages at a time, with short retries on 429 (`src/hevy/client.ts`). `workoutCount` and the date range use every fetched workout. Only the last 84 days of working sets (`PROGRESSION_WINDOW_DAYS`) are stored in session and used for progression, so a multi-year account does not blow `sessionStorage` and so progression describes the current program. Progression compares the earliest third of sessions to the latest third per exercise (Epley e1RM, or reps for bodyweight). ±2% is "holding." Growth parts, out of 10: volume up to 4, frequency up to 2, selection up to 2, progression up to 2. With no history, growth is projected from the routine and capped at 7.

**Landing page stays.** The redesign had replaced it. Omar asked for it back.

**Anatomy figures stay cut out.** White background removed. Do not put the stick figure back.

## Photo pipeline (and the bug that just shipped)

`PhotosScreen` calls `stashPendingPhotos(files)` then `router.push("/preparing")`. Files live in a module variable (`src/physique/pendingAnalysis.ts`), not session storage.

`PreparingScreen` posts them to `POST /api/physique`. The route converts images (JPG, PNG, WebP, HEIC, 12MB cap) and calls Claude (`src/physique/vision.ts`, prompt in `src/physique/parse.ts`). Development is 1–5 relative to this physique, not a magazine. The route returns `{ assessment, lagMap, findings }`. Lag map rules: lagging if not low-aesthetic and (development ≤ 2.2 or ≥ 0.7 below the person's baseline) and confidence ≥ 0.45 (0.7 if hard to see). Overdeveloped if development ≥ 4.3 and ≥ 0.8 above baseline. Otherwise maintain.

The result is saved with `savePhysique` before the animation wait, then the app goes to `/reveal`.

**Bug fixed in `df9f524`, not pushed.** React 19 dev strict mode runs the preparing effect twice. Both calls shared one `Response`, and a body can be read once. The cancelled effect consumed `response.json()`. The live effect got `{}` from `.catch(() => ({}))`, saved `status: "graded"` with no assessment, and still navigated to `/reveal`. The screen then said "No photos this time" even though the API had returned 200. `postPendingPhotos` now parses the body once inside the shared promise and returns `{ ok, status, views, payload }`. Both callers receive the assessment. A missing assessment is an error on the preparing page, not a silent empty save. Test: `src/physique/pendingAnalysis.test.ts`.

If Omar still has the bad session in that tab, he has to run `/photos` again. Refreshing `/reveal` will not recover the discarded read.

## Session keys

All in `sessionStorage`, via `src/lib/sessionStore.ts`. `useSyncExternalStore` must get a stable snapshot; the cache returns the same object until the stored string changes. Server snapshot is always null.

| Key | Contents |
| --- | --- |
| `hevygrade.hevy` | User, split, exercises, 84-day history, full `workoutCount`, date range, `demo?` |
| `hevygrade.physique` | `{ status: "graded" \| "skipped", lagMap, findings, assessment?, views }` |
| `hevygrade.lagOverrides` | User goal edits on the regions page |
| `hevygrade.planChoices` | Include / not-for-me on the plan |
| `hevygrade.revealSeen` | Set when they finish or skip the reveal |

`resetReportProgress()` clears plan choices and reveal-seen when inputs change. Goal edits merge over the photo lag map in `ReportContext`: `lagMap = { ...physique.lagMap, ...overrides }`.

## UI

Dark near-black. Tokens in `src/app/globals.css`:

- bg `#0B0D10`, surface `#12161C`, raised `#191F27`, border `#2A323D`
- text `#F2F4F7`, secondary `#B0B9C6`, muted `#929EAE`
- accent blue `#4F8CFF`, brand `#DDF5A1`, good `#88DDBB`, warn `#F2CF66`, bad `#F19B9B`

Tailwind names: `bg-bg`, `bg-surface`, `bg-raised`, `border-line`, `text-ink`, `text-ink-2`, `text-ink-3`, `text-accent`, `text-brand`, `text-good`, `text-warn`, `text-bad`. Type classes: `hg-h1`, `hg-h2`, `hg-eyebrow`. Motion: `hg-rise`, `hg-scan`, `hg-swap`, `hg-spin`. Reduced motion disables the animations.

Report shell: `src/components/report/ReportShell.tsx`. Overview: `OverviewView.tsx`. Plan: `PlanView.tsx` (current vs suggested, why, trade-off, include / not for me, undo). Regions: `RegionsView.tsx` (volume bars, filters, search, expandable rows, goal review). Dialogs: `ReportDialogs.tsx`. Controls live in `src/components/ui.tsx`.

Accessibility that was required: real buttons, native dialogs, visible focus, no horizontal overflow at 390px. The regions table grid is `minmax(160px, 2fr) 170px 130px 16px` with the muscle name in the wide first column. A 120px sets column wrapped the text.

## Where the logic lives

- `src/scoring/score.ts` — coverage, growth, recovery, overall, progression window.
- `src/scoring/regions.ts` — region ids, volume landmarks, weights.
- `src/scoring/volume.ts` — effective sets. `src/scoring/suggest.ts` — the plan.
- `src/scoring/catalog.ts` — exercise → region stimulus. Hevy templates are registered at import time.
- `src/report/view.ts` — everything the UI says. Verdicts per muscle combine photo and training. `buildReport` is the entry. When photos were graded and something is lacking, recommendations are filtered to those regions.
- `src/report/view.test.ts` — photo-led lacking lists, glutes excluded, delt praise, plan ordering.
- `src/physique/lagMap.ts`, `parse.ts`, `vision.ts`, `image.ts`.
- `src/hevy/client.ts`, `map.ts`, `stimulus.ts`, `session.ts`.
- `src/app/api/hevy/import/route.ts`, `src/app/api/physique/route.ts`.

## Verdicts

Each region view gets a verdict used by copy and ranking:

- `both` — photos (or the user's goal) say lagging, and weekly sets are under the raised target.
- `photo-gap` — looks behind, but the routines already hit the raised target. More sets on paper is probably not the fix.
- `training-gap` — sets are short, photos do not say it is behind. With photos present, this is not "what you're lacking."
- `ahead` — photos say it is ahead of the rest.

`rankRegions` orders photo-flagged lags first.

## Git history that matters

Newest first:

- `df9f524` Keep the photo analysis when the preparing page runs twice. Local only.
- `701b93a` One analyzing line at a time, and photo-based praise.
- `564ad4d` Animated score reveal and the preparing page.
- `cdcbf29` Lacking lists and plans scoped to photo-flagged muscles.
- `23629f9` Coverage copy led by photos; glutes de-emphasized.
- `b6a68b9` Import every workout; progression from 12 weeks; big-muscle gaps ranked higher.
- `d96ea49` One verdict per muscle from photos plus training; overall score prominent.
- `cf420bd` Cut-out anatomy figures.
- `09d6760` Typed landing page restored.
- `1da959a` UI redesign from the brief (report tabs, overview, plan, regions, setup, reveal).
- `b00bb00` Growth scored across all regions; hard-to-see muscles need confidence.
- `3e62a20` Claude vision instead of OpenAI. `6dc01bc` dropped temperature, default Sonnet 5.5.
- `74dff15` Initial app: grade a Hevy split against physique lag.

The design brief used for the redesign was a local file, `/Users/omar21k/Downloads/hevygrade-cursor-brief.md`. It is not in the repo. The implemented UI above is the source of truth.

## Bugs already hit

- Demo on `/connect` redirected to `/report` instead of `/reveal` because saving the session tripped the returning-user effect. Fixed with an `acted` ref in `ConnectScreen.tsx`.
- `/reveal` hydration mismatch from reading `sessionStorage` during SSR. Server snapshot for plan choices is `NO_CHOICES`.
- Plan deep-link focus ran before the hash existed on client navigation. `PlanView` reads the hash in `requestAnimationFrame`.
- Hevy import stopped at 8 pages (80 workouts). Omar has ~270. Cap is now 300 pages. The UI must show `workoutCount`, not the size of the 84-day history.
- Duplicate React key `coverage` on the reveal: `MetricStage` and `ScoreActions` were siblings both keyed by stage. They are wrapped in one `<div key={stage}>`.
- The false "No photos this time" line, described above.

## Checks

`npx tsc --noEmit`, `npx eslint src`, `npx vitest run`. For UI changes, use the running app in a browser: click through the flow, including empty, error, and the 390px width. A single screenshot is not enough. There is no browser automation checked in.

## Open product notes

- Praise lines are canned strings keyed by region, not Claude's `note`. The note is used as the lag finding detail. If a muscle looks good but scores under 3.4 or within 0.35 of the baseline, the strength stage says nothing stands out. Omar's example line was "Delts look full and strong."
- The last successful vision response that hit the double-read bug was discarded. Re-running photos is required for that session.
- `df9f524` is not on the remote.
