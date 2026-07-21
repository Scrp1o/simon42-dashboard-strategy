// ====================================================================
// Vacuum helpers — clean_area capability + shared card builders
// ====================================================================

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
