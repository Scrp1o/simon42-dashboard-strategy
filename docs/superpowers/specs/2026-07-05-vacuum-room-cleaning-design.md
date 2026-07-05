# Vacuum Room Cleaning — Design Spec

**Date:** 2026-07-05
**Branch:** `feature/vacuum-room-cleaning`
**Status:** Approved design, pending implementation plan

## Summary

Add robot-vacuum room cleaning to the simon42 strategy. When the user selects a
vacuum entity that supports HA's native `vacuum.clean_area` service, the strategy:

1. adds a **"Clean this room"** button to each room's detail view
   (`RoomViewStrategy`), calling `vacuum.clean_area` with that room's `area_id`;
2. optionally shows a **vacuum card** on the overview/home view for native
   multi-area cleaning (via the entity's more-info dialog);
3. optionally shows a **cleaning-mode selector** (a separate user-provided entity)
   next to the vacuum controls, for cases where the room-cleaning integration
   can't set the mode.

No per-room mapping config is required: **the HA area *is* the mapping**. The
device's cleaning rooms are mapped to HA areas by the integration (e.g. the
Matter vacuum integration), and `vacuum.clean_area` takes HA `area_id`s directly.

## Background / device reality (Dominik's setup)

- `vacuum.floor_cleaning_robot_s10` — **Matter** integration, `supported_features:
  29212`. Bit `16384` (CLEAN_AREA) is set → supports `vacuum.clean_area`. This is
  the room-cleaning entity. SwitchBot rooms are mapped to HA areas.
- `vacuum.s10_vacuum_175c` — **SwitchBot (Bluetooth)** integration,
  `supported_features: 12304` (no `16384`). Cannot clean by area. Only exposes
  vacuum + battery + BT-signal; **no** mode select.
- `select.floor_cleaning_robot_s10_clean_mode` — Matter clean-mode select (state
  "Quick"). The only mode-select entity currently present. (User reports Matter
  mode control is unreliable/insufficient; hence the mode entity is
  user-configurable rather than auto-derived.)

### The service

```yaml
action: vacuum.clean_area
target:
  entity_id: <vacuum_entity>
data:
  cleaning_area_id: <ha_area_id>   # area selector; supports multiple for the native card
```

Requires vacuum feature bit `16384`. Not fired during design (would physically
start cleaning); confirmed at the API/service-schema level.

## Config options (`src/types/strategy.ts`)

Add to `Simon42StrategyConfig`:

| Option | Type | Default | Purpose |
|---|---|---|---|
| `vacuum_entity` | `string` | — | Vacuum entity_id used for `clean_area`. Selecting it enables the feature. |
| `vacuum_mode_entity` | `string` | — | Optional entity (typically `select`/`input_select`) for cleaning-mode selection. |
| `vacuum_hidden_areas` | `string[]` | `[]` | Area IDs excluded from the per-room "Clean this room" button. |
| `show_vacuum_card` | `boolean` | `false` | Show the vacuum card on the overview/home view. |

Feature is off unless `vacuum_entity` is set. Follows existing naming
conventions (`show_*` boolean toggles, snake_case, area-id string arrays like
`areas_display.hidden`).

## Component 1 — Per-room "Clean this room" button (`RoomViewStrategy.ts`)

- Gate: `vacuum_entity` is set AND the vacuum entity exists in `hass.states` AND
  the room's `area.area_id` is NOT in `vacuum_hidden_areas`.
- Render a dedicated **Vacuum** section (grid) with:
  - a `heading` (`mdi:robot-vacuum`, localized "Vacuum");
  - the **mode selector tile** (only if `vacuum_mode_entity` set — see Component 3);
  - a **`button` card** "Clean this room" (localized), icon `mdi:robot-vacuum`,
    `tap_action`:
    ```yaml
    action: perform-action
    perform_action: vacuum.clean_area
    target: { entity_id: <vacuum_entity> }
    data: { cleaning_area_id: <area.area_id> }
    ```
