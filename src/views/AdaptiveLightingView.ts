// ====================================================================
// Adaptive Lighting — dedicated view builder (static sections config)
// ====================================================================

import type { HomeAssistant } from '../types/homeassistant';
import type { Simon42StrategyConfig } from '../types/strategy';
import type { LovelaceViewConfig, LovelaceCardConfig } from '../types/lovelace';
import { buildAdaptiveLightingButtons } from '../utils/adaptive-lighting';
import { localize } from '../utils/localize';

/**
 * Builds the dedicated "Adaptive Lighting" view: one Bubble separator per
 * mapped area followed by that area's two toggle-buttons. Returns null when
 * disabled or when no mapping produces any button.
 */
export function buildAdaptiveLightingView(
  config: Simon42StrategyConfig,
  hass: HomeAssistant,
  visibleAreas: { area_id: string; name: string; icon?: string | null }[]
): LovelaceViewConfig | null {
  if (config.show_adaptive_lighting_view !== true) return null;
  const mapping = config.adaptive_lighting || {};

  const cards: LovelaceCardConfig[] = [];
  for (const area of visibleAreas) {
    const entry = mapping[area.area_id];
    if (!entry) continue;
    const buttons = buildAdaptiveLightingButtons(entry, hass);
    if (buttons.length === 0) continue;
    cards.push({
      type: 'custom:bubble-card',
      card_type: 'separator',
      name: area.name,
      icon: area.icon || 'mdi:theme-light-dark',
      sub_button: { main: [], bottom: [] },
    });
    cards.push(...buttons);
  }

  if (cards.length === 0) return null;

  return {
    title: localize('views.adaptive_lighting'),
    path: 'adaptive-lighting',
    icon: 'mdi:theme-light-dark',
    type: 'sections',
    max_columns: 2,
    sections: [{ type: 'grid', cards }],
  };
}
