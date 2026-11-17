# Task 1 — production real-data gates

Status: DONE_WITH_CONCERNS
Branch: codex/real-data-navigation
Requirements: .superpowers/sdd/2026-11-18-real-data-navigation/task-1-brief.md
Read the complete design spec and Global Constraints/Review Focus; did not read other task bodies. No subagents, installs, deployments, external writes, or destructive source-data cleanup were performed.

## Changes

- Removed all three production sample constants and their reachable imports. Removed passenger sample mode/demo boarding, fake admin driver/unit rosters, fabricated supervisor speed/violation/score/trip/live-unit fallbacks, driver sample alerts/history, invented plate/body labels, hardcoded default route labels, and fabricated report-preview grades/counts.
- Replaced the supervisor's entirely screen-local route creation/editing/assignment flow with the existing Directory screen backed by real transit reads. It explicitly explains that route editing and driver assignment are unavailable. Existing real driver approval/hiding, roster persistence, force-end shift, and PDF service operations remain.
- Transit reads paginate every 500 rows and normalize arbitrary route IDs. Explicit sample/inactive/unpublished/deleted/coming-soon records are excluded. Stops require a retained route plus source/verification metadata and valid coordinates. Geometry requires source/verification metadata and valid coordinates; stop positions never form a fabricated route line.
- Replaced old independent v7 seed caches with one new real-source cache envelope. No old seeded cache compatibility remains. Successful empty reads replace the envelope. Failed reads return previously sourced cache with its original sync time and a cached/error status, or unavailable when none exists.
- Real-data filtering happens before projection/counts in fleet, admin operations, reports, alerts, passenger planning, loading zones, and map vehicles. Database reads use full rows where needed so is_sample cannot be lost through a client projection.
- Removed local preview registry fallback/storage writes. Errors now reject instead of silently becoming empty success. Added a local migration to exclude flagged registry units inside get_available_fleet_units, whose existing database signature strips flags before returning body/plate.
- Passenger Home starts with no stops/vehicles, requires an actual selected nearby unit to confirm boarding, and renders the existing boarding assessment's title/detail. Unknown GPS/loading evidence never displays loading permission. Safety/SOS passes only the linked unit's real identifiers; missing details remain absent.
- Missing vehicle speed, heading, occupancy, capacity, fullness and status remain unknown. Driver screen no longer supplies 18 km/h, eight passengers, a fixed capacity, fake start time, an assumed permission grant, or a cached position with invented accuracy. New-shift capacity comes from the saved database row. Occupancy changes report success only after persistence; canned occupancy counts were removed.
- FareScreen received only prerequisite cleanup: removed its static route import/default trip distance, uses a returned real route, defaults to Regular, and renders only a sourced official quote. Detailed selection, fare provenance presentation and walking work remain Task 3.
- Removed WeatherBanner's fabricated missing-response temperature/code. Weather query coordinates are an explicitly regional forecast, not a user/vehicle position.

## Verification

- Initial failing focused run reproduced 15 injected sample fleet units and forced static route IDs. The implementation then passed the focused tests.
- `rtk node --experimental-strip-types tests/realData.test.ts`: PASS, 9/9.
  - Empty development fleet stays empty; source sample rows excluded; registry errors reject.
  - Arbitrary active routes/verified stops survive; inactive/draft/sample/orphan/unverified rows do not.
  - Failed reads retain original cache age; successful empty sync removes previous data.
  - Legacy seeded caches do not reappear.
  - Sample live vehicles excluded; missing telemetry/occupancy stay null.
  - Sample operations/registry rows excluded before summaries.
  - Route after page 500 and its stop are retained.
  - Empty/unverified loading data does not create a legal zone.
  - Failed live vehicle reads reject instead of reporting successful empty.
- `rtk npm test`: PASS, 42/42 (baseline 33 + 9 new).
- `rtk proxy node node_modules/typescript/bin/tsc --noEmit`: PASS, exit 0 after caller fixes; final rerun also exit 0.
- `rtk git diff --check`: PASS.
- Runtime rg audit: remaining sample references are exclusion guards/types and the defensive emergency-message formatter tested with isolated synthetic fixtures. No production sample datasets or sample selection controls remain.
- Existing MODULE_TYPELESS_PACKAGE_JSON warning persists. Controller's dependency audit findings were not changed. No new dependency was added.

