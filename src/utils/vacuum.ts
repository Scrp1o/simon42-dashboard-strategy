// ====================================================================
// Vacuum helpers — clean_area capability + shared card builders
// ====================================================================

import { Registry } from '../Registry';
import type { HomeAssistant } from '../types/homeassistant';
import type { LovelaceCardConfig } from '../types/lovelace';

/** VacuumEntityFeature.CLEAN_AREA bit (required for vacuum.clean_area). */
export const VACUUM_SUPPORT_CLEAN_AREA = 16384;

/** True if the vacuum state object advertises clean_area support. */
export function vacuumSupportsCleanArea(
  stateObj: { attributes?: Record<string, any> } | undefined
): boolean {
  const features = (stateObj?.attributes?.supported_features as number) || 0;
  return (features & VACUUM_SUPPORT_CLEAN_AREA) !== 0;
}

/**
 * A "clean this room" action button. Uses a core `button` card so the WHOLE
 * card is the tap target (full width) — the previous bubble-card button only
 * made the icon tappable.
 *
 * When `cleanScript` is set it calls that script with `{area_id}` (so the
 * script can record the target room for status display); otherwise it calls
 * `vacuum.clean_area` directly.
 */
export function buildCleanRoomButton(
  vacuumEntity: string,
  areaId: string,
  label: string,
  cleanScript?: string
): LovelaceCardConfig {
  const tap_action = cleanScript
    ? { action: 'perform-action', perform_action: cleanScript, data: { area_id: areaId } }
    : {
        action: 'perform-action',
        perform_action: 'vacuum.clean_area',
        target: { entity_id: vacuumEntity },
        data: { cleaning_area_id: areaId },
      };
  // Compact tile — the whole tile is the tap target (full width), and it also
  // shows the vacuum's live state as a bonus. Not a giant button card.
  return {
    type: 'tile',
    entity: vacuumEntity,
    name: label,
    icon: 'mdi:robot-vacuum',
    vertical: false,
    tap_action,
    icon_tap_action: tap_action,
  };
}

/**
 * Per-room vacuum status — conditional cards (core only) that show whether the
 * vacuum is cleaning THIS room or busy in another one. Needs `targetHelper`
 * (an input_text set by the clean script) to know the current room; without it
 * only a generic "vacuum active" indicator is shown.
 */
export function buildVacuumRoomStatus(
  vacuumEntity: string,
  areaId: string,
  targetHelper: string | undefined,
  labels: { here: string; other: string }
): LovelaceCardConfig[] {
  // A padded mushroom card wrapped in a `conditional` so it hides/shows LIVE
  // with the vacuum state (vertical-stack-in-card ignores the universal
  // `visibility` key, so we must use `conditional`). This is placed as its own
  // standalone card in the section — NOT inside the tile stack — so the mushroom
  // renders as a clean rounded card instead of leaving a border seam.
  // With a target helper it flips text/icon/colour between "cleaning here" and
  // "busy in another room"; without one it shows the generic "busy" message.
  let card: LovelaceCardConfig;
  if (targetHelper) {
    const here = `is_state('${targetHelper}', '${areaId}')`;
    card = {
      type: 'custom:mushroom-template-card',
      icon: `{{ 'mdi:broom' if ${here} else 'mdi:robot-vacuum' }}`,
      icon_color: `{{ 'green' if ${here} else 'blue' }}`,
      primary: `{{ '${labels.here}' if ${here} else '${labels.other}' }}`,
      layout: 'horizontal',
    };
  } else {
    card = {
      type: 'custom:mushroom-template-card',
      icon: 'mdi:robot-vacuum',
      icon_color: 'blue',
      primary: labels.other,
      layout: 'horizontal',
    };
  }
  return [{ type: 'conditional', conditions: [{ entity: vacuumEntity, state: 'cleaning' }], card }];
}

/**
 * Tile for the optional cleaning-mode entity. Returns null if the entity
 * is not present. select/input_select entities get an inline dropdown.
 */
export function buildVacuumModeTile(
  entityId: string,
  hass: HomeAssistant
): LovelaceCardConfig | null {
  if (!hass.states[entityId]) return null;
  const domain = entityId.split('.')[0];
  const tile: LovelaceCardConfig = { type: 'tile', entity: entityId, vertical: false };
  if (domain === 'select' || domain === 'input_select') {
    tile.features = [{ type: 'select-options' }];
    tile.features_position = 'inline';
  }
  return tile;
}

/**
 * Tiles for the cleaning-settings entities. Accepts a single entity or a list,
 * so a setup can expose several axes side by side (e.g. mop-vs-vacuum, suction,
 * water) instead of one flattened preset dropdown. Missing entities are skipped.
 */
