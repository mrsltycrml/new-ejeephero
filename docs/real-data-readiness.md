# Real-data readiness

The application must show unavailable information as unavailable. A successful network request is not proof that a stop, route, fare or walking path has been verified.

## Observed source gaps

A read-only check of the connected public reference tables on 18 November 2026 found:

| Source | Rows | Usable evidence |
| --- | ---: | --- |
| Routes | 2 | No verified route geometry |
| Terminals | 6 | No verified stop locations |
| Passenger route segments | 0 | No sourced ride distances |
| Passenger walk links | 0 | No sourced pedestrian connections |
| Passenger fare matrices | 0 | No current sourced fare matrix |

This is a dated observation, not a permanent inventory. No source records were changed or deleted during this check. Missing evidence is why the corresponding production feature is unavailable; it must not be replaced by generated coordinates or an assumed fare.

The public [Sakay GTFS repository](https://github.com/sakayph/gtfs/blob/master/README.md) describes a Metro Manila feed modified for its own application. That description alone does not verify the current eSAKAY stop locations. The [Make It Makati article](https://makeitmakati.com/amp/esakay-jeepneys-circuit-makati/) describes a Circuit Makati service, but does not supply the current route-specific fare matrix and surveyed stop coordinates required here. Neither source was automatically imported as verified operational data.

## Evidence needed for each feature

| Feature | Required real input |
| --- | --- |
| Stop map pins | Actual curbside stop coordinates, route membership, location source and verification time |
| Route highlighting | An operator-verified ordered route geometry, its source and verification time; each travel direction must be represented correctly |
| Boarding guidance | A verified loading area and instructions; a landmark point alone does not establish a legal loading boundary |
| Fare and discount | The applicable current fare matrix, route/class applicability, effective dates, source and verification time |
| Stop-to-stop fare | Verified directed ride segments and distances, in addition to the fare matrix |
| Walk & Save | A complete baseline journey, an alternative on the same route/direction, real walking geometry and instructions with source information, and comparable fares for the same passenger category |
| Walking directions | A real pedestrian route returned by a configured provider or a verified stored path; a straight line between endpoints is insufficient |
| Step-free recommendation | Explicit accessibility evidence; unknown accessibility must remain unknown |
| Stop photographs | A real photograph, source attribution and confirmation that it depicts the correct waiting area and direction |
| Live vehicle position | A fresh device measurement with its original timestamp and reported accuracy; speed and heading may be unknown |

An approved supervisor can publish a verified line for an existing route under **Fleet → View routes → Set verified route line**. The editor takes a single GeoJSON LineString for the route's travel direction and an HTTPS source. The database verifies the supervisor role and validates the geometry before reporting success.

An ordinary pedestrian route may have unconfirmed accessibility, which must be stated. It must never be offered as a step-free option without explicit accessibility evidence.

## User-supplied landmark reference

The photographed sheet is dated **3 October 2022**. These labels and printed kilometre values are useful reference text, not surveyed stop locations or current journey distances:

| Printed km | Landmark on the sheet |
| ---: | --- |
| 0 | MRT Buendia / Zodiac |
| 1 | Jupiter St., corner Makati Avenue |
| 2 | Lopez Drive / Estrella Pantaleon Bridge |
| 3 | City of Mandaluyong Science High School |
| 4 | Tivoli Garden |
| 5 | Maysilo Circle / Mandaluyong City Hall |

Confirm the exact boarding side, direction, entrance, and coordinates in the field before publishing these as selectable stops. Do not distribute markers by interpolating the printed kilometre values.

The additional handwritten notes report a regular base fare of 15 pesos, a separate “first 4 km / 12 pesos” note, an additional 1 peso, service from 4 AM to midnight, 12 full routes per unit, “17 hours,” and no overtaking. They do not establish an approved fare matrix, a live timetable, or completed trips. The relationship of the fare notes and the inconsistent duration need operator confirmation; the app must not infer either.

## Release and verification boundaries

Local migration files and application changes do not update the connected database until deployed. Review and apply the new additive migrations through the normal release process; the historical `scripts/prepare-release-sql.mjs` has a fixed October release list and is not an automatic installer for later changes. Do not replay historical seed migrations to fill these gaps.

Before describing GPS as verified on a device, test permission denial, disabled location services, poor reception, stationary readings, walking/driving, connection loss and foreground/background transitions on that device. Browser checks and synthetic test fixtures validate software behavior, not real-world positioning accuracy.

Any routing credential belongs on the server. An unconfigured or failing routing service must return an unavailable state. Keep coordinates and authentication tokens out of logs.

## Device GPS acceptance check

Run these checks with a real passenger account and an authorized driver account on the devices used in service. Record the device/OS, app version, measurement time and displayed accuracy. Do not create a synthetic vehicle or alter its coordinates to make this check pass.

| Check | Expected behavior |
| --- | --- |
| Open the app without location permission | The regional map is usable, but no user location or boarding certainty is invented. Permission is requested only after Enable location. |
| Deny permission or disable location services | A clear unavailable state appears. A previously accepted location is not treated as fresh navigation evidence. |
| Stand outdoors, then move to poor reception | The measured time and accuracy remain visible. Accuracy above 30 m or unknown accuracy cannot establish boarding or support a new driver position publication. |
| Remain stationary | New measurements can keep the position current; missing speed remains unknown, while a measured zero remains zero. |
| Walk, then ride with the driver app open | Compare positions with known physical locations. Reported accuracy is an uncertainty estimate, not a guarantee of curbside precision. Check both travel directions and bridges without snapping the evidence to a route. |
| Lose the connection | Publication failures are visible. Previously received vehicle positions age out rather than receiving a new timestamp. |
| Background, lock, then reopen the app | Foreground tracking pauses. On return, only a new accepted measurement can restore current navigation; do not describe this release as background tracking. |
| Wait more than 30 seconds without a new fix | Current-navigation eligibility expires; a cached coordinate does not stay live indefinitely. |
| Track a unit, then lose and recover its GPS feed | The user-selected unit remains selected, but recovery does not unexpectedly move the map. Pressing Track again deliberately centers its next eligible position. |

The 30-second freshness limit and 30-metre navigation threshold are validation gates, not promises that GPS will meet those values. If the operating devices cannot obtain reliable fixes, investigate their location settings, reception and hardware before loosening these gates.

## Local changes and release order

The GPS and sample-filter changes include `20261118010000_exclude_sample_fleet_units.sql` and `20261118020000_measured_gps_quality.sql`. Apply reviewed migrations through the normal release process before relying on the new telemetry fields. Keep legacy capture time and accuracy unknown; never backfill either from receipt time or assumed values.

Apply `20261118040000_live_route_deviations.sql` after the measured GPS migration. It adds the verified route coordinates, supervisor publishing RPC and private route warning feed. Collect actual routes and test with an approved driver shift before relying on alerts. The server uses a 75 m corridor, with at least three consecutive accurate positions outside it after accounting for reported uncertainty, spanning at least 12 seconds. Poor GPS, implausible movement and coverage gaps cannot establish the alert. The driver and supervisor receive in-app alerts. A possible deviation is separate from the end-of-shift missed-stop violation and carries no automatic penalty.

Publish the verified reference records and refresh the shared route/stop catalog in the app. Confirm that an empty successful response clears old records, while a failed response is identified as unavailable or dated cached data. Adding a row alone does not make a route or stop verified.

The local preview at `http://localhost:8091` uses the application's existing sign-in flow and connected data. There is no generated test login. A successful local preview or web export is not a deployment of database migrations, routing functions, or the public application.

The redesigned web app was deployed on 18 November 2026 at [ejeephero.carlosbusuego15.workers.dev](https://ejeephero.carlosbusuego15.workers.dev). The release covered the web app. Production database migrations and the walking-directions function still need deployment.

Operators can use the [route data workbook](eSAKAY-route-data.xlsx) to submit verified stop pins, route lines, measured distances and fare charts for each direction.

Redeploy `herobot-chat` with its updated context builder before using the assistant in production. It no longer supplies default fares, unsourced safety labels or active-shift counts as current GPS information. The chat directs operational quotations and navigation to the sourced Fare and Map screens; its generated prose is not a new source of verified operational data.

See [walking directions setup](walking-directions-setup.md) for the additional migration, server-only routing configuration, authentication, quota limits and exact source-data fields.

## Passenger web map

The passenger website uses a [mapcn](https://www.mapcn.dev/docs/basic-map) adaptation with MapLibre GL and [OpenFreeMap Liberty](https://openfreemap.org/quick_start/). This basemap needs no API key. Browsers that cannot load it fall back to the Leaflet map, which also serves the native app.

eSAKAY supplies verified route geometry, curbside stops, ride distances and fares. The separately configured walking service supplies pedestrian paths.