## Interfaces and assumptions for Task 2/3

- RouteData/TerminalData/VehicleData exports remain in offlineTransitService. VehicleData speed, heading, passenger_count, max_capacity, is_full and status now allow null; downstream renderers must not convert null to zero/empty occupancy.
- RouteData accepts optional is_sample/is_active/is_published/deleted_at/status; TerminalData accepts optional sample/active/deleted fields.
- TransitResult now includes status ('ready' | 'cached' | 'unavailable'), syncedAt (nullable source-read time), and error. latencyMs/isFromCache remain. Retrieval now awaits the remote read before falling back to cache, rather than returning seeded cache and invisibly updating in the background.
- syncWithRemote returns the normalized snapshot and rejects on failure. getVehicles rejects on failure; PassengerJourneyContext catches it and exposes vehicleError. No vehicle cache is treated as live.
- Removed the unused seedInitialCache API and all MAKATI_PRIMARY_ROUTE, MAKATI_OFFICIAL_TERMINALS, MAKATI_ROUTE_2_COMING_SOON, OFFICIAL_TWO_ROUTES, INITIAL_VEHICLES exports; all discovered callers were updated.
- RegistryMode is now only 'database'; existing adminId/mode call signatures are retained for callers.
- PassengerUnit.source is 'gps' | 'confirmed'; the sample source and SOSButton sample prop are removed.
- evaluateGeofence accepts an empty list without seeding; nearestZone/distance/bearing are nullable when verified loading areas are unavailable.
- openAdminPeriodReport accepts a null live snapshot and labels telemetry unavailable rather than claiming zero live units when the caller never fetched telemetry.
- Checked-in routes schema has no universal publication/active column. Existing RLS-visible route rows are treated as published unless an explicit inactive/unpublished/deleted/draft/coming-soon flag excludes them. This preserves current real routes without requiring a remote schema edit.
- Directory is now a read-only route selector and sourced stop list. It deliberately does not manufacture a from/to itinerary from provisional landmarks.
- No runtime R2 route/stop fallback exists in the inspected service/gateway path; the gateway's genuine missing-file behavior and the unrelated boundary file are untouched.

## Files

Components: AdminHeaderPopover.tsx, AdminRegistryManager.tsx, LeafletMap.tsx, SOSButton.tsx, WeatherBanner.tsx.
Deleted: src/constants/sampleFleet.ts, sampleMonitoring.ts, samplePassengerFleet.ts.
Context/navigation: src/contexts/PassengerJourneyContext.tsx, src/navigation/AppNavigator.tsx.
Admin screens: AdminOperationsScreens.tsx, SupervisorDashboardScreen.tsx.
Driver screens: DashboardScreen.tsx, NotificationsScreen.tsx, RecordsScreen.tsx.
Passenger screens: DirectoryScreen.tsx, FareScreen.tsx, HomeScreen.tsx, SafetyScreen.tsx.
Services: adminOperationsService.ts, adminReportService.ts, fleetRegistryService.ts, geofencingService.ts, offlineTransitService.ts, passengerDataService.ts, passengerJourney.ts.
Utilities: src/utils/operationsSummary.ts, src/utils/realData.ts (new).
Migration: supabase/migrations/20261118010000_exclude_sample_fleet_units.sql (new).
Tests: tests/run.ts, tests/realData.test.ts (new).
Report: this file.

## Unresolved concerns / deliberately unverified

1. The RPC migration is NOT applied. Its exclusion must be applied through the normal migration process before flagged registry units can be guaranteed excluded by the existing server RPC, because that RPC currently returns only body/plate. Client tests cover flagged RPC responses and the filter; a live database migration/integration test was outside authorization.
2. Full GPS timestamp/accuracy/future/staleness validation, native background tracking, route highlighting/selection/framing, fare route selection and walking geometry remain later tasks. This task only removed invented values necessary for its production gates.
3. No authenticated UI session, web build, physical GPS/SMS, actual write RPC, or PDF download was exercised. Main/controller owns subsequent independent review and integration/visual checks.
4. Current public reference data was reported by the controller as 2 routes / 6 unverified stops and no segments/walks/matrices. Under these gates, verified boarding/fare/walking content is intentionally unavailable. No remote records were edited or deleted.
5. Historical unflagged database rows cannot be distinguished from legitimate source records by inventing a naming heuristic. Explicit is_sample flags are respected; source cleanup remains outside scope.

