# Real-data Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship honest real-data navigation and remove production demo fallbacks.
**Architecture:** Existing Supabase and offline transit services are the source of operational truth. Shared pure validation backs the screens and map. Walking and fare UI requires real evidence and gracefully reports missing configuration/data.
**Tech Stack:** Expo 58, React Native, TypeScript, Leaflet, Supabase, existing Cloudflare worker.
**Spec:** docs/superpowers/specs/2026-11-18-real-data-navigation-design.md

## Global Constraints
- Production screens must never substitute demo vehicles, drivers, alerts, violations, shifts, speed, occupancy, route edits, coordinates, fares or freshness claims for missing data.
- Synthetic test fixtures remain isolated from production. Do not delete remote records.
- Show unavailable when real data is missing; do not invent fares or coordinates.
- Retain source/measurement time and uncertainty. Cached data is never silently live.
- Preserve authentication, permissions, SOS, official branding and unrelated existing edits.
- No production deployment, remote database changes or paid-service setup in this local implementation.
- Use apply_patch for edits; prefix shell calls with rtk. Existing dependencies first.
- New nontrivial data handling gets focused behavioral tests; no snapshot/string-grep tests as substitutes.
- Task order is 1, 2, 3 with review after each.

## Review Focus
- Empty live feed or failed request must never produce sample content (Task 1).
- Deleted/archived routes must not reappear through static seeds or a successful empty sync (Task 1).
- Missing speed, stale timestamps and inaccurate GPS must not claim live/current certainty (Task 2).
- Map selection must not equate destination/alighting stop with boarding origin (Task 2).
- Missing fare/walk data must not claim a saving or no cheaper option (Task 3).

### Task 1: Remove production sample data and fake operations
**Files:** src/constants/sample*, src/services/offlineTransitService.ts, src/services/adminOperationsService.ts, src/services/fleetRegistryService.ts, src/contexts/PassengerJourneyContext.tsx, src/screens/passenger/HomeScreen.tsx, src/screens/admin/SupervisorDashboardScreen.tsx, src/screens/admin/AdminOperationsScreens.tsx, src/screens/driver/NotificationsScreen.tsx, and callers discovered by rg; tests/run.ts and focused tests.
**Interfaces:** Preserve public route, stop and vehicle types unless a nullable field is necessary; document any change in the report for Task 2. Existing real service results feed all screens.
- [ ] Trace every sample/mock/demo constant and fabricated fallback reachable from App; include hardcoded admin rosters/alerts/route editor state and real database records flagged is_sample. Keep synthetic tests isolated.
- [ ] Add behavioral tests asserting an empty real fleet stays empty, sample records are excluded, and generic active route IDs survive sync normalization without static routes/stops being reinserted.
- [ ] Remove production demo toggles, fake history/metrics, sample fallback data and source files when unused. Replace screen-local mock supervisor route editing with existing real services or an explicitly read-only real route view and unavailable editing explanation. Do not implement a new route-authoring backend here.
- [ ] Make offline transit normalize all published active real routes/stops; remove baked coordinates/provisional seeds and old cache compatibility that could resurrect them. Failed reads and empty successful reads must differ; cache only real source data with freshness.
- [ ] Fix active callers, truthful empty/error states, real selection/SOS behavior. Unknown location must not say loading permitted. No seed placeholders in Directory/records/reports or runtime R2 transit fallback.
- [ ] Run focused tests, full npm test once and npx tsc --noEmit; record pre-existing failures separately. Commit only task changes.

