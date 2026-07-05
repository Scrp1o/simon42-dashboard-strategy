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

/** A "clean this room" action button calling vacuum.clean_area for one area. */
export function buildCleanRoomButton(
  vacuumEntity: string,
  areaId: string,
  label: string
): LovelaceCardConfig {
  return {
    type: 'button',
    name: label,
    icon: 'mdi:robot-vacuum',
    tap_action: {
      action: 'perform-action',
      perform_action: 'vacuum.clean_area',
      target: { entity_id: vacuumEntity },
      data: { cleaning_area_id: areaId },
    },
    grid_options: { columns: 'full' },
  };
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
