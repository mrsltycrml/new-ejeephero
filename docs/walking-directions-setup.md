# Sourced fares and walking directions

This is a local implementation. No function has been deployed, no provider account
has been configured, and no migration or source-data import has been run remotely.
The reviewed source currently has no verified stop coordinates, ride segments,
fare matrices or walking links. Unavailable states are the expected result.
See [release and device checks](real-data-readiness.md).

## Release prerequisites

Apply the specific additive migrations through the normal controlled release
process, in timestamp order:

- `20261118010000_exclude_sample_fleet_units.sql`
- `20261118020000_measured_gps_quality.sql`
- `20261118030000_walking_directions.sql`

Do not replay historical seed SQL. The old guarded
`scripts/prepare-release-sql.mjs` allowlist is not a release bundle for these
migrations. Preserve existing source rows; the new migration does not mark
anything verified or populate fares/coordinates. Exercise the SQL in a controlled
database before release, including concurrent quota claims.

The walking migration adds nullable path, instruction and accessibility evidence
fields; explicit fare currency; sourced stop-detail/photo metadata; and a private
per-account quota table. Old accessibility false values without their own source
and verification time remain unknown in the application. Existing RLS and
read-only source-table permissions remain in place.

## Edge function configuration

Deploy `supabase/functions/walking-directions` after applying the migration.
The function is self-contained in that directory. Configure these **server-only**
Supabase Edge secrets:

- `ORS_API_KEY`: a valid openrouteservice credential. Never use an
  `EXPO_PUBLIC_` name or put this key in the client.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: the Edge runtime project
  configuration, used for user validation and the quota RPC.
- For Clerk sessions, `CLERK_ISSUER_URL` and `CLERK_AUTHORIZED_PARTIES`:
  exact comma-separated authorized origins, including the intended localhost
  preview origin (currently `http://localhost:8091`) when testing locally.
  Clerk tokens must carry signed `sub`, `exp`, `iat`, the configured issuer,
  an allowed `azp`, and verified email. Confirm native token origins/claims too.

`supabase/config.toml` sets `verify_jwt = false` for this function because
the gateway's legacy JWT validation cannot handle both session types. The
handler itself authenticates a Supabase user, or verifies a Clerk RS256 token
against the configured issuer's remote JWKS. Both paths require an approved
profile. No identity is accepted from a request body or unsigned token.
Do not disable the handler checks.

The client uses `AuthContext.getAccessToken()` through explicit passenger actions.
The request body is `{from: {latitude, longitude}, to: {latitude, longitude}}`.
The UI must only offer GPS-origin navigation with an accepted, current, accurate,
foreground fix and discard responses after a journey/input change. This function
also supports a selected alighting stop to a destination point. It does not
verify that coordinates are a legal loading bay.

## Provider and limits

The handler posts to
`https://api.openrouteservice.org/v2/directions/foot-walking/geojson`, with two
longitude/latitude pairs, `instructions: true`, `instructions_format: "text"`,
`language: "en"`, `units: "m"`, and `radiuses: [30, 30]`.
These options follow the official
[request and return types](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/requests-and-return-types)
and [Directions schema](https://github.com/GIScience/openrouteservice-docs/blob/master/API%20V2/swagger.json).

Requests are limited to two points in the existing Metro Manila search area,
1 m–5 km apart in a straight line. This is an input bound, not a walking-distance
claim. Provider paths must be at most 10 km/4 hours, have matching endpoints
within 30 m, finite geometry, complete contiguous step indices, text directions,
coherent measured step totals, and a recent provider response timestamp.
No computed line or assumed walking speed is substituted.

Request bodies are capped at 8 KiB with a 5-second read deadline. Provider
requests and bodies have a 10-second deadline and 2 MB cap. Geometry is limited
to 20,000 points and 500 steps. Database requests have 8-second deadlines; JWKS
fetches have a 5-second deadline. The app request has a 15-second timeout.
Failures return unavailable and never return a guessed route.

`claim_walking_directions` serializes claims per approved account with a
transaction advisory lock and permits 12 requests per UTC minute, 120 per UTC
day. Only the service role can execute it. Missing migrations/failed quota
checks fail closed before ORS is called. Counters store account IDs and time/count
fields only, not coordinates or tokens; paths are returned to the client and not
persisted. ORS necessarily receives the requested coordinates. Application code
does not log coordinates/tokens; review platform/provider retention separately
when enabling the service.

## Real source inputs

Fare matrices require the exact selected route ID, explicit `currency: "PHP"`,
HTTPS source URL, valid verification timestamp, valid effective dates, and a
nonempty ordered bracket array. Each bracket has numeric `up_to_km`,
`regular`, and `discounted`. Distances must strictly increase, fares must not
decrease, and discounted amounts must be between zero and regular. The entire
table is checked before quoting. The default quote date uses Asia/Manila.
No handwritten formula fallback or generic LTFRB-approval label is used.

Ride segments must be sourced, directed and connected. Ambiguous branching
journeys remain unavailable until the source identifies one direction/path.
Walk & Save compares the same category, route and destination, with alternative
boarding stops strictly downstream on that baseline path and consistent stop
sequence. The origin is the **selected boarding stop**, not current GPS.

Stored `passenger_walk_links.coordinates` is a JSON array of
`{latitude, longitude}` objects; `steps` is an array of
`{instruction, distance_meters, duration_seconds}`. The row also requires
positive `distance_meters`, `duration_seconds`, HTTPS `source_url` and
`verified_at`. For a step-free recommendation, require `accessible: true`
plus its own `accessibility_source_url` and `accessibility_verified_at`.
An ORS foot-walking path always has `accessible: null`; it is not a surveyed
accessibility guarantee or loading-zone approval.

Only the raw ORS response requires step indices: `way_points: [start, end]`
contains zero-based indices into that response's geometry coordinates. The
first step starts at index 0, each next step starts at the previous end, and
the final step ends at the last coordinate. Arrival steps may start and end at
the same index. The parser checks this continuity before normalizing to the
three-field step contract above. Stored links and the app's `WalkingRoute`
do **not** require `fromIndex` or `toIndex`; their steps are validated against
the sourced distance/duration totals.

Missing walks are unavailable, not proof of no saving. A no-saving result means
complete sourced comparisons under the chosen walking preference produced no
lower fare. Stored links are used for savings; dynamic ORS routing supplies
explicit GPS access and destination egress directions.

Stop metadata added to `terminals`: `boarding_side`, `travel_direction`,
`entrance_instructions`, `stop_details_source_url`,
`stop_details_verified_at`, and `landmark_photo_source_url`.
Do not join a loading zone by name/proximity or assign a reference photograph to
an unrelated stop. The six labels from the 2022 sheet remain dated reference text.

## Local verification and release checks

Focused tests exercise fare/route/walk trust boundaries, auth rejection,
request/rate-limit failure handling, provider validation and planning pagination.
They replace external database and JWT/provider boundaries; they do not prove
the SQL quota lock, live JWKS integration or an ORS account works in production.
Neither Deno nor the Supabase CLI was available in this task environment.

Before enabling: apply/test the migration, configure real credentials and exact
Clerk origins, verify invalid/expired tokens are rejected, exercise simultaneous
quota requests and day/minute rollover, and test genuine routes with steps on
device. Controller owns the integrated browser checks, full suite and web build.
No deployment of these changes is claimed. The existing live application at
[ejeephero.carlosbusuego15.workers.dev](https://ejeephero.carlosbusuego15.workers.dev)
was verified to serve its sign-in page on 18 November 2026; the updated local
preview is `http://localhost:8091`. The example `.env.example` Pages URL is not
the live address configured in this workspace.
