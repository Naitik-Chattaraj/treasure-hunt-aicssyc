# Bug Audit: 3 Parallel Tracks

This audit covers `main` at commit `d59fde4` (after PRs #1–#3). Line numbers refer to that commit.

The open bugs are split into **three tracks**, and every file belongs to exactly one track. If each person only edits their own track's files, two branches can never touch the same file, so there are no merge conflicts and nobody's code gets overwritten.

The first audit's bugs #1–#4, #6–#8, #12 and #13 are fixed. The `was #N` notes below map to that first audit's numbers.

Severity levels:

- **Critical:** a team can cheat or take over another team.
- **High:** a security gap that needs a misconfiguration to exploit.
- **Medium:** wrong behaviour or unfair results.
- **Low:** cleanup.

---

## Rules for working in parallel

1. **Only edit files in your track's list.** You may *import* from another track's files, but never edit them. If you need a change in someone else's file, ask that person.
2. **Keep exported functions the same.** Other tracks import these, so don't rename them or change their parameters:
   - `getTeamChallenge` in `src/lib/challenges.ts` (Track A)
   - everything exported from `src/lib/auth.ts` and `src/lib/supabase.ts` (Track B)
   - the `api` object in `src/lib/api.ts` (Track C)

   You can change what they do inside.
3. **One branch per bug, named by its ID.** For example:
   ```
   git checkout main && git pull
   git checkout -b a1-qr-exact-match
   ```
   Keep PRs small: one bug ID per PR.
4. **Before opening a PR,** update your branch and check it builds:
   ```
   git fetch origin && git rebase origin/main
   npx tsc --noEmit && npx next build
   ```
5. **Don't reformat whole files.** Only change the lines your fix needs. Don't run Prettier on a whole file, and don't fix lint warnings in lines you didn't otherwise change. Whole-file formatting is the most common cause of avoidable conflicts.
6. **Nobody edits these during the sprint:** `package.json`, `package-lock.json`, `BUGS.md`, `AGENTS.md`, `CLAUDE.md`, `src/types/hunt.ts`, `src/app/admin/page.tsx`, `src/app/globals.css`, `src/app/layout.tsx`. If a bug really needs one of them, say so in the team chat first, and only one person makes that change, in its own PR.
7. **Don't add npm dependencies.** Adding one changes the lockfile, which every branch would then conflict on.

---

## File ownership

| Track | Owner | Files they own |
|---|---|---|
| **A: Gameplay & anti-cheat** | Person 1 | `src/app/api/hunt/scan/route.ts`<br>`src/app/api/hunt/solve/route.ts`<br>`src/app/api/hunt/checkpoint/route.ts`<br>`src/lib/challenges.ts`<br>`src/app/api/admin/teams/approve/route.ts`<br>`src/components/AdminQRGeneratorTab.tsx`<br>`src/components/QuestionBlockQRModal.tsx`<br>`src/lib/mock-data.ts`<br>`supabase/schema.sql`, `supabase/schema_route_1.sql`, `supabase/schema_route_2.sql` |
| **B: Auth, admin API & config** | Person 2 | `src/lib/auth.ts`<br>`src/lib/supabase.ts`<br>`src/app/api/auth/login/route.ts`<br>`src/app/api/auth/logout/route.ts`<br>`src/app/api/admin/login/route.ts`<br>`src/app/api/admin/logout/route.ts`<br>`src/app/api/admin/teams/route.ts`<br>`src/app/api/admin/questions/route.ts`<br>`src/app/api/admin/checkpoints/route.ts`<br>`next.config.ts`, `.env.local.example`<br>*new:* `src/lib/rate-limit.ts` |
| **C: Player frontend & public pages** | Person 3 | `src/app/hunt/page.tsx`<br>`src/lib/api.ts`<br>`src/app/api/team/me/route.ts`<br>`src/app/login/page.tsx`<br>`src/app/api/leaderboard/route.ts`<br>`src/app/leaderboard/page.tsx`<br>`src/components/ChallengeModal.tsx`<br>`src/components/MarkdownRenderer.tsx`<br>`src/components/TeamProfileModal.tsx`<br>`README.md` |

Files not listed here have no open bugs. Leave them alone.

## Summary

| ID | Severity | Bug | Was |
|---|---|---|---|
| **A1** | Critical | QR lookup accepts `%` / `_` wildcards, and new tokens are guessable | #5 |
| **A2** | Critical | Parallel guesses skip the wrong-answer cooldown | #9 |
| **A3** | High | Database rows are readable with the public anon key | #11 |
| **A4** | Medium | Routes aren't enforced in single-database mode | #14 |
| **A5** | Medium | Solve can accept an old, already-solved checkpoint's question | #15 |
| **A6** | Medium | The race timer starts at approval, not at hunt start | #16 |
| **A7** | Low | Inconsistent `node_id` in `submissions_log` | #25 |
| **A8** | Low | Print popups insert admin text into HTML without escaping | new |
| **A9** | Low | Database errors sent to the client (Track A files) | #26 |
| **B1** | High | Hardcoded JWT secret and admin password fallbacks | #10 |
| **B2** | Medium | No rate limiting on team login or admin login | #18 |
| **B3** | Medium | Moving a team between routes loses its progress | #17 |
| **B4** | Low | Team access codes can be short or collide | #24 |
| **B5** | Low | Scout and decoder logging in at once can kick one out | new |
| **B6** | Low | Deleting a question reports success when nothing was deleted | #21 |
| **B7** | Low | Unvalidated `nodeId` when adding a question | #22 |
| **B8** | Low | Leftover `NEXT_USE_MOCK` config | #30 |
| **B9** | Low | Database errors sent to the client (Track B files) | #26 |
| **C1** | Medium | Polling sends 3 requests every 3.5s per device | #19 |
| **C2** | Medium | Leaderboard tie-break is not stable | #20 |
| **C3** | Low | Login page mutates React state in place | #23 |
| **C4** | Low | Code challenges run on a third-party server | #27 |
| **C5** | Low | Every inline code snippet in a question renders as a full code block | new |
| **C6** | Low | README is UTF-16 and nearly empty | #29 |
| **C7** | Low | Database errors sent to the client (Track C files) | #26 |
| **X1** | Low | Duplicated "find team in either database" code | #28 |
| **X2** | Low | `npm ci` fails: lockfile out of sync with `package.json` | new |

**X1 and X2 are not part of the parallel work.** They touch files from every track, or the lockfile, so do them once A, B and C are merged. See [After the sprint](#after-the-sprint).

---

# Track A: Gameplay & anti-cheat (Person 1)

Suggested order: A1 → A2 → A3 → A5 → A4 → A6 → A7 → A8 → A9.

## A1. QR lookup accepts `%` / `_` wildcards, and new tokens are guessable (Critical)

**Where:**
- [scan/route.ts:97](src/app/api/hunt/scan/route.ts#L97) and [scan/route.ts:126](src/app/api/hunt/scan/route.ts#L126) (the `ilike` lookups)
- [AdminQRGeneratorTab.tsx:207](src/components/AdminQRGeneratorTab.tsx#L207), [AdminQRGeneratorTab.tsx:227](src/components/AdminQRGeneratorTab.tsx#L227) and [QuestionBlockQRModal.tsx:146](src/components/QuestionBlockQRModal.tsx#L146) (token generation)

**What happens:** `.ilike('qr_hash', input)` is a SQL `LIKE`, so `%` and `_` act as wildcards. A team can find the current checkpoint by trying prefixes. Invalid scans have no cooldown, and the error responses say which stage a guess matched.

Regenerated tokens look like `HUNT-R1-N03-XXXXXX`, so `HUNT-R1-N03-%` matches that checkpoint directly.

**Fix:**
- Use an exact `.eq('qr_hash', input)`.
- Generate tokens with `crypto.randomUUID()`, with no route or stage number in them.
- In the scan route, apply the existing team cooldown (`cooldown_until`) after about 5 invalid scans.

  This replaces the scan part of the old #18. Don't use `src/lib/rate-limit.ts` (Track B's file) for it.

## A2. Parallel guesses skip the wrong-answer cooldown (Critical)

**Where:** [solve/route.ts:77](src/app/api/hunt/solve/route.ts#L77) (cooldown check) and [solve/route.ts:220](src/app/api/hunt/solve/route.ts#L220) (cooldown write)

**What happens:** The route reads `cooldown_until`, checks the answer, and only then writes the new cooldown. Requests sent at the same moment all pass the check first. For an MCQ, sending all 4 options at once guarantees one is accepted, with no lockout.

**Fix:** Before checking the answer, claim the attempt with an atomic update that sets a lock and only succeeds when the team is not in cooldown. For example:
```
update teams set cooldown_until = now() + interval '2 seconds'
where id = ? and (cooldown_until is null or cooldown_until < now())
returning id
```
If no row comes back, reject the attempt. Do this through a Postgres function called with `rpc` and add the function to the `supabase/*.sql` files, which you own.

## A3. Database rows are readable with the public anon key (High)

**Where:** [schema.sql:134](supabase/schema.sql#L134), [schema.sql:140](supabase/schema.sql#L140), [schema.sql:146](supabase/schema.sql#L146). The two route schema files have the same policies.

**What happens:** The `USING (true)` SELECT policies let anyone with the anon key read `teams` (access codes, phone numbers, device IDs) and `checkpoints` (`qr_hash`).

**Fix:** Drop these policies in all three SQL files. The app only reads through server routes that use the service-role key. Run the change in both Supabase projects.

## A4. Routes aren't enforced in single-database mode (Medium)

**Where:** [scan/route.ts:100](src/app/api/hunt/scan/route.ts#L100), the match that goes straight to the stage check at [line 177](src/app/api/hunt/scan/route.ts#L177)

**What happens:** With one database holding both routes, a Route 2 QR code is found in the team's own database. Only its stage number is checked, so a Route 1 team can scan the Route 2 code for the same stage.

**Fix:** After the match, return `route_mismatch` if `matchedNode.route_id !== assignedRoute`.

## A5. Solve can accept an old, already-solved checkpoint's question (Medium)

**Where:** [solve/route.ts:89](src/app/api/hunt/solve/route.ts#L89), [solve/route.ts:103](src/app/api/hunt/solve/route.ts#L103), [solve/route.ts:111](src/app/api/hunt/solve/route.ts#L111), and the lookup at [solve/route.ts:125](src/app/api/hunt/solve/route.ts#L125)

**What happens:** `cpId` starts as the client-sent `nodeId`. If the checkpoint query returns nothing, any `nodeId` passes the stage check. The question lookup also doesn't skip solved rows, so re-answering an earlier checkpoint's question advances the team.

**Fix:** Work out `cpId` only from the database, and return an error if it isn't found. Add `.eq('is_solved', false)` to the lookup.

## A6. The race timer starts at approval, not at hunt start (Medium)

**Where:** [teams/approve/route.ts:56](src/app/api/admin/teams/approve/route.ts#L56) and [solve/route.ts:205](src/app/api/hunt/solve/route.ts#L205)

**What happens:** `start_time` is set when the admin approves the team, so teams approved earlier carry a longer elapsed time. The `start_time` in the solve route never runs, because approval already set it.

**Fix:** Stop setting `start_time` on approval. Set it when the team first scans its stage-1 QR code (in the scan route), or use one event-wide start time.

## A7. Inconsistent `node_id` in `submissions_log` (Low)

**Where:** [scan/route.ts:142](src/app/api/hunt/scan/route.ts#L142) and [scan/route.ts:162](src/app/api/hunt/scan/route.ts#L162) vs [scan/route.ts:219](src/app/api/hunt/scan/route.ts#L219)

**What happens:** Failed scans log the stage number (1–12). Successful scans log the checkpoint ID (1–24). For Route 2, the same column mixes the two.

**Fix:** Always log the checkpoint ID. For a failed scan, look up the team's current checkpoint ID first.

## A8. Print popups insert admin text into HTML without escaping (Low, new)

**Where:** [AdminQRGeneratorTab.tsx:98](src/components/AdminQRGeneratorTab.tsx#L98) and [QuestionBlockQRModal.tsx:65](src/components/QuestionBlockQRModal.tsx#L65)

**What happens:** The single-sticker print popups build HTML with `document.write`, inserting the checkpoint `title` and `area` as-is. A title containing `<`, `>` or `&` breaks the printed sticker. Only admins can enter these values, so this isn't a security hole.

**Fix:** Escape `& < > " '` before inserting these values.

## A9. Database errors sent to the client (Track A files) (Low)

**Where:** The `catch` blocks in `hunt/scan`, `hunt/solve`, `hunt/checkpoint` and `admin/teams/approve` that return `err.message` or `error.message`

**What happens:** Raw Supabase or Postgres errors reach the browser and reveal table and column names.

**Fix:** Log with `console.error` and return a generic message. Only change your own files. Writing a small helper inside each file is fine; don't create a shared one.

---

# Track B: Auth, admin API & config (Person 2)

Suggested order: B1 → B2 → B5 → B4 → B3 → B6 → B7 → B8 → B9.

## B1. Hardcoded JWT secret and admin password fallbacks (High)

**Where:**
- [auth.ts:4](src/lib/auth.ts#L4): if `ADMIN_JWT_SECRET` is unset, a secret that is in the public repo is used. Anyone could then forge an admin token.
- [admin/login/route.ts:67](src/app/api/admin/login/route.ts#L67): if no hash or password is set, the admin password is `admin2026!`.
- [admin/login/route.ts:62](src/app/api/admin/login/route.ts#L62): `ADMIN_PASSWORD` is compared in plain text with `===`.

**Fix:** Throw at startup (or return 500) when `ADMIN_JWT_SECRET` is missing or shorter than 32 characters. Remove the plain-text and default-password paths. Keep the exported function names in `auth.ts` the same.

## B2. No rate limiting on team login or admin login (Medium)

**Where:** `src/app/api/auth/login/route.ts`, `src/app/api/admin/login/route.ts` ([line 54](src/app/api/admin/login/route.ts#L54) uses `bcrypt.compareSync`)

**What happens:**
- Team access codes can be brute-forced; team names are public on the leaderboard.
- The admin password can be brute-forced.
- `compareSync` blocks the server while it runs.

**Fix:**
- Create `src/lib/rate-limit.ts`, a simple per-IP limiter with fixed windows. Use it only in these two routes. In-memory is best-effort on serverless hosting, which is acceptable here.
- Switch to `await bcrypt.compare`.
- The scan route's limit is A1, not part of this bug.

## B3. Moving a team between routes loses its progress (Medium)

**Where:** [admin/teams/route.ts:106](src/app/api/admin/teams/route.ts#L106) and [admin/teams/route.ts:153](src/app/api/admin/teams/route.ts#L153)

**What happens:** Only the `teams` row is copied to the other database. Its completions, unlocked questions and logs are deleted by `ON DELETE CASCADE` when the old row is removed. `current_stage` now points at the other route's checkpoint. The copy and the delete aren't atomic.

**Fix:** Refuse to move a team once `current_stage > 1` or it has completions. When moving, reset `current_stage` to 1. Return an error if the delete fails.

## B4. Team access codes can be short or collide (Low)

**Where:** [auth/login/route.ts:107](src/app/api/auth/login/route.ts#L107)

**What happens:** `Math.random().toString(36).substring(2, 8)` can return fewer than 6 characters, which the login form rejects. If the code is already taken, the insert fails with a 500 error and isn't retried.

**Fix:** Generate exactly 6 characters with `crypto.getRandomValues` from an uppercase A–Z and 0–9 alphabet. Retry up to 3 times on a unique-constraint error (`23505`).

## B5. Scout and decoder logging in at once can kick one out (Low, new)

**Where:** [auth/login/route.ts:186-201](src/app/api/auth/login/route.ts#L186-L201)

**What happens:** Login reads the team's `device_id` JSON, changes one role's entry, and writes the whole object back. If the scout and decoder log in at the same moment, the second write overwrites the first. One of them is then logged out on their next request.

**Fix:** Update only one key, for example with a Postgres function using `jsonb_set`. Alternatively, re-read and retry if the value changed between the read and the write. A SQL function would go in Track A's schema files, so if you choose that, ask Person 1 to add it.

## B6. Deleting a question reports success when nothing was deleted (Low)

**Where:** [admin/questions/route.ts:142-159](src/app/api/admin/questions/route.ts#L142-L159)

**What happens:** The route reports "deleted from Route 2" without checking the row count. With a single database, it reports success even when the ID doesn't exist.

**Fix:** Request `count: 'exact'` on both deletes. Return 404 if both counts are 0.

## B7. Unvalidated `nodeId` when adding a question (Low)

**Where:** [admin/questions/route.ts:20](src/app/api/admin/questions/route.ts#L20)

**What happens:** A `NaN` or out-of-range `nodeId` sends the insert to Route 2's database, where it fails with an unclear foreign-key error.

**Fix:** Validate that `nodeId` is an integer from 1 to 24, as the checkpoints route does.

## B8. Leftover `NEXT_USE_MOCK` config (Low)

**Where:** [next.config.ts:5](next.config.ts#L5) and `.env.local.example`

**What happens:** Mock mode was removed from the app, but `next.config.ts` still exposes `NEXT_USE_MOCK` and the example env file still lists it. Nothing reads it.

**Fix:** Remove both.

## B9. Database errors sent to the client (Track B files) (Low)

**Where:** `auth/login` (e.g. [line 36](src/app/api/auth/login/route.ts#L36), [line 146](src/app/api/auth/login/route.ts#L146)), `admin/teams`, `admin/questions`, `admin/checkpoints`

**What happens:** Raw Supabase or Postgres errors reach the browser.

**Fix:** Same as A9, but only in your own files.

---

# Track C: Player frontend & public pages (Person 3)

Suggested order: C1 → C2 → C5 → C3 → C4 → C7 → C6.

## C1. Polling sends 3 requests every 3.5s per device (Medium)

**Where:** [hunt/page.tsx:63](src/app/hunt/page.tsx#L63), [hunt/page.tsx:70](src/app/hunt/page.tsx#L70), [hunt/page.tsx:113](src/app/hunt/page.tsx#L113), `src/lib/api.ts`

**What happens:** Every 3.5 seconds, `getProfile()` and `getProgress()` both call `/api/team/me`, and then `/api/hunt/checkpoint` is called. Each request runs several database queries. With two devices per team, this eats the Supabase egress the two-database setup was built to save.

**Fix:**
- Fetch `/api/team/me` once per poll and use both `team` and `progress` from it.
  - In `api.ts`, add a new method such as `getMe()`.
  - Keep `getProfile` and `getProgress` working, because the login page and `TeamProfileModal` use them.
- Pause polling while the tab is hidden (`document.visibilityState`).
- Don't change `/api/hunt/checkpoint`; it's Track A's file.

## C2. Leaderboard tie-break is not stable (Medium)

**Where:** [leaderboard/route.ts:71](src/app/api/leaderboard/route.ts#L71)

**What happens:** When either team's `elapsedSeconds` is `null`, the comparator returns `0`, so teams on the same stage swap places between polls.

**Fix:** Sort `null` last, then by `elapsedSeconds`, then by `completed_at`, then by `id`.

## C3. Login page mutates React state in place (Low)

**Where:** [login/page.tsx:68](src/app/login/page.tsx#L68)

**What happens:** `next[0].name = teamLead` changes the existing member object, because the array copy is shallow.

**Fix:** `next[0] = { ...next[0], name: teamLead }`.

## C4. Code challenges run on a third-party server (Low)

**Where:** [ChallengeModal.tsx:45](src/components/ChallengeModal.tsx#L45)

**What happens:** Player code is sent to the public Piston API at `emkc.org`. That service is rate-limited and may be down during the event.

**Fix:** Run JavaScript in the browser in a sandboxed Web Worker, with a timeout and captured `console.log`. If the API stays, show a clear message when it fails.

## C5. Every inline code snippet in a question renders as a full code block (Low, new)

**Where:** [MarkdownRenderer.tsx:43](src/components/MarkdownRenderer.tsx#L43)

**What happens:** `react-markdown` v10 no longer passes an `inline` prop, so `!inline` is always true. Every `` `snippet` `` in a question is drawn as a full syntax-highlighted block.

**Fix:** Treat code as a block only if it has a `language-` class or contains a newline. Otherwise, render the inline `<code>` style.

## C6. README is UTF-16 and nearly empty (Low)

**Where:** [README.md](README.md)

**What happens:** The file is UTF-16 with CRLF line endings, so GitHub shows it as garbled text, and it contains only the repo name.

**Fix:** Save it as UTF-8 and add setup steps:
- env vars
- running the SQL schemas in both Supabase projects
- adding questions per checkpoint (`node_id` 1–12 for Route 1, 13–24 for Route 2)
- printing stickers from `/admin/print`

## C7. Database errors sent to the client (Track C files) (Low)

**Where:** [leaderboard/route.ts](src/app/api/leaderboard/route.ts) and [team/me/route.ts](src/app/api/team/me/route.ts)

**What happens:** Raw Supabase or Postgres errors reach the browser.

**Fix:** Same as A9, but only in your own files.

---

# After the sprint

Do these once all Track A, B and C PRs are merged, one at a time, each in its own PR.

## X1. Duplicated "find team in either database" code (Low)

**Where:** `auth/logout`, `team/me`, `hunt/checkpoint`, `hunt/scan`, `hunt/solve`, `admin/teams`, `admin/teams/approve`, `admin/questions`

**What happens:** The "look in the primary database, fall back to the other" block is copied about 8 times, with small differences between copies.

**Fix:** Add `findTeam(teamId, preferredRoute) → { team, db }` and `requireTeamSession(req)` to `src/lib/`, and use them everywhere. This touches files from all three tracks, so it must wait.

## X2. `npm ci` fails: lockfile out of sync with `package.json` (Low, new)

**What happens:** `npm ci` fails with `Missing: @emnapi/runtime@1.11.3 from lock file`. Anyone setting up the repo has to use `npm install`, which rewrites the lockfile, and those rewrites cause conflicts.

**Fix:** One person runs `npm install` on a fresh branch and commits only `package-lock.json`.

## Before the event (not code)

- **Regenerate every QR code.** The repo is public, and the original 24 hashes are in `supabase/*.sql` and `src/lib/mock-data.ts`. Click **Regenerate** for every checkpoint in the admin QR tab after A1 is merged, so the new tokens are random. Then print the stickers from `/admin/print`.
- **Check every checkpoint has a question.** Each checkpoint needs at least one `questions_pool` row; otherwise the decoder screen shows "no question set".
- **Update `BUGS.md`.** One person updates this file after the sprint.
