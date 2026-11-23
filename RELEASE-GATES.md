# Release gates

Record evidence for each gate before enabling production service. A checked box means the responsible person has reviewed the evidence, not merely that code exists.

## Environments

- [ ] Identify separate staging and production Supabase projects. Configure each EAS build environment with its own public endpoints and keys.
- [ ] Configure separate Clerk, R2, DeepSeek, and Twilio credentials where supported. Store server secrets in the appropriate server environment.
- [ ] Verify staging builds target staging services and production builds target production services. Do not load-test production.
- [ ] Review migrations, backups, RLS, Edge Functions, authentication redirects, and recovery steps against the target project before deployment.

## Operator data and field calibration

- [ ] Obtain operator verification for both routes, stops, coordinates, loading areas, fares and effective dates, fleet identities, assignments, and sourced speed zones.
- [ ] Record source, reviewer, date, and approval for each dataset. Keep unverified information labeled provisional or sample.
- [ ] At each stop, record device, time, measured coordinates, GPS accuracy, and comparison with approved coordinates. Document measurements supporting each approved radius.
- [ ] Test designated and unauthorized loading areas, route direction, arrival detection, weak signal, and delayed telemetry. Record results and operator approval.

## Emergency messaging

- [ ] Verify the five-second cancellation window, current GPS, vehicle identifiers, and timestamp with consenting test contacts.
- [ ] Test real SMS delivery and failures, including missing location, connectivity, provider configuration, and account balance. Confirm the Messages fallback.
- [ ] In staging, test accident and breakdown reports with and without a vehicle, GPS consent, retry, supervisor-only access, dispatch and resolution.
- [ ] Obtain explicit operator sign-off before enabling automatic production SMS. Do not use real commuter contacts for test messages.

## Performance and release

- [ ] Agree on peak traffic, request mix, latency and error thresholds, and staging dataset size before testing.
- [ ] Run smoke, 10% peak, peak, 2× peak, and short spike tests against staging. Record metrics, configuration, and pass/fail results.
- [ ] Pass automated tests, TypeScript, Expo checks, and staging integration tests.
- [ ] Complete Android and iOS device smoke tests for passenger, driver, and supervisor roles.
- [ ] Record approvals and evidence for all gates before production deployment.

Current gaps: separate EAS environments must be populated with distinct Supabase projects and checked before release. Automatic SOS must be configured and validated with consenting test contacts. The k6 script reads the passenger fleet snapshot and defaults to 500 requests per second.
