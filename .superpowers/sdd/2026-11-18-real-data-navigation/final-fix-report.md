# Final four-finding fix wave

Base: `a63aace`; branch: `codex/real-data-navigation`.
Worktree: `C:/Users/admin/.codex/worktrees/real-data-navigation/new-ejeephero`.
One implementer, no subagents, no scope changes. Controller owns the final full suite, web export and fresh scoped re-review after this commit.

## Findings addressed

1. **Shared transit cache:** the service retains its newest successful source snapshot (including an empty result) before attempting persistence. Request sequence numbers prevent a slower older request from replacing a newer success; a newer failed request does not advance that success sequence. Disk writes share a promise chain so they cannot finish out of order, and snapshots superseded before their queued write starts are skipped. Failed remote reads use the in-memory snapshot first, preserve its source `syncedAt`, return `status: cached`/`isFromCache: true`, and retain the remote error. Disk fallback is rechecked against any source success that arrived during its read.
2. **Driver passenger count:** synchronous pending ref blocks a second event before React rerenders. Both controls are disabled with accessibility state while saving, and the sheet displays saving feedback. The displayed count changes only after persistence. Returned database errors and rejected requests retain the prior count, report failure, and unlock retry. Responses from another active vehicle cannot replace the new vehicle's count/error. Ending a shift is blocked while a count write is pending.
3. **Supervisor Live units:** KPI now counts `liveUnits` whose `locationQuality(unit.fix, telemetryNow)` is `live`, using the existing five-second wall-clock ticker. Weak/unknown accuracy markers are excluded; stale fixes age out without requiring a completed refresh.
4. **Future verification:** both route/stop map validation and the HeroBot stop-context gate require a finite verification timestamp at or before `Date.now()`. Route geometry, map stops, boarding/alighting selection and reconciled selection reject future metadata; bot context omits future-verified stops while retaining past sourced stops and unavailable rules.

## Changed paths and callers

Production:
- `src/services/offlineTransitService.ts`
- `src/screens/driver/DashboardScreen.tsx`
- `src/screens/admin/SupervisorDashboardScreen.tsx`
- `src/services/routeMap.ts`
- `supabase/functions/herobot-chat/context.ts`

Regressions:
- `tests/realData.test.ts`: isolated service instances via test-only `Reflect.construct`, failed read after empty write failure (including unreadable storage), reversed remote completion, serialized overlapping disk persistence, offline memory access before disk completion, final disk read by a fresh service.
- `tests/driverShiftStart.test.ts`: real screen handlers, synchronous double tap, disabled controls, delayed success, returned/thrown errors and retry, old-shift response after restoring another vehicle. Existing accepted-GPS startup regression retained. Hook fixture now respects callback/effect dependencies.
- `tests/supervisorMapSelection.test.ts`: real rendered KPI with unknown/weak/good accuracy and a 31-second fake-clock advance before refresh promises complete. Existing track-selection dropout/recovery regression retained.
- `tests/routeMap.test.ts`: 2099 and near-future metadata rejected by actual geometry, map, selection and reconciliation consumers.
- `tests/herobotContext.test.ts`: same far/near-future rejection through the actual context builder.

These files were already registered in `tests/run.ts`; the existing sequential awaited module-hook imports remain intact. No new test runner, dependency, production reset API, config or exports were needed.

Read the changed services/screens, their relevant tests, the spec/plan and final integration/progress context. Traced `getTransitData` consumers (journey context, planning data, directory, supervisor and driver screens), `syncWithRemote`, both count buttons and shift lifecycle, route-map selection/map/landmark consumers, and the HeroBot function entrypoint. No caller signature changes required. Successful source sync still has a string timestamp; unavailable/cache/source distinctions and sample/archived/source filtering remain.

## Actual RED evidence

Command (before production changes):

```powershell
rtk proxy node --experimental-strip-types --test --test-concurrency=1 tests/realData.test.ts tests/driverShiftStart.test.ts tests/supervisorMapSelection.test.ts tests/routeMap.test.ts tests/herobotContext.test.ts
```

Exit code: **1**. Actual output summary:

