// Mirrors the --series-1..8 custom properties in assets/css/tailwind.css. Chart.js
// draws to <canvas>, whose fillStyle can't resolve CSS custom properties, so the
// per-member hues are duplicated here for the canvas side; HTML swatches (legends,
// card accents) use the CSS vars directly via SERIES_CSS_VARS. These are the
// dark-surface values — the product defaults to dark, and they read acceptably on
// the light warm-paper surface too; the theme-dependent chart chrome (grid/tick/
// tooltip) is handled separately in composables/useChartTheme.ts.
export const SERIES_HEX = [
  '#3987e5', // blue
  '#199e70', // aqua
  '#c98500', // yellow
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
  '#d55181', // magenta
  '#d95926', // orange
] as const

export const SERIES_CSS_VARS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
  'var(--series-8)',
] as const

export interface MemberColor {
  hex: string
  css: string
}

// Colors are assigned by each member's position in a fixed, alphabetical order -
// never by how much they've used - so a member's color stays put regardless of
// this window's numbers (identity, not rank).
export function assignMemberColors(userNames: Iterable<string>): Map<string, MemberColor> {
  const sorted = [...new Set(userNames)].sort((a, b) => a.localeCompare(b))
  const map = new Map<string, MemberColor>()
  sorted.forEach((name, i) => {
    const idx = i % SERIES_HEX.length
    map.set(name, { hex: SERIES_HEX[idx]!, css: SERIES_CSS_VARS[idx]! })
  })
  return map
}

// GitHub's own dark-mode contribution-graph greens - level 0 is "no activity"
// (nearly the card's own surface color), 1-4 step up in both lightness and
// saturation for increasing activity.
export const HEAT_LEVELS = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'] as const

export function heatLevelColor(level: number): string {
  const idx = Math.max(0, Math.min(HEAT_LEVELS.length - 1, level))
  return HEAT_LEVELS[idx]!
}
