# Vacuum Room Cleaning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add robot-vacuum room cleaning to the simon42 strategy — a per-room "Clean this room" button (`vacuum.clean_area` with the room's HA area_id), an optional overview vacuum card for native multi-area cleaning, and an optional user-provided cleaning-mode entity.

**Architecture:** Four new config options drive three render sites. A small `utils/vacuum.ts` holds the shared card-builders and the `clean_area` capability check. `RoomViewStrategy` gains a gated "Vacuum" section; `OverviewSection` gains a gated vacuum card; `StrategyEditor` gains a "Vacuum" config group. HA area == vacuum room mapping (no per-room config).

**Tech Stack:** TypeScript (ES2020, strict), Lit (editor only), Webpack (via `node build.local.mjs`). No new dependencies.

## Global Constraints

- TypeScript strict mode; ES2020. No new npm dependencies.
- Config keys are snake_case; boolean toggles follow the `show_*` convention. `show_vacuum_card` default `false`.
- Use `entity_id`, never `device_id`, in generated Lovelace config.
- `vacuum.clean_area` requires vacuum `supported_features` bit **16384** (`0x4000`). Verify with a bitmask check; never fire the service during development (it physically starts cleaning).
- The `clean_area` call shape is exactly:
  `{ action: 'perform-action', perform_action: 'vacuum.clean_area', target: { entity_id: <vacuum> }, data: { cleaning_area_id: <area_id> } }`.