- Section placement: after the misc/domain sections, before room pins (order can
  be finalized in implementation; not load-bearing).
- Decision: **`button` card, not a `tile`** — it is an action, not an entity
  state. (Approved.)

## Component 2 — Overview vacuum card (`OverviewSection` / `OverviewViewStrategy`)

- Gate: `show_vacuum_card` is true AND `vacuum_entity` set AND entity exists.
- Render a `tile` for `vacuum_entity` with `features: [{ type: vacuum-commands }]`
  (HA's default vacuum representation). Tapping opens more-info, which is the
  native **multi-area select clean** surface.
- If `vacuum_mode_entity` is set, render the mode selector tile alongside it.
- Placement: **bottom of the Overview section**. (Approved.)
- Verify during build that the more-info area-multiselect is the intended
  "native multi-area select" surface; if HA exposes a richer dedicated card, use
  that instead.

## Component 3 — Cleaning-mode selector (shared)

- Only rendered when `vacuum_mode_entity` is set.
- Rendered as a `tile` for that entity. If its domain is `select` or
  `input_select`, add `features: [{ type: select-options }]` so the mode is
  changeable inline (dropdown) without opening more-info. Other domains render
  as a plain tile.
- Appears in both the per-room Vacuum section and the overview vacuum card. It
  reflects the same (global) entity state everywhere — intended.

## Component 4 — Editor (`StrategyEditor.ts` — complexity hotspot)

Add a small "Vacuum" config group:
- entity picker for `vacuum_entity` (domain `vacuum`; ideally filtered to
  entities supporting `clean_area`/feature `16384`);
- entity picker for `vacuum_mode_entity` (optional; no hard domain restriction,
  or `select`/`input_select`);
- toggle for `show_vacuum_card`;
- area multi-select for `vacuum_hidden_areas`.

Follow existing editor patterns (config-changed events, expand-state handling).
Touch the editor carefully — it is a documented regression hotspot.

## Component 5 — i18n (`src/translations/en.json`, `de.json`)

New keys (final names TBD in implementation), e.g.:
- `room.vacuum` → "Vacuum" / "Staubsauger"
- `room.vacuum_clean_here` → "Clean this room" / "Diesen Raum saugen"
- editor labels for the four new options.

## Feature gating summary

| Rendered element | Condition |
|---|---|
| Per-room clean button | `vacuum_entity` set, entity exists, area not in `vacuum_hidden_areas` |
| Overview vacuum card | `show_vacuum_card` true + `vacuum_entity` set + entity exists |
| Mode selector | `vacuum_mode_entity` set (shown within the above elements) |

## Edge cases

- `vacuum_entity` set but entity missing/removed → render nothing (no crash).
- Selected vacuum lacks `clean_area` (feature `16384`) → the button still calls
  the service, which HA rejects; acceptable, but the editor picker should steer
  the user to capable entities. No hard runtime validation required for v1.
- `vacuum_hidden_areas` referencing non-existent areas → harmless no-op.
- `cleaning_area_id` for an area the vacuum has not mapped → HA/integration
  no-ops or errors; this is the user's mapping concern, not the strategy's.

## Non-goals (YAGNI)

- Multiple vacuums (single `vacuum_entity` only for v1).
- Auto-detecting which HA areas the vacuum can reach (not exposed by HA;
  handled via the `vacuum_hidden_areas` exclude list instead).
- Per-room mode overrides (mode is global).
- Firing/validating `clean_area` against the live robot during build.

## Delivery

Source feature (not a dashboard-config change): follow the fork dev loop —
`node build.local.mjs` → `./deploy.local.sh` → hard-refresh → test on
`dashboard-home42` via HA MCP + Chrome DevTools. Feature branch
`feature/vacuum-room-cleaning`. Version bump + release only after Dominik is
satisfied.
