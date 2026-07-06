// ====================================================================
// Adaptive Lighting helpers — Bubble Card toggle buttons per area
// ====================================================================

import type { HomeAssistant } from '../types/homeassistant';
import type { LovelaceCardConfig } from '../types/lovelace';
import type { AdaptiveLightingMapping } from '../types/strategy';
import { localize } from './localize';

/**
 * Two Bubble Card toggle-buttons for one area's Adaptive Lighting:
 * the main AL switch and the sleep-mode switch. Only switches that
 * exist in hass.states are emitted; returns [] if neither exists.
 */
export function buildAdaptiveLightingButtons(
  entry: AdaptiveLightingMapping,
  hass: HomeAssistant
): LovelaceCardConfig[] {
  const cards: LovelaceCardConfig[] = [];

  if (entry.switch && hass.states[entry.switch]) {
    cards.push({
      type: 'custom:bubble-card',
      card_type: 'button',
      button_type: 'switch',
      entity: entry.switch,
      name: localize('adaptive_lighting.enable'),
      icon: 'mdi:theme-light-dark',
    });
  }

  if (entry.sleep && hass.states[entry.sleep]) {
    cards.push({
      type: 'custom:bubble-card',
      card_type: 'button',
      button_type: 'switch',
      entity: entry.sleep,
      name: localize('adaptive_lighting.sleep'),
      icon: 'mdi:weather-night',
    });
  }

  return cards;
}
