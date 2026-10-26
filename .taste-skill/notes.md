# Whole-app simplification

Direction: Achromatic ledger, seed 2102406886. Existing logo, accent and system
type retained. One shell redraw selected No sidebar: the app has only 3–4 primary
destinations per role and a shared native navigation bar. The original open-plane
sidebar would add chrome and reduce the live map's usable area.

Face: eSAKAY's actual logo, neutral service surfaces, restrained brand red on
warnings and the live unit markers. Primary controls use ink. The distinctive
product element is the live unit map and body/plate identity shared across roles.

Questions, in priority order:

- Monitor: where are the active units, and which driver events need attention?
- Units: which unit is this, who is driving, and can I track it?
- Drivers: who is available and who has violations in this reporting period?
- Passenger dashboard: which unit can take me to my destination?
- Driver dashboard: which route and unit am I taking on shift?
- Fares: what is the estimated fare for this passenger and journey?
- Safety: how do I reach my contacts and local help with my current ride details?
- Records: what is my company grade, and which events explain it?
- Account: which account is signed in and where do I change its details?

Before evidence: `.impeccable/review/release-20261027` captures the incumbent app
at desktop and 320px phone widths. Its ordinary examples contain real account
identifiers and must remain local. New screenshots belong in a separate folder.

Plan: reduce one layer of boxes; use an unboxed metric strip; put monitor safety
sections behind clear tabs; use compact expandable roster rows; keep destination
entry ahead of boarding guidance; replace persistent empty guidance panels with
a compact disclosure; make primary controls neutral; normalize typography.

Verification: bounded desktop/tablet/phone CUA pass, one fix batch, one confirmation
round, followed by the required fresh finish review and documentation handoff.
The taste inspector's browser automation must be adapted to CUA in this environment;
do not claim its script ran. Native phone hardware remains a separate test.

Completed scan: all active role screens plus sign-in, registration, recovery,
shared profile and secondary passenger screens at1440/768/390/320 CSS pixels.
CUA screenshots and measurements are in `.impeccable/review/quiet-20261027`.
Final suffixes and overwritten reviewed paths contain the confirmation evidence.
The bounded correction batch fixed panel containment, roster identity width,
compact date/report controls, the duplicate boarding notice and SOS emphasis.
Fresh finishing review additionally required a full-width expanded phone calendar,
neutral ordinary actions, and one compact panel for weather details.

Full frontend Taste lint:0 failures,18 warnings. Retained warnings concern date/
unit identifier zero-padding, unavailable-value dashes, and map marker styling.
The chatbot server's route direction separator is outside the frontend lint scope.
TypeScript,29 behavior tests and the production web build pass. Authentication/
authorization checks are independent of visual QA; no native hardware result is
implied by browser resizing.

Final reviewer disposition: ship for all three scored fixes. Documenter reconciled
DESIGN.md and `.impeccable/design.json` with the approved neutral system.
Cloudflare Worker version9932647e-7244-4d20-a12c-3218c4e9d606 deployed under
Carlos account418268e10f29687d397e5248a846442d. Built bundle is
index-b8ca2a1b098a5c4e6446da5e3788ad98.js. Live app, manifest, install icons,
stable/versioned R2 boundary JSON and missing-file404 behavior were checked.
Static responses now pass through the Worker so nosniff, referrer, location
permission and no-cache document policies actually apply on the live host.

Standalone Android health checks required direct expo-auth-session and
expo-web-browser dependencies; added the SDK58-compatible versions and browser
config plugin. TypeScript5.9.3 is intentionally retained to satisfy the current
Clerk/Solana peer graph and its reproducible lockfile. Expo's TypeScript version
recommendation is explicitly excluded; this is a development compiler constraint,
not a runtime-module exclusion. Type checking and the actual native build remain
required before publication.

Corrected Android build2c3071bb-bc0f-4f9d-9608-b36fbdca2aff finished successfully.
Its own remote health check also passed20/20. Published the signed108670781-byte
APK to a versioned R2 key and `releases/ejeephero-latest.apk`. A full public
download matched SHA25649e2fba66b004439f14da35dcd727fcdb0faa69ca25df95d8790d4f70268c6a6.
APK archive has its manifest, executable bundle and dex; no environment files or
known Clerk/Deepseek server-secret bytes were found in its bundle. Real-device
behavior is still untested; build success does not imply hardware validation.
