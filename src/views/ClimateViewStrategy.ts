// ====================================================================
// VIEW STRATEGY — CLIMATE (Climate/Thermostat Overview)
// ====================================================================

import type { HomeAssistant } from '../types/homeassistant';
import type { LovelaceViewConfig, LovelaceSectionConfig } from '../types/lovelace';
import { Registry } from '../Registry';
import { localize } from '../utils/localize';
import { sectionSeparator } from '../utils/headings';

class Simon42ViewClimateStrategy extends HTMLElement {
  static async generate(config: any, hass: HomeAssistant): Promise<LovelaceViewConfig> {
    // Ensure Registry is initialized (idempotent — no-op if already done)
    Registry.initialize(hass, config.config || {});

    const userConfig = config.config || {};

    const climateIds = Registry.getVisibleEntityIdsForDomain('climate').filter(
      (id) => hass.states[id] !== undefined
    );

    // Group by hvac_action or state
    const heating: string[] = [];
    const cooling: string[] = [];
    const idle: string[] = [];
    const off: string[] = [];

    for (const id of climateIds) {
      const state = hass.states[id];
      const hvacAction = state.attributes?.hvac_action as string | undefined;
      const hvacState = state.state;

      if (hvacState === 'off' || hvacState === 'unavailable' || hvacState === 'unknown') {
        off.push(id);
      } else if (hvacAction === 'heating' || (!hvacAction && hvacState === 'heat')) {
        heating.push(id);
      } else if (hvacAction === 'cooling' || (!hvacAction && hvacState === 'cool')) {
        cooling.push(id);
      } else {
        // idle, drying, fan, auto without action, etc.
        idle.push(id);
      }
    }

    const sections: LovelaceSectionConfig[] = [];

    // Personal-fork feature: prepend user-provided cards (from dashboard config)
    // above the generated climate tiles. Keeps entity IDs out of the source.
    const headerCards = Array.isArray(userConfig.climate_header_cards)
      ? userConfig.climate_header_cards
      : [];
    if (headerCards.length > 0) {
      sections.push({ type: 'grid', cards: headerCards });
    }

    const buildSection = (
      entities: string[],
      heading: string,
      icon: string
    ): void => {
      if (entities.length === 0) return;
      sections.push({
        type: 'grid',
        cards: [
          sectionSeparator(`${heading} (${entities.length})`, icon),
          ...entities.map((e) => ({
            type: 'tile',
            entity: e,
            vertical: false,
            features: [{ type: 'climate-hvac-modes' }],
            features_position: 'inline',
            state_content: ['hvac_action', 'current_temperature'],
          })),
        ],
      });
    };

    buildSection(heating, localize('climate.heating'), 'mdi:fire');
    buildSection(cooling, localize('climate.cooling'), 'mdi:snowflake');
    buildSection(idle, localize('climate.idle'), 'mdi:thermostat');
    buildSection(off, localize('climate.off'), 'mdi:power-off');

    return { type: 'sections', sections };
  }
}

customElements.define('ll-strategy-simon42-view-climate', Simon42ViewClimateStrategy);
