/**
 * Rendering.
 *
 * The board has no square elements. The checkerboard is a single CSS gradient
 * on the root element, which means a theme change is two custom-property writes
 * with no DOM work at all. Pieces are absolutely positioned and moved with
 * `transform: translate()`, so animation is a CSS transition rather than a
 * JavaScript tween loop.
 *
 * That leaves at most 32 piece nodes, 2 highlight nodes, and one optional
 * coordinate layer — which is the whole DOM.
 */

import { indexToSquare, squareToIndex } from './position.js';

const STYLE_ID = 'overboard-style';

const CSS = `
.overboard {
  --ob-light: #f0d9b5;
  --ob-dark: #b58863;
  --ob-highlight: rgba(255, 236, 92, 0.55);
  --ob-animation: 200ms;
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background-image: conic-gradient(
    var(--ob-dark) 25%, var(--ob-light) 0 50%,
    var(--ob-dark) 0 75%, var(--ob-light) 0
  );
  background-size: 25% 25%;
  border-radius: 3px;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
}
.overboard * { box-sizing: border-box; }
.ob-piece,
.ob-highlight {
  position: absolute;
  top: 0;
  left: 0;
  width: 12.5%;
  height: 12.5%;
  transition: transform var(--ob-animation) ease-out;
  will-change: transform;
}
.ob-piece { pointer-events: none; z-index: 2; }
.ob-piece svg { display: block; width: 100%; height: 100%; }
.ob-highlight { background: var(--ob-highlight); z-index: 1; transition: none; }
.ob-coords {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  font: 700 3cqw/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  container-type: inline-size;
}
.overboard { container-type: inline-size; }
.ob-coord {
  position: absolute;
  opacity: 0.75;
  padding: 0.6cqw;
}
.ob-coord-file { bottom: 0; }
.ob-coord-rank { top: 0; }
`;

/** Inject the stylesheet once per document. */
function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/**
 * Where a square sits on screen, in units of one square.
 *
 * Pure, and the only piece of geometry that can be wrong in a way that looks
 * plausible — which is why it is exported and unit tested for all 64 squares in
 * both orientations rather than being inlined below.
 *
 * @param {string|number} square Square name or index.
 * @param {'white'|'black'} orientation
 * @returns {{x: number, y: number}} 0..7 from the top-left of the rendered board.
 */
export function squareToXY(square, orientation = 'white') {
  const index = typeof square === 'number' ? square : squareToIndex(square);
  if (index < 0 || index > 63) throw new Error(`Not a square: ${square}`);

  const file = index & 7;
  const rank = index >> 3;

  return orientation === 'black'
    ? { x: 7 - file, y: rank }
    : { x: file, y: 7 - rank };
}

/** @param {{x: number, y: number}} point */
const translate = ({ x, y }) => `translate(${x * 100}%, ${y * 100}%)`;

/**
 * Owns the DOM for one board. Deliberately dumb: it is told what to show and
 * has no opinion about chess.
 */
export class Renderer {
  /** @type {HTMLElement} */
  element;

  /** @type {Map<string, HTMLElement>} square name -> piece node */
  #pieces = new Map();

  /** @type {HTMLElement[]} */
  #highlights = [];

  /** @type {HTMLElement|null} */
  #coords = null;

  #orientation = 'white';

  /**
   * @param {HTMLElement} container
   * @param {{orientation?: 'white'|'black'}} [options]
   */
  constructor(container, { orientation = 'white' } = {}) {
    const doc = container.ownerDocument;
    ensureStyle(doc);

    this.#orientation = orientation;
    this.element = doc.createElement('div');
    this.element.className = 'overboard';
    this.element.setAttribute('role', 'img');
    container.appendChild(this.element);
  }

  get orientation() {
    return this.#orientation;
  }

