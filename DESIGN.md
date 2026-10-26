---
name: eSAKAY
description: A quiet operational interface for passengers, drivers, and fleet supervisors.
colors:
  ink: "#202427"
  canvas: "#F6F7F8"
  paper: "#FFFFFF"
  border: "#E5E7E9"
  muted: "#626A70"
  subdued: "#F1F2F3"
  ember: "#B63D32"
typography:
  headline:
    fontFamily: "System"
    fontSize: "24px"
    fontWeight: 600
  title:
    fontFamily: "System"
    fontSize: "16px"
    fontWeight: 600
  body:
    fontFamily: "System"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "System"
    fontSize: "13px"
    fontWeight: 600
  metadata:
    fontFamily: "System"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "6px"
  panel: "8px"
spacing:
  tight: "8px"
  compact: "12px"
  default: "16px"
  panel: "20px"
  generous: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
  button-sos:
    backgroundColor: "{colors.ember}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
  panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "20px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 13px"
  filter-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "8px 13px"
---

# Design System: eSAKAY

## Overview

**Creative North Star: "Achromatic ledger"**

eSAKAY is a quiet operational interface for passengers, drivers, and supervisors. Cool neutral ground, white working surfaces, and charcoal controls keep the next task clear. The supplied official logo and actual maps, unit identities, and safety records provide the product's character.

The interface reveals detail when needed: compact rosters expand in place, calendars open from the current period, and activity tabs show one category at a time. Native bottom navigation and familiar platform typography remain shared across roles. This records the implemented simplification, not every token or composition proposed by the seeded direction.

**Key Characteristics:**

- Cool neutral canvas and white working surfaces.
- Charcoal ordinary actions; color carries safety or data meaning.
- Compact rows, restrained counts, and details on demand.
- Official logo, real service information, and explicit sample states.

## Colors

The working palette is cool and nearly neutral, with color tied to information.

### Primary
- **Charcoal ink:** headings, ordinary primary actions, active navigation, and selected activity underlines.
- **Signal ember:** SOS, warnings, destructive actions, and safety figures requiring attention.

### Neutral
- **Cool canvas:** page ground around working content.
- **White paper:** header, navigation, fields, panels, and roster rows.
- **Quiet border:** panel edges and record separators.
- **Muted text:** supporting labels and secondary facts.
- **Subdued surface:** selected options and low-emphasis controls.

Weather advisories and safety grades retain semantic success, caution, and danger colors. These local data treatments do not create a decorative secondary palette.

**The Signal Rule.** Use charcoal for ordinary actions and navigation. Reserve red for SOS, warnings, destructive actions, and meaningful safety data.

## Typography

The existing platform system font is retained for application text; there is no separate display face. Shared passenger headings use the headline token, while admin and weather headings use the implemented compact variant (23 px, weight 600). Section titles use the title token; roster identity uses 15 px at weight 600. Body text remains readable at 14 px, with 12–13 px supporting text.

Counts use tabular figures where supported. Monitor totals are 26 px at weight 500, while roster trip counts are 16 px at weight 500. Large weather readings and emergency countdowns are task-specific values, not a general headline or metric scale. Labels use sentence case where practical.

## Layout

White headers and bottom navigation frame a centered working column without a sidebar. Current desktop widths follow task density: passenger content caps at 1120 px, fleet rosters at 1100 px, the monitor at 1180 px, and weather at 960 px. Page gutters are generally 14–24 px, with full available width on phones.

Summary facts share a quiet row rather than repeated raised tiles. Search and filters precede lists. Roster columns reorganize below 760 px: identity stays above driver and trip facts, with actions alongside. The reporting control collapses below 700 px and opens its calendar in flow; wider layouts use an anchored calendar. Activity tabs keep a clear selected underline and allow horizontal scrolling.

Passenger destination entry, driver route/unit selection, and supervisor monitoring each lead their own screen. These are surface compositions, not a universal page template.

## Elevation & Depth

Most content is flat: white surfaces, thin borders, and spacing provide separation. Floating calendars and header menus may use a soft shadow because they overlap content. A desktop calendar uses a charcoal shadow with a 14 px downward offset, 24 px radius, and 0.18 opacity. Repeated rows and summaries do not gain elevation.

**The Quiet Surface Rule.** Separate repeated records with rules and spacing; use a container for a coherent task rather than a separate card for every fact.

## Shapes

Shared controls use tight corners (6 px), and coherent panels use modest corners (8 px). Ledger rows remain straight-edged within their list. The principal containers use a thin border (1 px); row separators may use a platform hairline. Rounded status tags describe state rather than adding another container around ordinary content.

## Components

- **Buttons:** charcoal primary, white outlined secondary, and red SOS. Shared buttons have a minimum height of 44 px. Disabled shared controls reduce opacity and expose their disabled state.
- **Fields and selects:** white fill, quiet border, 6 px corners, and labels above the field. Shared inputs have a 46 px minimum height. Options open below the select with a bounded scroll area and a checkmark for the selected value.
- **Panels:** white surfaces with an 8 px corner and a thin border. Shared passenger panels use 20 px padding; monitor panels use 18 px. A panel holds one coherent task.
- **Roster rows:** body number and plate identify a unit, followed by assignment, trip count, and status where width permits. Track remains available, while the chevron reveals route and shift details. Repeated rows share separators instead of gaps between cards.
- **Activity tabs:** quiet text over a shared baseline; the selected category gets a charcoal underline (2 px). One activity view is visible at a time.
- **Filters:** ordinary roster filters use a white surface and dark border to show selection. Sample status stays explicit and never contributes to real monitoring totals.
- **Reporting period:** the current Philippine period stays visible. Day/week/month/year choices and calendar details appear on demand, keeping the resting control compact.
- **Navigation:** the supplied official logo anchors the white header; the white bottom bar uses charcoal for the active destination and muted text for inactive destinations. Account and alert details open over the current screen.
- **SOS:** the red action opens a five-second cancellation window, then prepares the saved contacts, current GPS, and available unit details in Messages. The passenger taps Send; unavailable location or messaging states remain visible.

The sidecar's browser snippets translate these native components for preview. Their hover and keyboard-focus styling makes the preview usable; it is not evidence that every application control has an identical custom web focus treatment.

## Do's and Don'ts

- Do retain the official logo and consistent navigation across roles.
- Do keep real and sample fleet data visibly distinct.
- Do put identity, current status, and the next useful action before expanded details.
- Do name the selected Philippine reporting period beside historical data.
- Do keep empty, unavailable, estimated, and unverified states explicit.
- Don't present sample positions as live GPS or unverified map geometry as authoritative.
- Don't present operator fare estimates as a verified LTFRB matrix.
- Don't imply that SOS sends automatically; Messages opens and the passenger taps Send.
- Don't repeat decorative tinted panels or oversized metrics for ordinary information.
- Don't replace an anchored header menu with a full-screen destination.
