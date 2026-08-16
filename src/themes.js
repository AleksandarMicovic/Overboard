/**
 * Board themes.
 *
 * A theme is exactly what it looks like: two colors. Applying one writes two
 * CSS custom properties, so switching themes costs no re-render and no DOM
 * work — the checkerboard is painted by CSS from those two values.
 *
 * @typedef {{light: string, dark: string}} BoardTheme
 */

/** @type {Record<string, BoardTheme>} */
export const boardThemes = {
  brown: { light: '#f0d9b5', dark: '#b58863' },
  wood: { light: '#e8c99b', dark: '#a3703f' },
  blue: { light: '#dee3e6', dark: '#8ca2ad' },
  green: { light: '#eeeed2', dark: '#769656' },
  slate: { light: '#e8ebef', dark: '#7d8796' },
  ink: { light: '#c8ccd0', dark: '#33373b' },
  rose: { light: '#f7dde2', dark: '#c2708a' },
};

export const DEFAULT_BOARD_THEME = 'brown';

/**
 * Resolve a theme name or an inline `{light, dark}` pair to a theme.
 * Falls back to the default rather than throwing, so a typo degrades to a
 * usable board instead of a blank one.
 *
 * @param {string|BoardTheme} theme
 * @returns {BoardTheme}
 */
export function resolveBoardTheme(theme) {
  if (theme && typeof theme === 'object' && theme.light && theme.dark) {
    return { light: theme.light, dark: theme.dark };
  }
  return boardThemes[String(theme)] ?? boardThemes[DEFAULT_BOARD_THEME];
}

/**
 * Register a custom board theme by name.
 * @param {string} name
 * @param {BoardTheme} theme
 */
export function registerBoardTheme(name, theme) {
  if (!name || !theme?.light || !theme?.dark) {
    throw new Error('A board theme needs a name and both `light` and `dark` colors');
  }
  boardThemes[name] = { light: theme.light, dark: theme.dark };
}