### Task 2: Honest GPS and verified route map highlighting
**Files:** src/contexts/LocationContext.tsx, src/screens/driver/DashboardScreen.tsx, src/services/offlineTransitService.ts, src/utils/operationsSummary.ts, src/components/LeafletMap.tsx, src/screens/passenger/HomeScreen.tsx, src/contexts/PassengerJourneyContext.tsx, app.json/package.json only if genuinely required; local additive SQL migration if telemetry columns are needed; focused tests.
**Interfaces:** Add shared pure GPS validation/status helper in src/services/locationQuality.ts, reusing meters where suitable. Define a measured-fix type carrying coordinates, timestamp, accuracy and nullable speed/heading. Extend VehicleData with optional accuracy without fabricating legacy accuracy. Map optional selectedRouteId, selectedTerminal and walking-route geometry must be backward compatible.
- [ ] Add tests for invalid coords, stale/future fixes, null speed/heading/accuracy, valid stationary fixes, and stale cached positions. Proposed conservative defaults: live age <=30s, future tolerance <=5s, usable navigation accuracy <=30m; expose weak vs stale rather than discard all location context.
- [ ] Preserve the captured timestamp and accuracy through publishing/loading; no 18 km/h, false 0 accuracy, substituted heading or constant freshness copy. Validate transitions and suppress impossible jumps based on elapsed time and uncertainty. Handle denied permission, disabled location, offline and publish failure.
- [ ] Implement honest foreground tracking with explicit background limitation if reliable native background cannot be implemented without new infrastructure; do not claim OS behavior from browser tests. Do not request new permissions silently in test runs.
- [ ] Load verified routes/stops into passenger map, remove Makati-only mask/bounds, honor new active route IDs and labels. Highlight selected route and (where source geometry permits) selected ride leg, add direction cues; no straight-line fallback geometry.
- [ ] Wire stop clicks and separate boarding/alighting/destination selection. No default fake stop or coordinate. Keep camera stable across telemetry updates and fit selected journey (route + destination + walking geometry) rather than every vehicle.
- [ ] Keep service unavailable/missing-geometry states visible. Gate unknown boarding status correctly. Run tests and TypeScript, commit and report interfaces for Task 3.

### Task 3: Real Walk & Save, fare breakdown and stop landmarks
**Files:** src/services/passengerFare.ts, src/services/passengerDataService.ts, src/services/passengerPlaces.ts, src/services/placeSearchService.ts as needed, src/screens/passenger/FareScreen.tsx, src/components/PassengerStopGuide.tsx, src/screens/passenger/HomeScreen.tsx, src/contexts/PassengerJourneyContext.tsx, src/constants/esakayOperations.ts, cloudflare/worker.mjs and routing service only as needed, .env.example/docs, additive migration for real walking geometry/steps if required, focused tests.
**Interfaces:** Preserve callers or update all. Fare quote returns null/unavailable when no valid source/current matrix; no hardcoded formula fallback in passenger navigation. Walking result explicitly distinguishes unavailable, available (path/steps/distance/duration/provenance) and no-saving, with request race protection.
- [ ] Tests: missing/expired/invalid matrices and incomplete walks produce unavailable; positive savings compares same category and complete baseline; equal fares produce no-saving; reversed/unreachable route stops and unknown accessibility do not become recommendations.
- [ ] Use real selected route and stop pair. Default Regular; show regular, discount amount, payable fare and source/effective date. Do not infer approved rates from handwritten notes; missing matrix disables savings and shows unavailable.
- [ ] Improve Walk & Save using real footpath geometry/time, valid ordered ride connection, maximum walking preference and verified accessibility. Include baseline vs proposed fare and walking distance/time; apply choice to journey state.
- [ ] Show walking directions and dashed path inside eSAKAY. Prefer existing verified walk-link geometry; if absent, a small server-side configured pedestrian routing gateway may fetch real geometry. No secret in EXPO_PUBLIC env, no unconfigured default fake route. Document required server configuration and return actionable unavailable when absent.
- [ ] Destination candidates should be verified route-compatible stops; distinguish straight-line proximity from routed walking distance. Only recommend walkable candidates when real paths exist, otherwise label nearby candidates as unconfirmed walking availability.
- [ ] Improve stop guide with real photos, boarding side/direction/entrance, source and verification date. Preserve six photographed landmark labels + printed km as clearly dated reference text without inventing coordinates. Don't invent stop photos or turn landmark points into loading-zone boundaries.
- [ ] Run focused/full tests, TypeScript and web export, commit and report any deployment/config/data prerequisites.