## Fix round 1 — four review findings

All four findings addressed:

1. Cache persistence is now best-effort after a successful remote read. Both syncWithRemote and getTransitData return the source snapshot even if AsyncStorage.setItem rejects, including successful empty results. A failed source read still uses the existing timestamped cache behavior.
2. Unit rows retain a missing plate as null. The edit form receives an empty string and continues to save null; unavailable labels exist only at rendering sites. Registry values take precedence over historical shift identifiers for editing.
3. Extracted the existing screen merge into src/utils/adminUnitRows.ts and preserved registryId on matching shift-derived rows. Matching normalizes body/plate whitespace and case, prefers a current registry entry over an archived duplicate, and retains unmatched archived entries as distinct rows. Existing route/assigned-driver/notes fields are preserved when saving the basic unit form.
4. registryDeletedAt now tracks registry deletion independently of shift state. Restore appears only for deleted entries; Mark unit inactive remains available for undeleted registry entries, including units without a current shift. The Inactive filter uses registry deletion. Off-shift badges no longer imply deletion, and Force-end requires an actual activeShiftId. Unregistered historical rows cannot enter the registry edit form.

Regression evidence and verification:

- Before the cache fix, the two new tests failed: a successful empty read returned cached status, and a changed successful source snapshot rejected with Storage full.
- Before the registry fix, the extracted unchanged merge failed all five new behavioral tests: missing plate became display text; registry identity was lost; deletion state was absent; archived rows disappeared; and renamed/current entries were not matched.
- `rtk node --experimental-strip-types tests/realData.test.ts`: PASS, 11/11.
- `rtk node --experimental-strip-types tests/adminUnitRows.test.ts`: PASS, 5/5.
- `rtk npm test`: PASS, 49/49.
- `rtk proxy node node_modules/typescript/bin/tsc --noEmit`: PASS, exit 0.
- `rtk git diff --check`: PASS.
- Existing MODULE_TYPELESS_PACKAGE_JSON warning remains; no new dependencies or baseline-warning changes.

Round files: src/services/offlineTransitService.ts, src/screens/admin/AdminOperationsScreens.tsx, src/utils/adminUnitRows.ts (new pure production merge), tests/realData.test.ts, tests/adminUnitRows.test.ts (new), tests/run.ts, and this report.

No remote writes, deployments, subagents, authenticated UI actions, or real registry mutations were performed. The original unapplied-migration and device/UI verification limitations remain. A storage failure still means the new snapshot is not persisted for a later session; it no longer overrides the successful source response.

## Fix round 2 - conflicting registry identifiers

Addressed the ambiguous body/plate merge. A shift-derived row now receives registry identity and current registry values only when exactly one registry record matches. If multiple records match, its original shift identifiers and activeShiftId remain intact, registryId stays absent, and candidate registry records remain separate rows with their own values and deletion state. Existing caller guards therefore disable registry edits/deactivation on the ambiguous shift row while retaining force-end for that shift and independent registry management on the candidate rows.

This supersedes round 1's preference for an undeleted match over archived matches: deletion status does not establish identity. The decision is independent of source ordering. No types, function signatures, or callers changed.

Regression evidence and bounded verification:

- Before the fix, `rtk node --experimental-strip-types tests/adminUnitRows.test.ts` failed the new conflict regression (5 passed, 1 failed): the shift incorrectly acquired registryId unit-b.
- After the fix, the same command passed 6/6 tests, including both candidate orders and all four active/deleted combinations. Assertions cover withheld registry mutation identity, preserved shift identity/identifiers, and separate candidate registry values/identities.
- The unique plate-match regression still confirms that a renamed unit with one matching record remains editable.
- `rtk git diff --check`: PASS.
- TypeScript and the full suite were not rerun, per the requested bounded verification; no types or callers changed. The existing MODULE_TYPELESS_PACKAGE_JSON warning remains.

Files: src/utils/adminUnitRows.ts, tests/adminUnitRows.test.ts, and this report.

No new unresolved implementation concern. Ambiguous records intentionally require choosing their separate registry row for registry management; the merge cannot infer a canonical identity from reused identifiers. Authenticated UI and remote mutations were not exercised. No database/network writes, deployments, or subagents were used; prior integration limitations remain.
