// ====================================================================
// VIEW STRATEGY — LIGHTS (reactive group cards)
// ====================================================================

import type { HomeAssistant } from '../types/homeassistant';
import type { LovelaceViewConfig, LovelaceCardConfig, LovelaceSectionConfig } from '../types/lovelace';
import { getVisibleAreasFromHass } from '../utils/name-utils';
import { sectionSeparator } from '../utils/headings';
import { buildAdaptiveLightingTiles } from '../utils/adaptive-lighting';
import { localize } from '../utils/localize';

/**
 * Builds the optional Adaptive Lighting cards for the top of the Lights
 * view: per mapped+visible area, a Bubble separator followed by a 2-up grid
 * of native toggle tiles. Returns [] when disabled or when no mapping yields
 * any tile. These are prepended into the same section as the light groups so
 * they stack directly above the lights (not as a separate column).
 */
function buildAdaptiveLightingCards(
  dashboardConfig: any,
  hass: HomeAssistant
): LovelaceCardConfig[] {
  if (dashboardConfig.show_adaptive_lighting_in_lights !== true) return [];
  const mapping = dashboardConfig.adaptive_lighting || {};

  const visibleAreas = getVisibleAreasFromHass(
    hass,
    dashboardConfig.areas_display,
    dashboardConfig.use_default_area_sort
  );

  const cards: LovelaceCardConfig[] = [];
  for (const area of visibleAreas) {
    const entry = mapping[area.area_id];
    if (!entry) continue;
    const tiles = buildAdaptiveLightingTiles(entry, hass);
    if (tiles.length === 0) continue;
    cards.push(sectionSeparator(area.name, area.icon || 'mdi:theme-light-dark'));
    cards.push({ type: 'grid', columns: 2, square: false, cards: tiles });
  }

  return cards;
}

class Simon42ViewLightsStrategy extends HTMLElement {
  static async generate(config: any, hass: any): Promise<LovelaceViewConfig> {
    const dashboardConfig = config.dashboardConfig || config.config || {};
    const groupByFloors = dashboardConfig.group_lights_by_floors === true;
    const nestedGroups = dashboardConfig.nested_light_groups === true;

    // Lights are primary — their section comes first.
    const sections: LovelaceSectionConfig[] = [
      {
        type: 'grid',
        cards: [
          {
            type: 'custom:simon42-lights-group-card',
            entities: config.entities,
            config: config.config,
            group_type: 'on',
            group_by_floors: groupByFloors,
            nested_groups: nestedGroups,
          },
          {
            type: 'custom:simon42-lights-group-card',
            entities: config.entities,
            config: config.config,
            group_type: 'off',
            group_by_floors: groupByFloors,
            nested_groups: nestedGroups,
          },
        ],
      },
    ];

    // Adaptive Lighting as its own second section (renders beside the lights),
    // with an overall "Adaptive Lighting" heading.
    const alCards = buildAdaptiveLightingCards(dashboardConfig, hass);
    if (alCards.length > 0) {
      sections.push({
        type: 'grid',
        cards: [sectionSeparator(localize('views.adaptive_lighting'), 'mdi:theme-light-dark'), ...alCards],
      });
    }

    return { type: 'sections', sections };
  }
}

customElements.define('ll-strategy-simon42-view-lights', Simon42ViewLightsStrategy);
