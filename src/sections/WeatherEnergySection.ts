// ====================================================================
// Weather & Energy Section Builders
// ====================================================================
// Independent section builders for weather forecast and energy
// distribution. Each returns a single section or null.
// ====================================================================

import type { LovelaceSectionConfig } from '../types/lovelace';
import { localize } from '../utils/localize';

/**
 * Creates the weather forecast section.
 * Returns null if weather is disabled or no entity available.
 */
export function createWeatherSection(
  weatherEntity: string | null,
  showWeather: boolean
): LovelaceSectionConfig | null {
  if (!weatherEntity || !showWeather) return null;

  return {
    type: 'grid',
    cards: [
      {
        type: 'heading',
        heading: localize('sections.weather'),
        heading_style: 'title',
        icon: 'mdi:weather-partly-cloudy',
      },
      {
        type: 'custom:weather-forecast-card',
        show_current: true,
        show_forecast: true,
        default_forecast: 'daily',
        tap_action: { action: 'more-info' },
        entity: weatherEntity,
        show_condition_effects: true,
        forecast: {
          mode: 'chart',
          show_sun_times: true,
          scroll_to_selected: false,
          use_color_thresholds: true,
          temperature_precision: 1,
        },
        forecast_action: { tap_action: { action: 'toggle-forecast' } },
        current: {
          show_attributes: [],
          secondary_info_attribute: 'humidity',
          temperature_precision: 1,
        },
      },
    ],
  };
}

/**
 * Creates the energy distribution section.
 * Returns null if energy is disabled.
 */
export function createEnergySection(
  showEnergy: boolean,
  linkDashboard: boolean = true
): LovelaceSectionConfig | null {
  if (!showEnergy) return null;

  return {
    type: 'grid',
    cards: [
      {
        type: 'heading',
        heading: localize('sections.energy'),
        heading_style: 'title',
        icon: 'mdi:lightning-bolt',
      },
      {
        type: 'energy-distribution',
        link_dashboard: linkDashboard,
      },
    ],
  };
}
