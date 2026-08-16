/**
 * Piece themes.
 *
 * Both sets are original work for this project, which keeps Overboard free of
 * third-party asset licensing. Register your own with
 * `Overboard.registerPieceTheme(name, map)` — a map is just twelve strings of
 * SVG markup keyed `wK`, `bQ`, and so on.
 *
 * Shapes are written once and colored per side rather than authored twice, so
 * each theme is six definitions instead of twelve files.
 *
 * @typedef {{fill: string, stroke: string, accent: string}} Palette
 * @typedef {Record<string, string>} PieceSet
 */

const VIEW_BOX = '0 0 45 45';

/** @param {string} body */
const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" aria-hidden="true">${body}</svg>`;

/* -------------------------------------------------------------------------
 * Classic — Staunton-derived silhouettes with an outline.
 * ---------------------------------------------------------------------- */

/** Shared footing: every classic piece stands on the same collar and base. */
const foot = `
  <rect x="14.4" y="29.8" width="16.2" height="3.6" rx="1.8"/>
  <rect x="11.2" y="34" width="22.6" height="5" rx="2.5"/>`;

/** @type {Record<string, (c: Palette) => string>} */
const CLASSIC = {
  P: () => `
    <circle cx="22.5" cy="12.8" r="4.9"/>
    <path d="M16.8 30.6c0-5.6 2.9-8.2 3.9-13.4h3.6c1 5.2 3.9 7.8 3.9 13.4z"/>
    ${foot}`,

  R: () => `
    <path d="M11.25 9h4.2v3.4h1.9V9h4.2v3.4h1.9V9h4.2v3.4h1.9V9h4.2v9.8H11.25z"/>
    <path d="M14.2 18.8h16.6l-1.5 11.6H15.7z"/>
    ${foot}`,

  N: (c) => `
    <path d="M25.4 7.4c2 1.4 3.2 3.2 4 5.4 2.4 4.2 3.6 9.2 3.8 18.2H15.4c0-3.2 1.2-5.8 3.2-7.6-1.6 1-3.6 2.2-5.2 2.4-2 .2-2.8-1.8-1.8-3.6 1.2-2.2 3-4 5.2-5.6 2.6-2 4.4-4 5.4-6.6l1.4 2.4z"/>
    <circle cx="19.5" cy="18.3" r="1.2" fill="${c.accent}" stroke="none"/>
    <path d="M27.6 13.4c1.8 3.6 2.6 8.4 2.8 15.2" fill="none" stroke="${c.accent}" stroke-width="1.1" opacity=".55"/>
    ${foot}`,

  B: (c) => `
    <circle cx="22.5" cy="8.2" r="2.4"/>
    <path d="M22.5 11c5.1 4.6 7.5 9.4 7.5 13.4 0 4-3.4 6.4-7.5 6.4S15 28.4 15 24.4c0-4 2.4-8.8 7.5-13.4z"/>
    <path d="M22.5 15.4l4 5.2M16.6 26.2h11.8" fill="none" stroke="${c.accent}" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>
    ${foot}`,

  Q: () => `
    <circle cx="11" cy="12.4" r="2.2"/>
    <circle cx="17" cy="9.4" r="2.2"/>
    <circle cx="22.5" cy="8.4" r="2.4"/>
    <circle cx="28" cy="9.4" r="2.2"/>
    <circle cx="34" cy="12.4" r="2.2"/>
    <path d="M11 13.8l4.6 16h13.8l4.6-16-5.6 7-6-9.8-6 9.8z"/>
    ${foot}`,

  K: (c) => `
    <path d="M21.1 4.6h2.8V8h3.4v2.8h-3.4v3.8h-2.8v-3.8h-3.4V8h3.4z"/>
    <path d="M22.5 16c3.5-3.2 9.4-2 10.2 3 .8 4.8-2.7 8.8-10.2 13.2C15 27.8 11.5 23.8 12.3 19c.8-5 6.7-6.2 10.2-3z"/>
    <path d="M22.5 17.6v13M17 22.6h11" fill="none" stroke="${c.accent}" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>
    ${foot}`,
};

/* -------------------------------------------------------------------------
 * Flat — geometric, no outline, reads cleanly at small sizes.
 * ---------------------------------------------------------------------- */

const flatFoot = `<rect x="11" y="33.4" width="23" height="5.2" rx="2.6"/>`;

