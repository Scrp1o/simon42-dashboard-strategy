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
