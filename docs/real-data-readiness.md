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

Supervisor route authoring must persist through an authorized backend before a success message is shown. The current route directory is read-only where that backend is unavailable.

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