```text
✖ actual passenger count handler blocks same-frame taps and disables controls until persistence (42.3234ms)
✖ actual passenger count handler retains count and unlocks retry on returned or thrown errors (6.8888ms)
✖ passenger count responses from an old shift cannot change the newly restored vehicle (2.8209ms)
✖ chat reference excludes future verification while retaining past sourced stops (6.6005ms)
✖ successful empty source reads stay empty when the cache cannot be written (5.5357ms)
✖ an older overlapping source read cannot replace a newer successful empty snapshot (16.3752ms)
✖ overlapping cache persistence is serialized and the final disk snapshot is the newest success (3.6949ms)
✖ future verification cannot supply route geometry, map stops or selectable stops (17.6184ms)
✖ actual supervisor Live units KPI excludes weak and unknown accuracy (8.3441ms)
✖ actual supervisor Live units KPI expires by wall clock without a completed refresh (12.9491ms)
ℹ tests 33
ℹ suites 0
ℹ pass 23
ℹ fail 10
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6021.7972
```

Observed failures included: two same-frame driver writes `[4, 4]` instead of one pending `[4]`; an old shift replaced count 8 with 4; storage returned `real-route-99` after successful empty sync; two persistence calls started concurrently instead of one; weak and expired KPI both returned 1 instead of 0; route geometry and bot text included 2099 metadata. The pending/error test also failed because controls had no disabled state.

## Actual GREEN evidence

Same focused command, after fixes and final test-only type correction:

```powershell
rtk proxy node --experimental-strip-types --test --test-concurrency=1 tests/realData.test.ts tests/driverShiftStart.test.ts tests/supervisorMapSelection.test.ts tests/routeMap.test.ts tests/herobotContext.test.ts
```

Exit code: **0**. Actual output:

```text
✔ actual shift startup publishes the shared accepted fix, never an independently returned jump (83.4351ms)
✔ actual passenger count handler blocks same-frame taps and disables controls until persistence (32.6717ms)
✔ actual passenger count handler retains count and unlocks retry on returned or thrown errors (6.9556ms)
✔ passenger count responses from an old shift cannot change the newly restored vehicle (6.8635ms)
✔ chat context never turns fare defaults or active shifts into current operational facts (3.4928ms)
✔ chat context excludes samples and unpublished routes and requires sourced stop evidence (0.8933ms)
✔ failed and empty chat reference reads remain distinct and both forbid invented facts (0.3476ms)
✔ chat reference excludes future verification while retaining past sourced stops (4.212ms)
✔ empty fleet stays empty even in development; sample fleet rows are excluded (13.1754ms)
✔ sync keeps generic active routes and verified stops without inserting static seeds (7.6723ms)
✔ failed reads retain real cache age; successful empty sync replaces it (2.4944ms)
✔ old seeded cache cannot reappear after an unavailable read (1.5127ms)
✔ successful empty source reads stay empty when the cache cannot be written (2.5386ms)
✔ successful source changes survive cache write failures (1.0679ms)
✔ an older overlapping source read cannot replace a newer successful empty snapshot (38.9775ms)
✔ overlapping cache persistence is serialized and the final disk snapshot is the newest success (4.0355ms)
✔ live fleet excludes sample database vehicles and preserves missing telemetry as unknown (3.7262ms)
✔ vehicle loader retains capture accuracy and km/h but drops stale and legacy positions (0.7741ms)
✔ publication rejects unusable fixes, preserves measured evidence and reports database failure (1.3812ms)
✔ sample operations and registry rows are excluded before counts and summaries (0.848ms)
✔ sync reads all pages, including generic routes after the first 500 (1.5911ms)
✔ missing loading areas do not manufacture a legal zone (1.1964ms)
✔ failed live vehicle reads reject instead of reporting an empty success (0.7026ms)
✔ ride highlight follows verified bends and rejects reverse, wrong-route, off-route or unverified stops (4.2156ms)
✔ stop choices keep boarding separate from alighting and route changes clear incompatible stops (1.1553ms)
✔ camera describes selected journey only and never fabricates route or walking geometry (1.9553ms)
✔ partial ride legs project onto source geometry and ambiguous loops remain unavailable (0.508ms)
✔ source refresh removes deleted or reordered selections, and malformed geometry stays unavailable (0.8573ms)
✔ an archived route cannot retain selected stops or map geometry even if other flags remain active (0.3167ms)
✔ future verification cannot supply route geometry, map stops or selectable stops (3.355ms)
✔ supervisor retains explicit unit identity through source telemetry dropout and recovery (53.6047ms)
✔ actual supervisor Live units KPI excludes weak and unknown accuracy (18.2509ms)
✔ actual supervisor Live units KPI expires by wall clock without a completed refresh (8.0837ms)
ℹ tests 33
ℹ suites 0
ℹ pass 33
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7085.3403
```

