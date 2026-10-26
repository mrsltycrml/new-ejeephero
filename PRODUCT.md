# eSAKAY

eSAKAY helps passengers find a ride, drivers run a shift, and supervisors monitor
fleet operation and driver safety. The official eSAKAY/Meralco logo is supplied
by the user. The interface must be simple, readable, and consistent across roles.

## People and jobs

- Passengers: enter a destination, find a suitable unit, check boarding guidance
  and fare estimates, and open an emergency message with detected ride details.
- Drivers: choose an assigned route and unit, start GPS broadcasting, see alerts,
  and review their company safety grade and driving records.
- Administrators: track units, manage the fleet and driver roster with recoverable
  deletion, review violations and grades, and export a dated PDF report.

## Product truth

The service route connects MRT Buendia and Mandaluyong City Hall. Route 2 is
coming soon. The operator reports 4 AM–midnight service, 15 units, and a target
of 12 full routes per unit. Reported fares are ₱15 regular or ₱12 discounted for
the first 4 km, plus ₱1 per additional km for all categories. Do not present these
notes as a verified LTFRB fare matrix.

Clerk sign-in is verified by Supabase. Existing accounts and roles are preserved;
verified new driver and passenger accounts activate without admin approval.
The shared registry and live GPS feed serve all roles. Fifteen visible test units
and driver profiles support testing; they must not be treated as actual live GPS.

Verified route geometry, loading-zone boundaries and waiting-area photographs
remain incomplete. Do not invent them or label an unknown area illegal. SOS has
a five-second cancellation timer and opens Messages; the passenger taps Send.

## Current UX request

Remove visual clutter across the entire application. Keep features, data, role
permissions, and the official logo. Put each screen's main task first. Reduce
repeated cards, tinted icon boxes, oversized metrics, and repeated explanations.
Use compact lists and progressive disclosure for operational detail. Preserve
accessible controls and mobile navigation.
