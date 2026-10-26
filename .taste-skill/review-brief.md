# eSAKAY whole-app simplification review

User request: the whole app is cluttered; make it simple, easy to understand,
consistent across admin, driver and passenger. Use Emil, Impeccable and Taste.

This is an existing functional native/web app, not a marketing page. No approved
visual comp. The seeded app direction is Achromatic ledger, seed 2102406886,
with existing logo and system typography retained. One permitted shell redraw
chose No sidebar, preserving the map and the existing native bottom navigation.

Own world: actual eSAKAY logo, live unit body/plate identity, road maps, route and
safety records. Neutral canvas #F6F7F8, white panels, ink #202427, quiet borders
#E5E7E9. Red #B63D32 belongs to SOS, warnings and meaningful data. Ordinary
actions use charcoal. No simulated physical materials or decorative imagery.

Promises: reduce competing boxes; keep one obvious next action; show details on
demand; readable compact rosters; preserve all role-specific workflows and truth
about sample data, unverified route geometry and emergency message delivery.
Passenger starts with destination entry. Driver starts with route/unit selection.
Admin starts with period, totals, map and four safety activity tabs.

Evidence: `.impeccable/review/quiet-20261027`. Desktop=1440, tablet=768,
phone=390, narrow=320 CSS pixels. Suffix `-final` means post-correction capture.
Other captures in this directory show the same simplification before one bounded
fix batch, not the original incumbent. Original incumbent captures are under
`release-20261027`. No physical iOS/Android hardware tests are claimed.

Already corrected after the whole-app batch: map filter panel overflow at320;
unit identity squeezed by trip totals; mobile reporting controls too tall;
Refresh wrapping; duplicate passenger boarding guide; SOS restored to red.
Final captures override earlier captures for those surfaces. Other views were
not changed by the correction batch. DOM measurements found no outer overflow.

Read final desktop/narrow monitor, final desktop/narrow units, drivers desktop/
narrow, driver dashboard/alerts/records, final passenger home, fares/safety,
profile, auth and secondary passenger pages. Expanded calendar/unit forms are
also captured. Do not approve an absent or loading capture. Screenshots contain
real QA account identifiers: keep them local. No source mutation in review.

Verification: TypeScript passes; all29 behavior tests pass; production web build
passes. Taste lint found0 failures and one emdash warning (unavailable values).
CUA replaces the skill inspector's browser driver; its inspector script did not
run and is not claimed as passed.