  /** @param {'white'|'black'} value */
  set orientation(value) {
    if (value === this.#orientation) return;
    this.#orientation = value;
    for (const [square, node] of this.#pieces) {
      node.style.transform = translate(squareToXY(square, value));
    }
    for (const node of this.#highlights) {
      const square = node.dataset.square;
      if (square) node.style.transform = translate(squareToXY(square, value));
    }
    if (this.#coords) this.renderCoordinates(true);
  }

  /** @param {{light: string, dark: string}} theme */
  setBoardTheme({ light, dark }) {
    this.element.style.setProperty('--ob-light', light);
    this.element.style.setProperty('--ob-dark', dark);
  }

  /** @param {number} ms */
  setAnimation(ms) {
    this.element.style.setProperty('--ob-animation', `${Math.max(0, ms)}ms`);
  }

  /** @param {string} label Accessible description of the position. */
  setLabel(label) {
    this.element.setAttribute('aria-label', label);
  }

  /**
   * Reconcile the piece layer against a board array.
   *
   * Pieces that stayed put keep their DOM node, so an unchanged board costs
   * nothing and a moved piece animates from where it was.
   *
   * @param {(string|null)[]} board 64 entries, index 0 = a1.
   * @param {Record<string, string>} pieceSet Piece code -> SVG markup.
   * @param {{from: string, to: string}|null} [lastMove] Drives animation.
   * @param {boolean} [highlight] Whether to also mark the last move's squares.
   */
  setPosition(board, pieceSet, lastMove = null, highlight = true) {
    /** @type {Map<string, string>} square -> piece code */
    const wanted = new Map();
    for (let index = 0; index < 64; index++) {
      if (board[index]) wanted.set(indexToSquare(index), board[index]);
    }

    // A piece that moved is the same node relocated, so find one-to-one moves
    // before adding or removing anything. Without this, every move would be a
    // remove-plus-add and nothing would animate.
    if (lastMove && this.#pieces.has(lastMove.from) && wanted.has(lastMove.to)) {
      const node = this.#pieces.get(lastMove.from);
      if (node.dataset.piece === wanted.get(lastMove.to)) {
        this.#pieces.delete(lastMove.from);
        this.#pieces.get(lastMove.to)?.remove();
        this.#pieces.set(lastMove.to, node);
        node.style.transform = translate(squareToXY(lastMove.to, this.#orientation));
      }
    }

    for (const [square, node] of [...this.#pieces]) {
      if (wanted.get(square) !== node.dataset.piece) {
        node.remove();
        this.#pieces.delete(square);
      }
    }

    for (const [square, piece] of wanted) {
      if (this.#pieces.has(square)) continue;
      const node = this.element.ownerDocument.createElement('div');
      node.className = 'ob-piece';
      node.dataset.piece = piece;
      node.dataset.square = square;
      node.innerHTML = pieceSet[piece] ?? '';
      node.style.transform = translate(squareToXY(square, this.#orientation));
      this.element.appendChild(node);
      this.#pieces.set(square, node);
    }

    for (const [square, node] of this.#pieces) node.dataset.square = square;

    this.setHighlights(lastMove && highlight ? [lastMove.from, lastMove.to] : []);
  }

  /**
   * Replace every piece node, keeping positions. Used when the piece theme
   * changes, where the SVG differs but nothing has moved.
   * @param {Record<string, string>} pieceSet
   */
  repaintPieces(pieceSet) {
    for (const node of this.#pieces.values()) {
      node.innerHTML = pieceSet[node.dataset.piece] ?? '';
    }
  }

  /** @param {string[]} squares */
  setHighlights(squares) {
    while (this.#highlights.length > squares.length) {
      this.#highlights.pop().remove();
    }
    while (this.#highlights.length < squares.length) {
      const node = this.element.ownerDocument.createElement('div');
      node.className = 'ob-highlight';
      this.element.appendChild(node);
      this.#highlights.push(node);
    }
    squares.forEach((square, index) => {
      const node = this.#highlights[index];
      node.dataset.square = square;
      node.style.transform = translate(squareToXY(square, this.#orientation));
    });
  }

  /** @param {boolean} show */
  renderCoordinates(show) {
    this.#coords?.remove();
    this.#coords = null;
    if (!show) return;

    const doc = this.element.ownerDocument;
    const layer = doc.createElement('div');
    layer.className = 'ob-coords';

    const files = 'abcdefgh';
    for (let i = 0; i < 8; i++) {
      const file = this.#orientation === 'black' ? files[7 - i] : files[i];
      const rank = this.#orientation === 'black' ? i + 1 : 8 - i;

      // Each label sits on a square, so it takes the *other* theme color —
      // light text on a dark square and vice versa.
      const fileLabel = doc.createElement('span');
      fileLabel.className = 'ob-coord ob-coord-file';
      fileLabel.textContent = file;
      fileLabel.style.left = `${i * 12.5}%`;
      fileLabel.style.color = (i + 7) % 2 === 0 ? 'var(--ob-dark)' : 'var(--ob-light)';
      layer.appendChild(fileLabel);

      const rankLabel = doc.createElement('span');
      rankLabel.className = 'ob-coord ob-coord-rank';
      rankLabel.textContent = String(rank);
      rankLabel.style.top = `${i * 12.5}%`;
      rankLabel.style.color = i % 2 === 0 ? 'var(--ob-dark)' : 'var(--ob-light)';
      layer.appendChild(rankLabel);
    }

    this.element.appendChild(layer);
    this.#coords = layer;
  }

  destroy() {
    this.element.remove();
    this.#pieces.clear();
    this.#highlights = [];
    this.#coords = null;
  }
}
