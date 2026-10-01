# Known Bugs

This audit was first written against commit `2842689` and updated for `main` at `cfca9a7`. Line numbers refer to `cfca9a7`. Bug numbers are the original ones, so references in PRs still match.

Severity levels:

- **Critical:** a team can cheat or take over another team.
- **High:** the game breaks, or a security gap that needs a misconfiguration to exploit.
- **Medium:** wrong behaviour or unfair results.
- **Low:** cleanup.

## Status

| # | Severity | Bug | Status |
|---|---|---|---|
| 1 | High | Unlocked-challenge lookups sort by a column that doesn't exist | ✅ Fixed (PR #2) |
| 2 | Critical | Anyone can log in as any approved team | ✅ Fixed (PR #1) |
| 3 | Critical | QR codes for every checkpoint are on a public page | ❌ Open |
| 4 | Critical | Mock answers and QR hashes are shipped to the browser | ⚠️ Partly fixed |
| 5 | Critical | QR lookup accepts `%` and `_` wildcards | ❌ Open |
| 6 | Critical | Old QR hashes still work after a regenerate | ✅ Fixed |
| 7 | Critical | Answers can be submitted without scanning | ✅ Fixed |
| 8 | Critical | Scan responses can include the answer | ✅ Fixed |
| 9 | Critical | Parallel guesses skip the wrong-answer cooldown | ❌ Open |
| 10 | High | Hardcoded JWT secret and admin password fallbacks | ❌ Open |
| 11 | High | Database rows are readable with the public anon key | ❌ Open |
| 12 | High | The app silently runs in mock mode if an env var is missing | ✅ Fixed |
| 13 | High | Fallback challenge insert always fails | ✅ Fixed (PR #2) |
| 14 | Medium | Routes aren't enforced in single-database mode | ❌ Open |
| 15 | Medium | Solve skips the stage check if the checkpoint lookup fails | ⚠️ Mostly fixed |
| 16 | Medium | The race timer starts at approval | ❌ Open |
| 17 | Medium | Moving a team between routes loses its progress | ❌ Open |
| 18 | Medium | No rate limiting anywhere | ❌ Open |
| 19 | Medium | Polling sends 3 requests every 3.5s per device | ❌ Open |
| 20 | Medium | Leaderboard tie-break is not stable | ❌ Open |
| 21 | Low | Deleting a question reports success when nothing was deleted | ❌ Open |
| 22 | Low | Unvalidated `nodeId` when adding a question | ❌ Open |
| 23 | Low | Login page mutates React state in place | ❌ Open |
| 24 | Low | Team access codes can be short or collide | ❌ Open |
| 25 | Low | Inconsistent `node_id` in `submissions_log` | ❌ Open |
| 26 | Low | Database errors are sent to the client | ❌ Open |
| 27 | Low | Code challenges run on a third-party server | ❌ Open |
| 28 | Low | Duplicated "find team in either database" code | ❌ Open |
| 29 | Low | README is UTF-16 and nearly empty | ❌ Open |
| 30 | Low | Leftover `NEXT_USE_MOCK` config | ❌ Open (new) |

## Suggested fix order

1. **#3 + #4** (delete `/test-qr`; this closes both).
2. **#5, #9** (the remaining ways for a team to cheat).
3. **#10, #11** (configuration safety; must be done before deploying).
4. Everything else.

---

# Open bugs

## 3. QR codes for every checkpoint are on a public page (Critical)

**Where:** [test-qr/page.tsx](src/app/test-qr/page.tsx)

**What happens:** `/test-qr` needs no login. It renders printable QR codes for all 24 checkpoints from `mock-data.ts`, and those hashes are the same ones the SQL seed files put in the database. Any player can open the page and scan every checkpoint from their seat.

**Fix:** Delete the page. QR printing already exists in the admin dashboard.

## 4. Mock answers and QR hashes are shipped to the browser (Critical, partly fixed)

**Where:** [test-qr/page.tsx:4](src/app/test-qr/page.tsx#L4) imports [mock-data.ts](src/lib/mock-data.ts)

**What happens:** `api.ts` no longer imports mock data, so the main pages are clean. But `/test-qr` still imports it, so that page's JavaScript bundle contains all 24 QR hashes and the mock answers. Some of those answers also appear in the SQL seeds.

**Fix:** Deleting `/test-qr` (#3) fixes this. Also stop reusing the real seed hashes and answers in `mock-data.ts`, or delete the file.

## 5. QR lookup accepts `%` and `_` wildcards (Critical)

**Where:** [scan/route.ts:97](src/app/api/hunt/scan/route.ts#L97) and [scan/route.ts:126](src/app/api/hunt/scan/route.ts#L126)

**What happens:** `.ilike('qr_hash', userInput)` is a SQL `LIKE`, so `%` and `_` in the input act as wildcards. A team can find the current checkpoint by trying prefixes (`a%`, `b%`, …). Invalid scans have no cooldown, and the `sequence_violation` / `already_completed` responses say which stage a guess matched.

Regenerated tokens are easier still. They use the format `HUNT-R{route}-N{stage}-XXXXXX` ([AdminQRGeneratorTab.tsx:207](src/components/AdminQRGeneratorTab.tsx#L207), [AdminQRGeneratorTab.tsx:227](src/components/AdminQRGeneratorTab.tsx#L227), [QuestionBlockQRModal.tsx:146](src/components/QuestionBlockQRModal.tsx#L146)), so `HUNT-R1-N03-%` matches that checkpoint directly.

**Fix:**
- Use an exact `.eq()`. To keep matching case-insensitive, store hashes lowercased and lowercase the input before comparing.
- Generate tokens with `crypto.randomUUID()` or 32 random bytes, with no route or stage number in them.
- Add a cooldown after repeated invalid scans.

## 9. Parallel guesses skip the wrong-answer cooldown (Critical)

**Where:** [solve/route.ts:77](src/app/api/hunt/solve/route.ts#L77) (cooldown check) and [solve/route.ts:220](src/app/api/hunt/solve/route.ts#L220) (cooldown write)

**What happens:** The route reads `cooldown_until`, checks the answer, and only then writes the new cooldown. Requests sent at the same moment all pass the check before any of them writes. For an MCQ, firing all 4 options at once guarantees one is accepted, with no lockout.

**Fix:** Make the check and the update one atomic step. One option is a Postgres function (`rpc`) that locks the team row (`SELECT … FOR UPDATE`). Another is a conditional update, such as `update … where id = ? and (cooldown_until is null or cooldown_until < now())`, where the answer is only checked if a row was updated.

## 10. Hardcoded JWT secret and admin password fallbacks (High)

**Where:**
- [auth.ts:4](src/lib/auth.ts#L4): if `ADMIN_JWT_SECRET` is unset, a hardcoded secret that is in the public repo is used. Anyone could then forge an admin token.
- [admin/login/route.ts:67](src/app/api/admin/login/route.ts#L67): if no hash or password is set, the admin password is `admin2026!`.
- [admin/login/route.ts:62](src/app/api/admin/login/route.ts#L62): `ADMIN_PASSWORD` is compared in plain text with `===`, which isn't constant-time.

**Fix:** Throw at startup when `ADMIN_JWT_SECRET` or the admin hash is missing. Remove the plain-text and default-password paths.

## 11. Database rows are readable with the public anon key (High)

**Where:** [schema.sql:134](supabase/schema.sql#L134), [schema.sql:140](supabase/schema.sql#L140), [schema.sql:146](supabase/schema.sql#L146). The route schema files do the same.

**What happens:** The `USING (true)` SELECT policies let anyone with the anon key read:
- `teams`: access codes (`uid`), member phone numbers and registration numbers, device IDs
- `checkpoints`: `qr_hash`

The anon key is meant to be public. The app doesn't use it in the browser today, but anyone who has the key can query the tables directly.

**Fix:** Remove these policies. All reads already go through server routes that use the service-role key. If Realtime is needed later, expose a view that leaves out the secret columns.

## 14. Routes aren't enforced in single-database mode (Medium)

**Where:** [scan/route.ts:100](src/app/api/hunt/scan/route.ts#L100), the match in the team's database, which goes straight to the stage check at [line 177](src/app/api/hunt/scan/route.ts#L177)

**What happens:** When only one database is configured, it holds both routes' checkpoints. A route-2 QR code is found in the team's own database, and the code never compares `matchedNode.route_id` with the team's route. Only the stage number is checked, so a Route 1 team can scan a Route 2 code for the same stage.

**Fix:** Return `route_mismatch` whenever `matchedNode.route_id !== assignedRoute`.

## 15. Solve skips the stage check if the checkpoint lookup fails (Medium, mostly fixed)

**Where:** [solve/route.ts:89](src/app/api/hunt/solve/route.ts#L89), [solve/route.ts:103](src/app/api/hunt/solve/route.ts#L103), [solve/route.ts:111](src/app/api/hunt/solve/route.ts#L111)

**What happens:** `cpId` starts as the client-supplied `nodeId`, and the `if (!cpId)` guard only fires when `nodeId` is empty. If the checkpoint query returns nothing, any `nodeId` passes the stage check. The mock fallback is gone, so the only remaining effect is that a team could re-answer an older checkpoint's question (the lookup doesn't filter on `is_solved`) to move forward.

**Fix:** Work out `cpId` only from the database. If it can't be found, return an error. Ignore rows where `is_solved` is true.

## 16. The race timer starts at approval (Medium)

**Where:** [teams/approve/route.ts:56](src/app/api/admin/teams/approve/route.ts#L56)

**What happens:** `start_time` is set when the admin approves the team. Teams approved earlier carry a longer elapsed time on the leaderboard, even if everyone starts the hunt together. (The `start_time` set in [solve/route.ts:205](src/app/api/hunt/solve/route.ts#L205) never runs, because approval already set it.)

**Fix:** Use one shared event start time from config, or start each team's clock when it first loads its stage-1 checkpoint.

## 17. Moving a team between routes loses its progress (Medium)

**Where:** [admin/teams/route.ts:106](src/app/api/admin/teams/route.ts#L106) and [admin/teams/route.ts:153](src/app/api/admin/teams/route.ts#L153)

**What happens:**
- Only the `teams` row is copied to the other database. The team's `hunt_completions`, `team_active_challenges` and `submissions_log` rows are left behind, and are then deleted by `ON DELETE CASCADE` when the old row is removed.
- `current_stage` is kept, but it now points at a different route's checkpoint.
- The copy and the delete aren't atomic, so a failure in between can leave the team in both databases.

**Fix:** Only allow route changes before the team starts. Reset `current_stage` when moving. Return an error if the delete fails.

## 18. No rate limiting anywhere (Medium)

**Where:** `/api/auth/login`, `/api/admin/login`, `/api/hunt/scan`

**What happens:**
- Team login can be brute-forced: team names are public, and the code space is 36⁶.
- Admin login can be brute-forced. It also uses `bcrypt.compareSync`, which blocks the server while it runs.
- Invalid QR scans are unlimited (see #5).

**Fix:** Add per-IP and per-team limits, and use the async `bcrypt.compare`.

## 19. Polling sends 3 requests every 3.5s per device (Medium)

**Where:** [hunt/page.tsx:63](src/app/hunt/page.tsx#L63), [hunt/page.tsx:70](src/app/hunt/page.tsx#L70), [hunt/page.tsx:113](src/app/hunt/page.tsx#L113)

**What happens:** `getProfile()` and `getProgress()` both call `/api/team/me`, and then `/api/hunt/checkpoint` is called. Each request runs several database queries. With two devices per team, that is a large share of the Supabase egress that the two-database setup was built to save.

**Fix:** Make one `/api/team/me` call and use both `team` and `progress` from it. Better still, add one combined `/api/hunt/state` route. Also slow down polling while the tab is hidden.

## 20. Leaderboard tie-break is not stable (Medium)

**Where:** [leaderboard/route.ts:71](src/app/api/leaderboard/route.ts#L71)

**What happens:** When either team's `elapsedSeconds` is `null`, the comparator returns `0`, so teams on the same stage can swap places between polls.

**Fix:** Sort `null` values last, then by `completed_at`, then by `id`.

## 21. Deleting a question reports success when nothing was deleted (Low)

**Where:** [admin/questions/route.ts:142-159](src/app/api/admin/questions/route.ts#L142-L159)

**What happens:** The route reports "deleted from Route 2" without checking that a row was actually deleted. With a single database, it reports success even when the ID doesn't exist.

**Fix:** Check `count` on both deletes. Return 404 if both are 0.

## 22. Unvalidated `nodeId` when adding a question (Low)

**Where:** [admin/questions/route.ts:20](src/app/api/admin/questions/route.ts#L20)

**What happens:** If `Number(nodeId)` is `NaN` or out of range, the code picks Route 2 and the insert fails with an unclear foreign-key error.

**Fix:** Validate that `nodeId` is between 1 and 24, the same way the checkpoints route does.

## 23. Login page mutates React state in place (Low)

**Where:** [login/page.tsx:68](src/app/login/page.tsx#L68)

**What happens:** `next[0].name = teamLead` changes the existing member object, because the array copy is shallow. The previous state is altered, which can cause stale renders.

**Fix:** `next[0] = { ...next[0], name: teamLead }`.

## 24. Team access codes can be short or collide (Low)

**Where:** [auth/login/route.ts:107](src/app/api/auth/login/route.ts#L107)

**What happens:**
- `Math.random().toString(36).substring(2, 8)` can return fewer than 6 characters, but the login form requires exactly 6. That team couldn't log in.
- If a generated code is already taken, the `UNIQUE` constraint rejects the insert with a 500 error, and the code isn't retried.
- `Math.random` isn't cryptographically secure.

**Fix:** Generate 6 characters with `crypto.getRandomValues`, and retry if the insert hits a duplicate code.

## 25. Inconsistent `node_id` in `submissions_log` (Low)

**Where:** [scan/route.ts:142](src/app/api/hunt/scan/route.ts#L142) and [scan/route.ts:162](src/app/api/hunt/scan/route.ts#L162) vs [scan/route.ts:219](src/app/api/hunt/scan/route.ts#L219)

**What happens:** Failed scans log `node_id: currentStage` (a stage number from 1–12). Successful scans log `matchedNode.id` (a checkpoint ID from 1–24). For Route 2, the same column therefore mixes two kinds of value.

**Fix:** Always log the checkpoint ID. Add a separate `stage` column if needed.

## 26. Database errors are sent to the client (Low)

**Where:** Most API routes, for example [auth/login/route.ts:36](src/app/api/auth/login/route.ts#L36) and [auth/login/route.ts:146](src/app/api/auth/login/route.ts#L146)

**What happens:** Raw Supabase or Postgres error messages are returned to the browser. They reveal table and column names.

**Fix:** Log the details on the server and return a generic message.

## 27. Code challenges run on a third-party server (Low)

**Where:** [ChallengeModal.tsx:45](src/components/ChallengeModal.tsx#L45)

**What happens:** Code that players write is sent to the public Piston API at `emkc.org`. That service is rate-limited and may be down during the event, and it is a third party receiving player code.

**Fix:** Run the code in the browser, for example in a sandboxed Web Worker, or host Piston yourself.

## 28. Duplicated "find team in either database" code (Low)

**Where:** `auth/logout`, `team/me`, `hunt/checkpoint`, `hunt/scan`, `hunt/solve`, `admin/teams`, `admin/teams/approve`, `admin/questions`

**What happens:** The same "look in the primary database, fall back to the other" block is copied about 8 times, with small differences between copies. Some ignore the first query's `error`. Others look in the fallback database even when the first query errored.

**Fix:** Add one shared helper, `findTeam(teamId, preferredRoute) → { team, db }`, and one `requireTeamSession(req)` that also handles the device/session check. `src/lib/challenges.ts` (from PR #2) shows the pattern.

## 29. README is UTF-16 and nearly empty (Low)

**Where:** [README.md](README.md)

**What happens:** The file is UTF-16 with CRLF line endings, so GitHub shows it as garbled text. It contains only the repo name.

**Fix:** Save it as UTF-8 and add setup steps: env vars, running the SQL schemas, and how questions are added per checkpoint.

## 30. Leftover `NEXT_USE_MOCK` config (Low, new)

**Where:** [next.config.ts:5](next.config.ts#L5), `.env.local.example`

**What happens:** Mock mode was removed from `api.ts`, but `next.config.ts` still exposes `NEXT_USE_MOCK` and the example env file still lists it. Nothing reads it, so it suggests a setting that does nothing.

**Fix:** Remove both.

---

# Fixed

| # | Bug | Fixed by |
|---|---|---|
| 1 | Challenge lookups sorted by the missing `created_at` column, so the question never showed on the Base Decoder's screen and every answer was rejected | PR #2 |
| 2 | Registration with a public team name and team lead issued a session and returned the access code | PR #1 |
| 6 | The scan route accepted the original mock hashes, so regenerating a QR code never revoked the old one | Mock fallback removed in the scan route |
| 7 | The solve route checked mock answers when nothing had been scanned | Mock fallback removed; now returns `challenge_not_unlocked` |
| 8 | Mock challenges, including the `answer` field, were sent to the client | Mock fallbacks removed in the scan and checkpoint routes |
| 12 | Client mock mode was on unless an env var was set to `'false'` | Mock mode removed from `api.ts` (leftover config is #30) |
| 13 | The fallback inserted a question from another node, or `null` | PR #2 (`src/lib/challenges.ts`) |
