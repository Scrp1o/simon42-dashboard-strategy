// ====================================================================
// Badge Builder - Person Badges
// ====================================================================
// Ported from dist/utils/simon42-badge-builder.js with full TypeScript types.
// Creates entity badges for person presence (home / away).
// ====================================================================

import type { HomeAssistant } from '../types/homeassistant';
import type { LovelaceBadgeConfig } from '../types/lovelace';
import type { PersonData, Simon42StrategyConfig } from '../types/strategy';

/**
 * Creates Lovelace entity badges for a list of persons.
 *
 * - Home → green badge (default entity color)
 * - Away → accent/orange badge
 * - Hidden entities (registry hidden === true) are excluded
 * - Name is trimmed to first name only
 * - Optionally (show_sleep_state + person_sleep_sensors): swaps the front icon
 *   to mdi:sleep via two visibility-gated badges while the mapped sensor is on.
 */
export function createPersonBadges(
  persons: PersonData[],
  hass: HomeAssistant,
  config?: Simon42StrategyConfig
): LovelaceBadgeConfig[] {
  const badges: LovelaceBadgeConfig[] = [];
  const sleepEnabled = config?.show_sleep_state === true;
  const sleepMap = config?.person_sleep_sensors || {};

  for (const person of persons) {
    const state = hass.states[person.entity_id];
    if (!state) continue;

    // Registry check: skip if entity is hidden
    const registryEntry = hass.entities[person.entity_id];
    if (registryEntry?.hidden === true) continue;

    const firstName = person.name.split(' ')[0];

    const baseBadge: LovelaceBadgeConfig = {
      type: 'entity',
      entity: person.entity_id,
      name: firstName,
      show_entity_picture: true,
      show_state: true,
      state_content: 'state',
      show_name: true,
      show_icon: true,
      tap_action: { action: 'more-info' },
    } as LovelaceBadgeConfig;

    const sleepSensor = sleepMap[person.entity_id];
    if (sleepEnabled && sleepSensor && hass.states[sleepSensor]) {
      // Awake chip: normal, visible only while the sleep sensor is off.
      badges.push({
        ...baseBadge,
        visibility: [{ condition: 'state', entity: sleepSensor, state: 'off' }],
      } as LovelaceBadgeConfig);
      // Asleep chip: same entity (location preserved), front icon swapped to a sleep icon.
      badges.push({
        ...baseBadge,
        show_entity_picture: false,
        icon: 'mdi:sleep',
        visibility: [{ condition: 'state', entity: sleepSensor, state: 'on' }],
      } as LovelaceBadgeConfig);
    } else {
      badges.push(baseBadge);
    }
  }

  return badges;
}