- **No unit-test framework exists in this repo.** Per-task verification = (1) `node build.local.mjs` succeeds (TypeScript typecheck + bundle), (2) `npm run lint` clean, (3) live render check after `./deploy.local.sh` + hard-refresh, using Chrome DevTools MCP (navigate + screenshot) and/or HA MCP.
- Build with `node build.local.mjs` (NOT `npm run build` — webpack-cli fails on this repo's ESM TS config locally).
- Commit **source only** per task on branch `feature/vacuum-room-cleaning`. Do NOT commit `dist/` during development (`git checkout -- dist/` after building to test). `dist/` + version bump happen once at release, after Dominik approves.
- i18n: every user-facing string added to BOTH `src/translations/en.json` and `src/translations/de.json`.
- Editor (`StrategyEditor.ts`) is a documented regression hotspot — mirror existing patterns exactly, change nothing unrelated.

---

### Task 1: Config type additions

**Files:**
- Modify: `src/types/strategy.ts` (interface `Simon42StrategyConfig`, after the `custom_badges?` field near line 81)

**Interfaces:**
- Produces: four optional config fields on `Simon42StrategyConfig`: `vacuum_entity?: string`, `vacuum_mode_entity?: string`, `vacuum_hidden_areas?: string[]`, `show_vacuum_card?: boolean`.

- [ ] **Step 1: Add the fields**

In `src/types/strategy.ts`, inside `Simon42StrategyConfig`, immediately after the `custom_badges?: CustomBadge[];` line, add:

```typescript
  // Vacuum room cleaning
  vacuum_entity?: string; // vacuum entity_id supporting clean_area (feature 16384)
  vacuum_mode_entity?: string; // optional entity (select/input_select) for cleaning mode
  vacuum_hidden_areas?: string[]; // area_ids excluded from the per-room clean button
  show_vacuum_card?: boolean; // default: false — show vacuum card on overview
```

- [ ] **Step 2: Build to verify types compile**

Run: `node build.local.mjs`
Expected: build completes with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git checkout -- dist/
git add src/types/strategy.ts
git commit -m "feat(vacuum): add config types for room cleaning"
```

---

### Task 2: Shared vacuum helpers (`utils/vacuum.ts`)

**Files:**
- Create: `src/utils/vacuum.ts`

**Interfaces:**
- Consumes: `HomeAssistant` from `../types/homeassistant`, `LovelaceCardConfig` from `../types/lovelace`.
- Produces:
  - `VACUUM_SUPPORT_CLEAN_AREA = 16384`
  - `vacuumSupportsCleanArea(stateObj: { attributes?: Record<string, any> } | undefined): boolean`
  - `buildCleanRoomButton(vacuumEntity: string, areaId: string, label: string): LovelaceCardConfig`
  - `buildVacuumModeTile(entityId: string, hass: HomeAssistant): LovelaceCardConfig | null`

- [ ] **Step 1: Create the file**

Create `src/utils/vacuum.ts`:

```typescript
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
```

- [ ] **Step 2: Build to verify it compiles**

Run: `node build.local.mjs`
Expected: build completes, no errors. (If `LovelaceCardConfig` does not allow the `features`/`grid_options` keys, they are index-signature-permitted in `types/lovelace.ts`; confirm no TS error. If an error appears, cast the returned object `as LovelaceCardConfig`.)

- [ ] **Step 3: Commit**

```bash
git checkout -- dist/
git add src/utils/vacuum.ts
git commit -m "feat(vacuum): shared clean_area helpers and card builders"
```

---

### Task 3: Per-room "Clean this room" button

**Files:**
- Modify: `src/views/RoomViewStrategy.ts` (imports at top; new section inserted after the `scripts` domain section, before the "Room Pins" block near line 602)

**Interfaces:**
- Consumes: `buildCleanRoomButton`, `buildVacuumModeTile` from `../utils/vacuum`; `localize` (already imported); `dashboardConfig` (already available as `config.dashboardConfig`); `area` (already available).

- [ ] **Step 1: Add the import**

At the top of `src/views/RoomViewStrategy.ts`, after the existing `import { localize } from '../utils/localize';` line, add:

```typescript
import { buildCleanRoomButton, buildVacuumModeTile } from '../utils/vacuum';
```

- [ ] **Step 2: Insert the Vacuum section**

In `RoomViewStrategy.ts`, find the "Room Pins" block that begins with `// Room Pins` (near line 602). Immediately BEFORE that comment, insert:

```typescript
    // Vacuum: "Clean this room" button (+ optional mode selector)
    const vacuumEntity = dashboardConfig.vacuum_entity as string | undefined;
    const vacuumHiddenAreas: string[] = dashboardConfig.vacuum_hidden_areas || [];
    if (
      vacuumEntity &&
      hass.states[vacuumEntity] &&
      !vacuumHiddenAreas.includes(area.area_id)
    ) {
      const vacuumCards: LovelaceCardConfig[] = [
        { type: 'heading', heading: localize('room.vacuum'), heading_style: 'title', icon: 'mdi:robot-vacuum' },
      ];
      const modeEntity = dashboardConfig.vacuum_mode_entity as string | undefined;
      if (modeEntity) {
        const modeTile = buildVacuumModeTile(modeEntity, hass);
        if (modeTile) vacuumCards.push(modeTile);
      }
      vacuumCards.push(buildCleanRoomButton(vacuumEntity, area.area_id, localize('room.vacuum_clean_here')));
      sections.push({ type: 'grid', cards: vacuumCards });
    }

```

- [ ] **Step 3: Build**

Run: `node build.local.mjs`
Expected: build completes, no TypeScript errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Live verify (temporary config)**

Set a temporary config via HA MCP so the room views render the button (uses the real Matter vacuum):

```
ha_config_set_dashboard(url_path="dashboard-home42", python_transform=
  "config['strategy']['vacuum_entity'] = 'vacuum.floor_cleaning_robot_s10'",
  config_hash=<fresh hash from ha_config_get_dashboard>)
```

Then deploy and check: `./deploy.local.sh`, hard-refresh, and with Chrome DevTools MCP navigate to a room view (e.g. `/dashboard-home42/buro`) and screenshot. Expected: a "Vacuum" heading with a "Clean this room" button. Do NOT click it (would start cleaning). Confirm `show_room_views` is on, or open a room via an area card.

- [ ] **Step 6: Commit**

```bash
git checkout -- dist/
git add src/views/RoomViewStrategy.ts
git commit -m "feat(vacuum): per-room clean_area button in room views"
```

---

### Task 4: Overview vacuum card

**Files:**
- Modify: `src/sections/OverviewSection.ts` (import at top; new block inside `createOverviewSection`, immediately before the `if (cards.length === 0)` guard near line 197)

**Interfaces:**
- Consumes: `buildVacuumModeTile` from `../utils/vacuum`; `config` and `hass` already in scope inside `createOverviewSection`.

- [ ] **Step 1: Add the import**

At the top of `src/sections/OverviewSection.ts`, after `import { localize } from '../utils/localize';`, add:

```typescript
import { buildVacuumModeTile } from '../utils/vacuum';
```

- [ ] **Step 2: Add the vacuum card block**

In `createOverviewSection`, find the comment `// If nothing is visible, skip the entire section` (near line 196). Immediately BEFORE that comment, insert:

```typescript
  // Vacuum card (overview) — native multi-area cleaning via more-info
  const vacuumEntity = config.vacuum_entity;
  if (config.show_vacuum_card === true && vacuumEntity && hass.states[vacuumEntity]) {
    cards.push({ type: 'heading', heading: localize('room.vacuum'), icon: 'mdi:robot-vacuum' });
    cards.push({
      type: 'tile',
      entity: vacuumEntity,
      vertical: false,
      features: [{ type: 'vacuum-commands' }],
      features_position: 'inline',
    });
    if (config.vacuum_mode_entity) {
      const modeTile = buildVacuumModeTile(config.vacuum_mode_entity, hass);
      if (modeTile) cards.push(modeTile);
    }
  }

```

- [ ] **Step 3: Build**

Run: `node build.local.mjs`
Expected: build completes, no errors.

- [ ] **Step 4: Live verify**

Via HA MCP set `config['strategy']['show_vacuum_card'] = True` (and keep `vacuum_entity` from Task 3). Deploy, hard-refresh, and with Chrome DevTools MCP screenshot the home view. Expected: a "Vacuum" heading + vacuum tile with command buttons at the bottom of the Overview section. Tapping the tile opens more-info with the area-multiselect clean UI (confirm this is the intended "native multi-area select" surface; if HA shows a richer dedicated card, note it for a follow-up).

- [ ] **Step 5: Commit**

```bash
git checkout -- dist/
git add src/sections/OverviewSection.ts
git commit -m "feat(vacuum): optional vacuum card on overview"
```

---

### Task 5: Editor "Vacuum" config group

**Files:**
- Modify: `src/editor/StrategyEditor.ts` (import; render assembly at line 1019; new `_renderVacuumSection()` method; getters `_getVacuumEntities`/`_getVacuumModeEntities`; handlers `_vacuumEntityChanged`/`_vacuumModeEntityChanged`/`_toggleVacuumHiddenArea`)

**Interfaces:**
- Consumes: existing helpers `_renderCheckbox(id,label,checked,onChange,disabled?)`, `_toggleChanged(key,checked,defaultValue)`, `_fireConfigChanged(config)`, `this._config`, `this._hass`; `vacuumSupportsCleanArea` from `../utils/vacuum`.

- [ ] **Step 1: Add the import**

Near the other imports at the top of `src/editor/StrategyEditor.ts`, add:

```typescript
import { vacuumSupportsCleanArea } from '../utils/vacuum';
```

- [ ] **Step 2: Wire the section into render()**

In the `render()` method (near line 1019), immediately after `${this._renderViewsSection()}`, add:

```typescript
        ${this._renderVacuumSection()}
```

- [ ] **Step 3: Add the render method + getters + handlers**

Add these methods to the class (place `_renderVacuumSection` next to the other `_renderXxxSection` methods, e.g. after `_renderViewsSection`; place getters near `_getAlarmEntities`; place handlers near `_alarmEntityChanged`):

```typescript
  private _getVacuumEntities(): { entity_id: string; name: string }[] {
    if (!this._hass) return [];
    const hass = this._hass;
    return Object.keys(hass.states)
      .filter((id) => id.startsWith('vacuum.') && vacuumSupportsCleanArea(hass.states[id]))
      .map((id) => ({
        entity_id: id,
        name: hass.states[id].attributes?.friendly_name || id.split('.')[1].replace(/_/g, ' '),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private _getVacuumModeEntities(): { entity_id: string; name: string }[] {
    if (!this._hass) return [];
    const hass = this._hass;
    return Object.keys(hass.states)
      .filter((id) => id.startsWith('select.') || id.startsWith('input_select.'))
      .map((id) => ({
        entity_id: id,
        name: hass.states[id].attributes?.friendly_name || id.split('.')[1].replace(/_/g, ' '),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private _renderVacuumSection(): TemplateResult {
    const vacuumEntity = this._config.vacuum_entity || '';
    const vacuumModeEntity = this._config.vacuum_mode_entity || '';
    const showVacuumCard = this._config.show_vacuum_card === true;
    const hiddenAreas: string[] = this._config.vacuum_hidden_areas || [];
    const vacuums = this._getVacuumEntities();
    const modeEntities = this._getVacuumModeEntities();
    const areas = this._hass ? Object.values(this._hass.areas) : [];

    return html`
      <div class="section">
        <div class="section-title">${localize('editor.section_vacuum')}</div>

        <div class="form-row">
          <label for="vacuum-entity" style="margin-right: 8px; min-width: 120px;">${localize('editor.vacuum_entity')}</label>
          <select id="vacuum-entity" style="flex: 1;" @change=${this._vacuumEntityChanged}>
            <option value="" ?selected=${!vacuumEntity}>${localize('editor.vacuum_none')}</option>
            ${vacuums.map((v) => html`
              <option value=${v.entity_id} ?selected=${v.entity_id === vacuumEntity}>${v.name}</option>
            `)}
          </select>
        </div>
        <div class="description">${localize('editor.vacuum_entity_desc')}</div>

        <div class="form-row">
          <label for="vacuum-mode-entity" style="margin-right: 8px; min-width: 120px;">${localize('editor.vacuum_mode_entity')}</label>
          <select id="vacuum-mode-entity" style="flex: 1;" @change=${this._vacuumModeEntityChanged}>
            <option value="" ?selected=${!vacuumModeEntity}>${localize('editor.vacuum_none')}</option>
            ${modeEntities.map((v) => html`
              <option value=${v.entity_id} ?selected=${v.entity_id === vacuumModeEntity}>${v.name}</option>
            `)}
          </select>
        </div>
        <div class="description">${localize('editor.vacuum_mode_entity_desc')}</div>

        ${this._renderCheckbox('show-vacuum-card', localize('editor.show_vacuum_card'), showVacuumCard,
          (checked) => this._toggleChanged('show_vacuum_card', checked, false))}
        <div class="description">${localize('editor.show_vacuum_card_desc')}</div>

        <div style="font-size: 13px; font-weight: 500; margin-top: 12px; margin-bottom: 4px;">
          ${localize('editor.vacuum_hidden_areas')}
        </div>
        <div class="description">${localize('editor.vacuum_hidden_areas_desc')}</div>
        ${areas.map((a) => this._renderCheckbox(
          `vacuum-hide-${a.area_id}`,
          a.name,
          hiddenAreas.includes(a.area_id),
          (checked) => this._toggleVacuumHiddenArea(a.area_id, checked)))}
      </div>
    `;
  }

  private _vacuumEntityChanged(e: Event): void {
    if (!this._hass) return;
    const entityId = (e.target as HTMLSelectElement).value;
    const newConfig: Simon42StrategyConfig = { ...this._config, vacuum_entity: entityId };
    if (!entityId) delete newConfig.vacuum_entity;
    this._config = newConfig;
    this._fireConfigChanged(newConfig);
  }

  private _vacuumModeEntityChanged(e: Event): void {
    if (!this._hass) return;
    const entityId = (e.target as HTMLSelectElement).value;
    const newConfig: Simon42StrategyConfig = { ...this._config, vacuum_mode_entity: entityId };
    if (!entityId) delete newConfig.vacuum_mode_entity;
    this._config = newConfig;
    this._fireConfigChanged(newConfig);
  }

  private _toggleVacuumHiddenArea(areaId: string, hidden: boolean): void {
    const current: string[] = this._config.vacuum_hidden_areas || [];
    const next = hidden ? [...new Set([...current, areaId])] : current.filter((id) => id !== areaId);
    const newConfig: Simon42StrategyConfig = { ...this._config, vacuum_hidden_areas: next.length > 0 ? next : undefined };
    if (next.length === 0) delete newConfig.vacuum_hidden_areas;
    this._config = newConfig;
    this._fireConfigChanged(newConfig);
  }
```

- [ ] **Step 4: Build**

Run: `node build.local.mjs`
Expected: build completes, no TypeScript errors. (`this._hass.areas` is `Record<string, AreaRegistryEntry>`; `Object.values` yields entries with `area_id` and `name`. If `name` is possibly null in the type, use `a.name || a.area_id`.)

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Live verify the editor**

Deploy (`./deploy.local.sh`), hard-refresh. Open the dashboard's strategy editor (Edit dashboard → the strategy config UI). Expected: a "Vacuum" section with a vacuum entity dropdown (only `vacuum.floor_cleaning_robot_s10` listed, not the BT one), a mode-entity dropdown, a "show vacuum card" checkbox, and a per-area hide checklist. Toggling them updates the YAML config (check via the raw config editor or HA MCP `ha_config_get_dashboard`). Structural change → a full page reload may be needed for the editor chunk.

- [ ] **Step 7: Commit**

```bash
git checkout -- dist/
git add src/editor/StrategyEditor.ts
git commit -m "feat(vacuum): editor config group (entity, mode, card, hidden areas)"
```

---

### Task 6: Translations (EN + DE)

**Files:**
- Modify: `src/translations/en.json`
- Modify: `src/translations/de.json`

**Interfaces:**
- Consumes: nothing. Produces localization keys referenced by Tasks 3–5: `room.vacuum`, `room.vacuum_clean_here`, and `editor.section_vacuum`, `editor.vacuum_entity`, `editor.vacuum_entity_desc`, `editor.vacuum_none`, `editor.vacuum_mode_entity`, `editor.vacuum_mode_entity_desc`, `editor.show_vacuum_card`, `editor.show_vacuum_card_desc`, `editor.vacuum_hidden_areas`, `editor.vacuum_hidden_areas_desc`.

- [ ] **Step 1: Add EN keys**

In `src/translations/en.json`, add to the `"room"` object:

```json
    "vacuum": "Vacuum",
    "vacuum_clean_here": "Clean this room"
```

and to the `"editor"` object:

```json
    "section_vacuum": "Vacuum",
    "vacuum_entity": "Vacuum",
    "vacuum_entity_desc": "Robot vacuum used for room cleaning. Only vacuums that support cleaning by area are listed.",
    "vacuum_none": "None",
    "vacuum_mode_entity": "Cleaning mode",
    "vacuum_mode_entity_desc": "Optional entity (select) to choose the cleaning mode, shown next to the vacuum controls.",
    "show_vacuum_card": "Show vacuum card on overview",
    "show_vacuum_card_desc": "Adds a vacuum card to the home view for native multi-area cleaning.",
    "vacuum_hidden_areas": "Hide clean button in these rooms",
    "vacuum_hidden_areas_desc": "Rooms where the \"Clean this room\" button should not appear (e.g. rooms the vacuum cannot reach)."
```

(Insert with correct commas so the JSON stays valid — add a trailing comma to the previous last key in each object.)

- [ ] **Step 2: Add DE keys**

In `src/translations/de.json`, add to the `"room"` object:

```json
    "vacuum": "Staubsauger",
    "vacuum_clean_here": "Diesen Raum saugen"
```

and to the `"editor"` object:

```json
    "section_vacuum": "Staubsauger",
    "vacuum_entity": "Staubsauger",
    "vacuum_entity_desc": "Saugroboter für die Raumreinigung. Es werden nur Sauger aufgelistet, die das Reinigen nach Bereich unterstützen.",
    "vacuum_none": "Keiner",
    "vacuum_mode_entity": "Reinigungsmodus",
    "vacuum_mode_entity_desc": "Optionale Entität (Auswahl), um den Reinigungsmodus zu wählen; wird neben den Staubsauger-Steuerungen angezeigt.",
    "show_vacuum_card": "Staubsauger-Karte in der Übersicht anzeigen",
    "show_vacuum_card_desc": "Fügt der Startseite eine Staubsauger-Karte für die native Mehrbereichs-Reinigung hinzu.",
    "vacuum_hidden_areas": "Reinigen-Button in diesen Räumen ausblenden",
    "vacuum_hidden_areas_desc": "Räume, in denen der \"Diesen Raum saugen\"-Button nicht erscheinen soll (z. B. für den Sauger unerreichbare Räume)."
```

- [ ] **Step 3: Validate JSON + build**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/translations/en.json','utf8')); JSON.parse(require('fs').readFileSync('src/translations/de.json','utf8')); console.log('JSON OK')"`
Expected: `JSON OK`.
Run: `node build.local.mjs`
Expected: build completes.

- [ ] **Step 4: Commit**

```bash
git checkout -- dist/
git add src/translations/en.json src/translations/de.json
git commit -m "feat(vacuum): EN/DE translations for room cleaning"
```

---

### Task 7: End-to-end live verification

**Files:** none (verification + cleanup of temporary config).

- [ ] **Step 1: Full build + lint + deploy**

Run: `node build.local.mjs && npm run lint && ./deploy.local.sh`
Expected: build + lint clean, deploy succeeds. Hard-refresh the dashboard.

- [ ] **Step 2: Verify all three surfaces**

Using the real config (`vacuum_entity: vacuum.floor_cleaning_robot_s10`, `show_vacuum_card: true`, and add `vacuum_mode_entity: select.floor_cleaning_robot_s10_clean_mode` and one entry in `vacuum_hidden_areas`):
- Room views: "Clean this room" button present in each non-hidden room; absent in the hidden room. Mode dropdown present above the button.
- Overview: vacuum card at bottom of Overview section; mode tile beside it.
- Editor: Vacuum group renders and round-trips config.

Confirm via Chrome DevTools MCP screenshots. Do NOT click "Clean this room" (starts the robot). Optionally verify the button's generated `tap_action` via Chrome DevTools `evaluate_script` against the card config rather than clicking.

- [ ] **Step 3: Remove temporary test config (if it should not persist)**

If Dominik does not want the config applied yet, revert the `dashboard-home42` strategy config changes made during testing via HA MCP. Otherwise leave his chosen config in place.

- [ ] **Step 4: Restore dist and confirm clean tree**

Run: `git checkout -- dist/ && git status --short`
Expected: only intended source commits on the branch; working tree clean.

- [ ] **Step 5: Hand off for release**

Do NOT bump version or commit `dist/` yet. Report completion; Dominik decides on the minor version bump + release (per fork release checklist: `package.json` version, `STRATEGY_VERSION`, git tag, and committing `dist/`).

---

## Self-Review

**Spec coverage:**
- Config options (spec §"Config options") → Task 1. ✓
- Per-room clean button (spec §Component 1) → Task 3 (+ helper in Task 2). ✓
- Overview vacuum card (spec §Component 2) → Task 4. ✓
- Mode selector (spec §Component 3) → helper in Task 2, used in Tasks 3 & 4. ✓
- Editor (spec §Component 4) → Task 5. ✓
- i18n (spec §Component 5) → Task 6. ✓
- Feature gating / edge cases (missing entity, hidden areas) → guards in Tasks 3–4 (`hass.states[...]` checks, `vacuum_hidden_areas.includes`). ✓
- Delivery (build/deploy/test, source-only commits, release deferred) → Global Constraints + Task 7. ✓

**Type consistency:** `buildCleanRoomButton(vacuumEntity, areaId, label)`, `buildVacuumModeTile(entityId, hass)`, `vacuumSupportsCleanArea(stateObj)`, and `VACUUM_SUPPORT_CLEAN_AREA` are defined in Task 2 and consumed with identical signatures in Tasks 3–5. Config keys `vacuum_entity` / `vacuum_mode_entity` / `vacuum_hidden_areas` / `show_vacuum_card` are identical across Tasks 1, 3, 4, 5. ✓

**Placeholders:** none — every step has concrete code/commands. Build-time fallbacks (e.g. `as LovelaceCardConfig`, `a.name || a.area_id`) are noted where a type detail can't be confirmed without running the compiler.