/** @type {Record<string, (c: Palette) => string>} */
const FLAT = {
  P: () => `
    <circle cx="22.5" cy="13.4" r="5.2"/>
    <path d="M15.9 33.4c0-6.6 3.4-9.6 6.6-14.8 3.2 5.2 6.6 8.2 6.6 14.8z"/>
    ${flatFoot}`,

  R: () => `
    <path d="M12 8.6h5.2v3.6h2.7V8.6h5.2v3.6h2.7V8.6H33v11H12z"/>
    <path d="M14 19.6h17l-1.5 13.8H15.5z"/>
    ${flatFoot}`,

  N: (c) => `
    <path d="M26 7c2.4 1.8 4 4.4 4.8 7.6 1.4 5 1.8 10.6 1.8 17.8H15.2c0-3.6 1.4-6.4 3.8-8.4l-5 2.6c-2 1-3.4-1-2.2-3 1.6-2.8 3.8-5 6.6-6.8 2.8-1.8 4.8-4 5.8-7z"/>
    <circle cx="20.4" cy="17.6" r="1.5" fill="${c.accent}" stroke="none"/>
    ${flatFoot}`,

  B: () => `
    <circle cx="22.5" cy="6.6" r="2.7"/>
    <path d="M22.5 11.4c5.2 5 7.8 9.8 7.8 13.8 0 4.4-3.5 7-7.8 7s-7.8-2.6-7.8-7c0-4 2.6-8.8 7.8-13.8z"/>
    ${flatFoot}`,

  Q: () => `
    <circle cx="10.6" cy="12" r="2.6"/>
    <circle cx="16.6" cy="8.6" r="2.6"/>
    <circle cx="22.5" cy="7.4" r="2.8"/>
    <circle cx="28.4" cy="8.6" r="2.6"/>
    <circle cx="34.4" cy="12" r="2.6"/>
    <path d="M10.6 13.6l5 18.8h13.8l5-18.8-6 8-6-10.4-6 10.4z"/>
    ${flatFoot}`,

  K: () => `
    <path d="M20.7 3.8h3.6v3.8h3.8v3.6h-3.8v6.6h-3.6v-6.6h-3.8V7.6h3.8z"/>
    <path d="M14.6 33.4c-.4-8.8 1.8-16.6 7.9-16.6s8.3 7.8 7.9 16.6z"/>
    ${flatFoot}`,
};

/** @type {Record<string, {shapes: Record<string, (c: Palette) => string>, outline: boolean, palettes: {w: Palette, b: Palette}}>} */
const DEFINITIONS = {
  classic: {
    shapes: CLASSIC,
    outline: true,
    palettes: {
      w: { fill: '#f7f6f3', stroke: '#25221e', accent: '#25221e' },
      b: { fill: '#2b2825', stroke: '#100e0c', accent: '#efece6' },
    },
  },
  flat: {
    shapes: FLAT,
    outline: false,
    palettes: {
      w: { fill: '#fbfbfa', stroke: 'none', accent: '#33302c' },
      b: { fill: '#33302c', stroke: 'none', accent: '#fbfbfa' },
    },
  },
};

/**
 * Expand a definition into the twelve-key map the renderer consumes.
 * @param {typeof DEFINITIONS[string]} definition
 * @returns {PieceSet}
 */
function buildSet({ shapes, outline, palettes }) {
  /** @type {PieceSet} */
  const set = {};
  for (const color of /** @type {const} */ (['w', 'b'])) {
    const palette = palettes[color];
    const strokeAttrs = outline
      ? ` stroke="${palette.stroke}" stroke-width="1.5" stroke-linejoin="round"`
      : '';
    for (const [type, shape] of Object.entries(shapes)) {
      set[color + type] = svg(
        `<g fill="${palette.fill}"${strokeAttrs}>${shape(palette)}</g>`,
      );
    }
  }
  return set;
}

/** @type {Record<string, PieceSet>} */
export const pieceThemes = Object.fromEntries(
  Object.entries(DEFINITIONS).map(([name, definition]) => [name, buildSet(definition)]),
);

export const DEFAULT_PIECE_THEME = 'classic';

export const PIECE_CODES = [
  'wK', 'wQ', 'wR', 'wB', 'wN', 'wP',
  'bK', 'bQ', 'bR', 'bB', 'bN', 'bP',
];

/**
 * Resolve a theme name to a piece set, falling back to the default so a typo
 * degrades to a visible board rather than an empty one.
 * @param {string|PieceSet} theme
 * @returns {PieceSet}
 */
export function resolvePieceTheme(theme) {
  if (theme && typeof theme === 'object') return theme;
  return pieceThemes[String(theme)] ?? pieceThemes[DEFAULT_PIECE_THEME];
}

/**
 * Register a custom piece theme. Every one of the twelve codes must be present
 * — a partial set would render an invisible piece, which is worse than an error.
 * @param {string} name
 * @param {PieceSet} set
 */
export function registerPieceTheme(name, set) {
  if (!name || !set) throw new Error('A piece theme needs a name and a set of SVGs');
  const missing = PIECE_CODES.filter((code) => !set[code]);
  if (missing.length) {
    throw new Error(`Piece theme "${name}" is missing: ${missing.join(', ')}`);
  }
  pieceThemes[name] = { ...set };
}
