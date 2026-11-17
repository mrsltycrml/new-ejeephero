# Real-data navigation design
Approved by the user's 2026-11-18 instruction to implement the discussed features now.

## Intent
Remove fictional production information, make location and routes truthful, and connect verified fares, walking directions and stop landmarks. Use existing Expo/React Native, Leaflet, Supabase and Cloudflare components.

## Scope and acceptance
1. Production screens must never substitute demo vehicles, drivers, alerts, violations, shifts, speed, occupancy, route edits, coordinates, fares or freshness claims for missing data. Synthetic test fixtures remain isolated from production. Do not delete remote records; exclude explicitly sample records and remove application fallbacks.
2. Unknown, failed, stale and legitimately empty results remain distinguishable. No live result is inferred from the absence of an error.
3. GPS keeps measurement timestamps and accuracy, validates coordinates, rejects stale/future/impossible readings, and represents unavailable speed/heading as unknown. Cached positions never become fresh readings. Raw evidence is not snapped to a road. Native active-shift background support must be implemented if supported by existing dependencies or explicitly surface foreground-only tracking; no silent claim of background operation.
4. Passenger maps show verified database routes across Makati and Mandaluyong without the city mask; selected route/leg stands out, walking geometry is dashed, marker selections work and the whole journey is framed. Do not manufacture polylines between landmarks. General map center is not a user/vehicle fix.
5. Transit synchronization accepts all published active routes and their verified stops, with no forced Route 1/Route 2 seeds. A successful empty response replaces stale cached records; failure may retain previously real cached records with its age/status.
6. Walk & Save compares the same route, direction, destination and passenger category against real current fare evidence and actual walking paths. Missing evidence gives unavailable, not no savings. In-app directions show geometry, steps, distance, estimated duration, and route provenance when available. No routing credentials means an explicit unavailable state.
7. Fare screen defaults to Regular, uses selected database route and current sourced fare matrix, shows regular/discount/final amounts and effective date/source, and does not silently use the hardcoded operator formula. User's handwritten fare/service notes are operator-reported only, not approved fare evidence.
8. Stop detail displays sourced name, direction, boarding-side/entrance notes, real photo and verification metadata. Photo-derived six landmark names/printed km may appear as reference text without coordinates or a verified designation. Operator notes (4 AM–midnight, target 12 full routes/unit, no overtaking; ambiguous 17 hours) are not telemetry; do not interpret the ambiguous note.
9. Supervisor mock route controls must be replaced by existing real-data controls or truthful unavailable/read-only views; a success message must follow persistence. Full new route-authoring backend is outside this focused navigation pass unless existing APIs support it.
10. Preserve authentication, permissions, SOS and official branding, and the source checkout's unrelated r2-bundle/transit/makati-boundary.json edit.

## Approaches
Chosen: extend existing real-data services, Leaflet map and screens; preserve a functional unavailable state where sources are absent. Rejected: synthetic seeded route/vehicle data, straight-line walking navigation, and a new mapping framework. Managed pedestrian routing can run through the existing server gateway; credentials stay server-side and no external service is configured or published in this local implementation.

## Verification
Behavior tests for real-data gating, unavailable fares/walks, GPS validity/freshness, route selection and map payload. TypeScript check, web build, and bounded desktop/mobile visual inspection where an authenticated session is available. Physical GPS and applied remote migrations must not be claimed as verified.
