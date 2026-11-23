---
name: eJeepHero
description: Transit wayfinding for passengers, drivers and fleet supervisors.
colors:
  ink: "#13263F"
  inkMuted: "#3E4C5C"
  action: "#164BB6"
  actionTint: "#E9F0FF"
  signal: "#FFD454"
  canvas: "#F5F4EF"
  paper: "#FFFFFF"
  border: "#C5CED8"
  sand: "#EFF2F5"
  ember: "#B42318"
typography:
  display:
    fontFamily: "System"
    fontSize: "32px"
    fontWeight: 800
  title:
    fontFamily: "System"
    fontSize: "20px"
    fontWeight: 700
  body:
    fontFamily: "System"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "System"
    fontSize: "14px"
    fontWeight: 700
  meta:
    fontFamily: "System"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  control: "12px"
  panel: "16px"
spacing:
  tight: "8px"
  compact: "12px"
  default: "16px"
  panel: "20px"
  generous: "24px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "14px 18px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "14px 18px"
  button-sos:
    backgroundColor: "{colors.ember}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "14px 18px"
  panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "20px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "13px 14px"
  filter-active:
    backgroundColor: "{colors.actionTint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "8px 13px"
---

# eJeepHero interface

## Identity and navigation

The official eJeepHero mark is a gold route pin with a simplified jeepney face,
paired with the eJeepHero wordmark. It is designed to read on both the midnight
navy header and light surfaces, without a third-party attribution plate. The
signed-in header pairs the mark with the rider’s role and keeps account actions
at the right. Narrow screens use labeled bottom tabs. Web screens at least
1100 px wide use a left rail with the same destinations.

Midnight navy anchors the header and desktop navigation. Cobalt identifies primary
actions and focus. Yellow draws attention to the planner heading, the brand mark,
and the active desktop destination. White surfaces sit on a warm off-white canvas.
Red is reserved for danger and emergency actions. GPS, safety and route states
also have text labels. Type uses the platform font. Controls have a minimum
tap target of 48 px so they stay usable outdoors.

Shared tokens and presentational components live in `src/constants/theme.ts`
and `src/components/ui`. Existing `Colors` aliases continue to work so
unmigrated screens can move over gradually.

## Screen hierarchy

- **Passenger.** The Map tab starts with origin and destination. Selecting a place shows the boarding stop, alighting stop and regular fare together. Manual selection, boarding safety and stop landmarks remain reachable below. The map moves beside the planner on wide screens.
- **Driver.** The shift state determines the main action. Unit and route selection precede shift start. During a shift, vehicle controls, GPS status and safety alerts use the actual shift context.
- **Supervisor.** Fleet monitoring, driver and unit management, and reports have distinct navigation destinations. Tables and roster rows keep identity and status together. Open a record for details and management actions.
- **Account.** Sign-in, registration and recovery present one form step at a time. Field errors belong next to the form. A verification prompt keeps the context of the account action that triggered it.

## Controls and data

Use the platform font, bold sentence-case headings and tabular figures for values that change. Give touch controls a target of at least 48 px. Pair icons with readable labels or accessible names. Separate list rows with rules and use a single surface for related fields. The screen keyboard and larger text sizes must leave the primary action reachable.

Verified routes, real map tiles and actual GPS readings supply the geographic content. A destination pin identifies a place. Boarding requires a verified stop, and fare, walking and tracking each show their own availability. Emergency actions preserve their confirmation, cancellation and delivery states.
