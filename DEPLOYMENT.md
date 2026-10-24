# EjeepHero deployment checklist

The Expo client, Supabase migrations, and build profiles are prepared in this repository. A production release still depends on applying the database migration and configuring operator-owned service data and accounts.

## Local checks

```sh
npm ci
npm test
npx tsc --noEmit
npx expo-doctor
```

Copy `.env.example` to `.env` for local work. `.env` is ignored by Git. Only Supabase URL/publishable key and the OpenWeather key are read by the Expo client. Never put DeepSeek, Twilio, or Supabase service-role credentials in `EXPO_PUBLIC_*` variables or a mobile bundle.

## Supabase setup

1. Apply `supabase/migrations/20261020130000_deployment_readiness.sql` in the Supabase SQL Editor after reviewing it against the target project. It creates the missing safety tables, adds row-level security, records route flags for review, and emits speed events only for configured speed zones.
2. Confirm the `routes` and `terminals` tables contain operator-verified stops, coordinates, fare rates, discount fares, and an effective date/source for each fare. The checked-in route data is starter data and must be verified before public use.
3. Configure `road_speed_limits` with official road limits, the correct map radius, and the source URL. The app deliberately does not assume one speed limit applies across Makati.
4. Create the initial admin through Supabase Authentication, verify the email, then promote that specific trusted account from the SQL Editor by setting its `profiles.is_admin` to `true` and `status` to `approved`. Do not allow public sign-up to assign admin access.
5. Email confirmation is currently required. Configure the production Auth site URL, redirect URLs, email provider, and password reset settings before testing account creation.
6. Deploy both Edge Functions: `herobot-chat` and `emergency-dispatch`. Add `DEEPSEEK_API_KEY` as a Supabase Function secret. For automated SOS SMS, add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` as Function secrets. Configure a Twilio sender approved for the destination countries. Without these Twilio secrets, SOS opens the device’s message composer and the user must send the SMS.
7. Verify Edge Function JWT checks are enabled. The functions validate the signed-in user and use the user-scoped Supabase client; no service-role key is required in the app.

## Native builds

The app identifiers are `com.ejeephero.mobile` for Android and iOS. Confirm ownership and store availability before publishing. Create EAS environment variables for the production and preview environments, then use the `preview` profile for internal APK distribution and `production` for store builds.

Store submissions also need signed store accounts, privacy disclosures for location and emergency-contact data, final icons/screenshots, and a user-facing privacy policy. Location collection is foreground-only in this release; do not describe the app as tracking drivers in the background.

## Objective validation

- Fare estimates use route-configured base fare, included distance, and per-kilometer rate. Walk & Save compares nearby downstream stops. Test these against the current operator/LTFRB fare matrices before describing them as official fares.
- Geofencing uses configured stop circles and current device GPS accuracy. Confirm stop coordinates and boundary radii in the field; a circle around a stop does not identify every legal or prohibited loading area.
- Trip-cut flags are created when a shift ends away from the route endpoint or without a GPS trail. A supervisor must confirm a flag; only the third confirmed flag suspends a driver.
- Speed events are generated server-side only when a sourced speed zone has been configured. Red map markers mean a recent event, not a live legal determination.
- Run `load-tests/supabase-read-load.js` with k6, a dedicated approved test account, and a production-like non-production project before claiming the 500-request-per-second target. Do not run load traffic against the live commuter database without operator approval.
- Conduct field GPS tests, SMS delivery tests on real devices, integration tests against the deployed Supabase schema, and UAT/SUS with actual commuters and supervisors. These require real devices, production-like service configuration, and participants and cannot be established by a local bundle build.
