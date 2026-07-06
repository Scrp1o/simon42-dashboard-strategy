// ====================================================================
// Adaptive Lighting helpers — native toggle tiles per area
// ====================================================================

import type { HomeAssistant } from '../types/homeassistant';
import type { LovelaceCardConfig } from '../types/lovelace';
import type { AdaptiveLightingMapping } from '../types/strategy';
import { localize } from './localize';

/**
 * Two native tile cards for one area's Adaptive Lighting: the main AL
 * switch and the sleep-mode switch. Tiles toggle their switch on tap and
 * merely tint the icon when on (toned down, consistent radii — matches the
 * rest of the strategy). Only switches present in hass.states are emitted;
 * returns [] if neither exists.
 */
export function buildAdaptiveLightingTiles(
  entry: AdaptiveLightingMapping,
  hass: HomeAssistant
): LovelaceCardConfig[] {
  const cards: LovelaceCardConfig[] = [];

  if (entry.switch && hass.states[entry.switch]) {
    cards.push({
      type: 'tile',
      entity: entry.switch,
      name: localize('adaptive_lighting.enable'),
      icon: 'mdi:theme-light-dark',
      state_content: 'state',
    });
  }

  if (entry.sleep && hass.states[entry.sleep]) {
    cards.push({
      type: 'tile',
      entity: entry.sleep,
      name: localize('adaptive_lighting.sleep'),
      icon: 'mdi:weather-night',
      state_content: 'state',
    });
  }

  return cards;
}