export function buildVacuumModeTiles(
  entities: string | string[] | undefined,
  hass: HomeAssistant
): LovelaceCardConfig[] {
  if (!entities) return [];
  const list = Array.isArray(entities) ? entities : [entities];
  return list
    .map((id) => buildVacuumModeTile(id, hass))
    .filter((card): card is LovelaceCardConfig => card !== null);
}

// -- Cleaning history ---------------------------------------------------
//
// Opt-in by naming convention (no config, no hardcoded entities): a room gets
// its history once these helpers exist, typically kept up to date by an
// automation that stamps them when a run finishes.
//
//   input_datetime.vacuum_last_vacuumed_<area_id>   (required)
//   input_datetime.vacuum_last_mopped_<area_id>     (optional)
//   binary_sensor.vacuum_due_<area_id>              (optional, device_class problem)
//
// Timestamps before 2000 mean "never": input_datetime cannot be empty and
// defaults to today, so a far-past sentinel is the only way to say "not yet".

export const vacuumHistoryEntities = (areaId: string) => ({
  vacuumed: `input_datetime.vacuum_last_vacuumed_${areaId}`,
  mopped: `input_datetime.vacuum_last_mopped_${areaId}`,
  due: `binary_sensor.vacuum_due_${areaId}`,
});

/**
 * "Vacuumed 2 days ago / Mopped never" line for a room's vacuum card. Returns
 * null when the room has no history helper. Rendered server-side by a mushroom
 * template (reactive), in calendar days; the icon turns orange while the room's
 * due sensor is on.
 */
export function buildVacuumHistoryCard(
  areaId: string,
  hass: HomeAssistant,
  labels: { vacuumed: string; mopped: string; never: string; today: string; yesterday: string; daysAgo: string }
): LovelaceCardConfig | null {
  const ids = vacuumHistoryEntities(areaId);
  if (!hass.states[ids.vacuumed]) return null;

  // One macro per template: Jinja macros don't cross mushroom's primary/secondary.
  const ago =
    `{% macro ago(e) %}{% set ts = state_attr(e, 'timestamp') %}` +
    `{% if ts is not number or ts < 946684800 %}${labels.never}{% else %}` +
    `{% set d = (now().date() - as_local(as_datetime(ts)).date()).days %}` +
    `{% if d <= 0 %}${labels.today}{% elif d == 1 %}${labels.yesterday}` +
    `{% else %}${labels.daysAgo.replace('{n}', '{{ d }}')}{% endif %}{% endif %}{% endmacro %}`;

  const card: LovelaceCardConfig = {
    type: 'custom:mushroom-template-card',
    icon: 'mdi:history',
    icon_color: hass.states[ids.due] ? `{{ 'orange' if is_state('${ids.due}', 'on') else 'disabled' }}` : 'disabled',
    primary: `${ago}${labels.vacuumed} {{ ago('${ids.vacuumed}') }}`,
    layout: 'horizontal',
  };
  if (hass.states[ids.mopped]) {
    card.secondary = `${ago}${labels.mopped} {{ ago('${ids.mopped}') }}`;
  }
  return card;
}

/**
 * Door sensors belonging to an area, from the entity registry (NOT the visible
 * set — a door sensor hidden from dashboards still governs whether the robot
 * can physically get through).
 */
export function findAreaDoorSensors(areaId: string, hass: HomeAssistant): string[] {
  return Registry.getEntitiesForArea(areaId)
    .map((e) => e.entity_id)
    .filter(
      (id) =>
        id.startsWith('binary_sensor.') &&
        hass.states[id]?.attributes?.device_class === 'door'
    );
}

/**
 * Warning shown while the mop water station is unreachable.
 *
 * The station sits in some room; if every door of that room is closed the robot
 * cannot get to it, so the mop can be neither watered nor washed. Rather than
 * letting someone start a mop job that quietly cannot work, the card says so.
 *
 * Conditions are AND-ed, so the warning appears only when ALL of the area's door
 * sensors read closed — one open door is enough to reach the station. Returns []
 * when the area has no door sensor at all, which keeps the feature dormant until
 * such a sensor exists.
 */
export function buildWaterStationWarning(
  areaId: string | undefined,
  hass: HomeAssistant,
  labels: { blocked: string; areaName: string }
): LovelaceCardConfig[] {
  if (!areaId) return [];
  const doors = findAreaDoorSensors(areaId, hass);
  if (doors.length === 0) return [];
  return [
    {
      type: 'conditional',
      conditions: doors.map((entity) => ({ entity, state: 'off' })),
      card: {
        type: 'custom:mushroom-template-card',
        icon: 'mdi:water-off',
        icon_color: 'orange',
        primary: labels.blocked,
        secondary: labels.areaName,
        layout: 'horizontal',
      },
    },
  ];
}
