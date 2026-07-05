// ====================================================================
// Section heading helper — Bubble Card separators
// ====================================================================
// Central factory for the strategy's section headings. Emits a
// custom:bubble-card separator so every generated view shares one
// consistent heading style. Optional sub-buttons carry batch actions
// (e.g. the lights/covers group "all off" buttons).
// ====================================================================

import type { LovelaceCardConfig } from '../types/lovelace';

/** A Bubble Card sub-button (icon + optional tap action). */
export interface BubbleSubButton {
  entity?: string;
  name?: string;
  icon?: string;
  show_background?: boolean;
  tap_action?: Record<string, any>;
  [key: string]: unknown;
}

/**
 * A section heading rendered as a Bubble Card separator.
 * @param name  heading label
 * @param icon  optional MDI icon
 * @param subButtons optional action buttons shown on the separator (main row)
 */
export function sectionSeparator(
  name: string,
  icon?: string,
  subButtons?: BubbleSubButton[]
): LovelaceCardConfig {
  return {
    type: 'custom:bubble-card',
    card_type: 'separator',
    name,
    ...(icon ? { icon } : {}),
    ...(subButtons && subButtons.length > 0 ? { sub_button: { main: subButtons, bottom: [] } } : {}),
  };
}
