// ====================================================================
// VIEW STRATEGY — PERSONS (auto-populated people + their devices)
// ====================================================================
// Iterates every `person.*` in hass and builds one section per person:
//   - a Bubble-Card header (picture + name + zone/home state)
//   - a map of all the person's device_trackers
//   - one condensed Bubble-Card per device_tracker showing location +
//     battery %, charging state and charger type as sub-buttons
//   - a sleep-confidence history graph when the companion app exposes one
// The mobile_app companion entities share the device_tracker's object_id
// (device_tracker.dominik_handy -> sensor.dominik_handy_battery_level, ...),
// so the related sensors are derived by slug and only included when present.
// ====================================================================

import type { HomeAssistant } from '../types/homeassistant';
import type { LovelaceViewConfig, LovelaceSectionConfig, LovelaceCardConfig } from '../types/lovelace';
import { Registry } from '../Registry';
import { localize } from '../utils/localize';

const DT_PREFIX = 'device_tracker.';

class Simon42ViewPersonsStrategy extends HTMLElement {
  static async generate(config: any, hass: HomeAssistant): Promise<LovelaceViewConfig> {
    // Idempotent — no-op if the dashboard strategy already initialized it.
    Registry.initialize(hass, config.config || {});

    // Optional person -> "asleep" binary_sensor mapping (existing config option);
    // shown as a sub-button on the sleep-probability separator when present.
    const sleepSensors: Record<string, string> =
      (config.config || {}).person_sleep_sensors || {};

    const personIds = Object.keys(hass.states)
      .filter((id) => id.startsWith('person.'))
      .sort((a, b) => {
        // Stable alphabetical order by person name (independent of home/away
        // state, so the order never reshuffles when someone leaves/arrives).
        const an = (hass.states[a].attributes?.friendly_name as string) || a;
        const bn = (hass.states[b].attributes?.friendly_name as string) || b;
        return an.localeCompare(bn);
      });

    const sections: LovelaceSectionConfig[] = [];

    for (const pid of personIds) {
      const person = hass.states[pid];
      const name = (person.attributes?.friendly_name as string) || pid;
      const trackers: string[] = (person.attributes?.device_trackers as string[]) || [];
      const cards: LovelaceCardConfig[] = [];

      // Header — person as a Bubble button (picture/name/zone)
      cards.push({
        type: 'custom:bubble-card',
        card_type: 'button',
        button_type: 'state',
        entity: pid,
        name,
        show_state: true,
        icon: 'mdi:account',
      });

      // Map of all of this person's trackers
      const mapTrackers = trackers.filter((t) => hass.states[t]);
      if (mapTrackers.length > 0) {
        cards.push({
          type: 'map',
          entities: mapTrackers.map((t) => ({ entity: t })),
          theme_mode: 'auto',
        });
      }

      // One condensed card per device
      for (const t of trackers) {
        if (!hass.states[t]) continue;
        const base = t.slice(DT_PREFIX.length);
        const devName = (hass.states[t].attributes?.friendly_name as string) || base;

        const subMain: Array<Record<string, unknown>> = [];
        const bl = `sensor.${base}_battery_level`;
        const bs = `sensor.${base}_battery_state`;
        const ct = `sensor.${base}_charger_type`;
        const na = `sensor.${base}_next_alarm`;
        if (hass.states[bl]) subMain.push({ entity: bl, show_state: true });
        if (hass.states[bs]) subMain.push({ entity: bs, show_state: true });
        if (hass.states[ct]) subMain.push({ entity: ct, show_state: true });

        cards.push({
          type: 'custom:bubble-card',
          card_type: 'button',
          button_type: 'state',
          entity: t,
          name: devName,
          icon: 'mdi:cellphone',
          show_state: true,
          sub_button: { main: subMain, bottom: [] },
        });

        // Companion-app "Next alarm" (timestamp sensor) on its own labeled row
        // below the phone — only when this phone has an alarm set. Keeps the
        // device row from getting cramped by the wide date/time value.
        if (hass.states[na]) {
          cards.push({
            type: 'custom:bubble-card',
            card_type: 'separator',
            name: localize('views.next_alarm'),
            icon: 'mdi:alarm',
            sub_button: { main: [{ entity: na, show_state: true }], bottom: [] },
          });
        }

        // Sleep-confidence graph (Sleep as Android via the companion app)
        const sc = `sensor.${base}_sleep_confidence`;
        if (hass.states[sc]) {
          const sleepSub: Array<Record<string, unknown>> = [];
          const asleep = sleepSensors[pid];
          if (asleep && hass.states[asleep]) {
            // Single sub-button: prefer the companion "asleep for" Template Helper
            // (sensor.<asleep object_id>_dauer) — its templated icon indicates sleep
            // state and its state shows the running duration ("2 h 10 min" / blank
            // when awake). Falls back to the plain asleep indicator icon if absent.
            const durSensor = `sensor.${asleep.split('.')[1]}_dauer`;
            if (hass.states[durSensor]) {
              sleepSub.push({ entity: durSensor, show_state: true, show_name: false });
            } else {
              sleepSub.push({ entity: asleep, show_state: false, show_name: false });
            }
          }
          cards.push({
            type: 'custom:bubble-card',
            card_type: 'separator',
            name: localize('views.sleep_probability'),
            icon: 'mdi:sleep',
            sub_button: { main: sleepSub, bottom: [] },
          });
          cards.push({
            type: 'history-graph',
            entities: [{ entity: sc, name }],
            hours_to_show: 24,
          });
        }
      }

      sections.push({ type: 'grid', cards });
    }

    return { type: 'sections', max_columns: 4, sections };
  }
}

customElements.define('ll-strategy-simon42-view-persons', Simon42ViewPersonsStrategy);