Earlier GREEN run also passed 33/33. Existing `MODULE_TYPELESS_PACKAGE_JSON` warnings occurred in RED and GREEN; no new dependency/package configuration change was made to silence them.

TypeScript:
- `rtk proxy node node_modules/typescript/bin/tsc --noEmit` — exit 0, no output.
- `rtk proxy node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --allowImportingTsExtensions supabase/functions/herobot-chat/context.ts` — exit 0, no output. This separately covers the pure backend file excluded from the app tsconfig.
- `rtk git diff --check` — exit 0, no whitespace errors.

## Review boundaries and remaining limits

- Focused implementation audit found no remaining issue in these four findings; the controller's independent scoped re-review is still pending, not claimed approved.
- Full suite and web export intentionally left to the controller. No live database writes, migration/deployment, AI invocation, permission changes or physical GPS tests.
- If persistent storage cannot be written, the latest successful snapshot remains available only for the running service lifetime. An app restart can only recover the last successfully persisted envelope; durable recovery cannot be guaranteed while storage is failing. Cache age/error labeling is preserved.
- The KPI uses the existing five-second ticker, so expiry is reflected on its next tick (and may wait for timers when the app is suspended).
- Passenger controls reject additional taps while saving; they do not queue extra increments. The pending ref prevents duplicate writes in the same render.
- Screen regressions execute the production handlers/render tree with hook/UI/I/O boundary fixtures; they do not replace physical-device or browser interaction acceptance.
- Explicit foreground GPS and read-only supervisor route-authoring rulings remain unchanged.
- Original checkout was only inspected with `rtk git status --short`: its sole modification remains `r2-bundle/transit/makati-boundary.json`. It was not edited or staged.

The scoped commit includes the ten implementation/test files above and this report. The commit hash is supplied in the handoff response.

## Controller resolution after the single scoped re-review

Mendel confirmed all four original findings addressed at3aea80e (and accepted test-only follow-up98a928c), but reproduced a new P2: normalization of a malformed disk envelope had moved outside error handling. This is a valid load-bearing gap in the required unavailable behavior.

The controller traced all getTransitData callers and reproduced `routes:[null]` with a new isolated regression: `rtk proxy node --experimental-strip-types --test --test-name-pattern="malformed cached rows" tests/realData.test.ts` exited1 with `TypeError: Cannot read properties of null (reading 'is_sample')` at offlineTransitService.ts:146. The same regression also covers `terminals:[null]` and asserts unavailable status, no cached/source timestamp, empty records and the original offline error.

Restored protected normalization with a try/catch around that single operation. The newest-memory recheck, ordered writes, filtering and source timestamps are unchanged. Assignment occurs only after normalization succeeds, so a failure leaves the original unavailable result intact. No additional fix agent or broad review was dispatched.

`rtk npm test` then exited0:96tests,96pass,0fail,0skip. Fresh app TypeScript and web export were started for this production adjustment; their final result is recorded in the integration report/ledger. This final two-line guard was controller-reviewed and regression-tested, not independently re-reviewed. No review findings are intentionally deferred.

Final checks completed: app TypeScript exit0/no output; web export exit0,1482modules,31assets,3.5MB bundle `index-3f923727e40a222ac2fe058c7d0eb0cb.js`, manifest postprocess complete; `git diff --check` exit0. Existing module-type/color warnings only.

