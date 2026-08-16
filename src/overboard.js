/**
 * Overboard — a chess board viewer.
 *
 * Public surface lives here. State is exposed as accessor properties, so every
 * option can be set at construction or written at any point afterwards:
 *
 *   const board = new Overboard('#board', { fen: 'start' });
 *   board.orientation = 'black';
 *   board.move('Nf3');
 *
 * There is no engine behind this. Moves are resolved and displayed; none are
 * chosen.
 */

import {
  EMPTY_FEN,
  STARTING_FEN,
  applyMove,
  indexToSquare,
  parseFen,
  toFen,
} from './position.js';
import {
  findPins,
  isCheck,
  legalMoves,
  moveFromCoordinates,
  moveFromSan,
  moveToSan,
} from './san.js';
import { NAG_LABELS, parsePgn } from './pgn.js';
import { Renderer } from './render.js';
import {
  DEFAULT_BOARD_THEME,
  boardThemes,
  registerBoardTheme,
  resolveBoardTheme,
} from './themes.js';
import {
  DEFAULT_PIECE_THEME,
  pieceThemes,
  registerPieceTheme,
  resolvePieceTheme,
} from './pieces.js';

/** @typedef {import('./pgn.js').PgnMove} PgnMove */
/** @typedef {import('./position.js').Position} Position */

/**
 * @typedef {object} OverboardOptions
 * @property {string} [fen] FEN string, or 'start'. Default 'start'.
 * @property {string} [pgn] A PGN game. Overrides `fen` when both are given.
 * @property {'white'|'black'} [orientation] Default 'white'.
 * @property {boolean} [showCoordinates] Default false.
 * @property {string} [pieceTheme] Default 'classic'.
 * @property {string|{light: string, dark: string}} [boardTheme] Default 'brown'.
 * @property {number} [animation] Milliseconds. Default 200. 0 disables.
 * @property {boolean} [highlightLastMove] Default true.
 */

const DEFAULTS = {
  fen: 'start',
  pgn: null,
  orientation: 'white',
  showCoordinates: false,
  pieceTheme: DEFAULT_PIECE_THEME,
  boardTheme: DEFAULT_BOARD_THEME,
  animation: 200,
  highlightLastMove: true,
};

export class Overboard {
  /** All registered board themes, as `{light, dark}` pairs. */
  static boardThemes = boardThemes;

  /** All registered piece themes, as maps of piece code to SVG markup. */
  static pieceThemes = pieceThemes;

  static registerBoardTheme = registerBoardTheme;

  static registerPieceTheme = registerPieceTheme;

  /** Numeric Annotation Glyph meanings, e.g. `3` -> brilliant. */
  static NAG_LABELS = NAG_LABELS;

  /** @type {Renderer} */
  #renderer;

  /** @type {Position} */
  #position;

  /** @type {string} Position the current line starts from. */
  #startFen = STARTING_FEN;

  /** @type {PgnMove[]} */
  #moves = [];

  /** @type {Record<string, string>} */
  #headers = {};

  #ply = 0;

  /** @type {{from: string, to: string}|null} */
  #lastMove = null;

  /** @type {Map<string, Set<Function>>} */
  #listeners = new Map();

  #options = { ...DEFAULTS };

  /** @type {Record<string, string>} */
  #pieceSet;

  /**
   * @param {string|HTMLElement} target A CSS selector or an element.
   * @param {OverboardOptions} [options]
   */
  constructor(target, options = {}) {
    const container =
      typeof target === 'string' ? document.querySelector(target) : target;
    if (!container) throw new Error(`Overboard: no element matching ${target}`);

    this.#options = { ...DEFAULTS, ...options };
    this.#pieceSet = resolvePieceTheme(this.#options.pieceTheme);

    this.#renderer = new Renderer(container, {
      orientation: this.#options.orientation,
    });
    this.#renderer.setBoardTheme(resolveBoardTheme(this.#options.boardTheme));
    this.#renderer.setAnimation(this.#options.animation);
    this.#renderer.renderCoordinates(this.#options.showCoordinates);

    this.#position = parseFen(STARTING_FEN);

    if (this.#options.pgn) {
      this.pgn = this.#options.pgn;
    } else {
      this.fen = this.#options.fen;
    }
  }

  /* ---------------------------------------------------------------- state */

  /** The root element Overboard created. */
  get element() {
    return this.#renderer.element;
  }

  /** Current position as FEN. */
  get fen() {
    return toFen(this.#position);
  }

  /**
   * Set the position. Clears any loaded game, since the line no longer applies.
   * @param {string} value A FEN string, or 'start'.
   */
  set fen(value) {
    const fen = value === 'start' || value == null ? STARTING_FEN
      : value === 'empty' ? EMPTY_FEN
        : value;
    this.#position = parseFen(fen);
    this.#startFen = toFen(this.#position);
    this.#moves = [];
    this.#headers = {};
    this.#ply = 0;
    this.#lastMove = null;
    this.#draw();
    this.#emit('position', { fen: this.fen, ply: 0 });
  }

  /** The loaded game as PGN movetext, or '' if no game is loaded. */
  get pgn() {
    if (this.#moves.length === 0) return '';

    const parts = [];
    let position = parseFen(this.#startFen);

    for (const [index, move] of this.#moves.entries()) {
      if (position.turn === 'w') {
        parts.push(`${position.fullmove}.`);
      } else if (index === 0) {
        parts.push(`${position.fullmove}...`);
      }
      parts.push(move.san + (move.annotation?.symbol ?? ''));
      if (move.comment) parts.push(`{${move.comment}}`);

      // Each move stores the FEN that follows it, so stepping the position
      // forward is a parse rather than a re-resolution.
      position = parseFen(move.fen);
    }

    return parts.join(' ');
  }

  /** @param {string} value */
  set pgn(value) {
    const game = parsePgn(value);
    this.#startFen = game.startFen;
    this.#headers = game.headers;
    this.#moves = game.moves;
    this.#ply = 0;
    this.#lastMove = null;
    this.#position = parseFen(game.startFen);
    this.#draw();
    this.#emit('position', { fen: this.fen, ply: 0 });
    for (const error of game.errors) {
      this.#emit('error', { message: error });
    }
  }

  /** Moves of the line currently on the board. Read-only. */
  get moves() {
    return this.#moves.slice();
  }

  /** PGN tag pairs from the loaded game. Read-only. */
  get headers() {
    return { ...this.#headers };
  }

  /** Side to move, 'w' or 'b'. Read-only. */
  get turn() {
    return this.#position.turn;
  }

  /** How many moves of the line are shown, 0 to `moves.length`. */
  get ply() {
    return this.#ply;
  }

  set ply(value) {
    this.goTo(value);
  }

  get orientation() {
    return this.#options.orientation;
  }

  /** @param {'white'|'black'} value */
  set orientation(value) {
    const orientation = value === 'black' ? 'black' : 'white';
    this.#options.orientation = orientation;
    this.#renderer.orientation = orientation;
  }

  get showCoordinates() {
    return this.#options.showCoordinates;
  }

  set showCoordinates(value) {
    this.#options.showCoordinates = Boolean(value);
    this.#renderer.renderCoordinates(this.#options.showCoordinates);
  }

  get boardTheme() {
    return this.#options.boardTheme;
  }

  /** @param {string|{light: string, dark: string}} value */
  set boardTheme(value) {
    this.#options.boardTheme = value;
    this.#renderer.setBoardTheme(resolveBoardTheme(value));
  }

  get pieceTheme() {
    return this.#options.pieceTheme;
  }

  /** @param {string|Record<string, string>} value */
  set pieceTheme(value) {
    this.#options.pieceTheme = value;
    this.#pieceSet = resolvePieceTheme(value);
    this.#renderer.repaintPieces(this.#pieceSet);
  }

  get animation() {
    return this.#options.animation;
  }

  /** @param {number} value Milliseconds; 0 disables animation. */
  set animation(value) {
    this.#options.animation = Number(value) || 0;
    this.#renderer.setAnimation(this.#options.animation);
  }

  get highlightLastMove() {
    return this.#options.highlightLastMove;
  }

  set highlightLastMove(value) {
    this.#options.highlightLastMove = Boolean(value);
    this.#draw();
  }

  /* --------------------------------------------------------------- actions */

  /**
   * Play a move.
   *
   *   board.move('Nf3')          // algebraic
   *   board.move('e2', 'e4')     // coordinates
   *   board.move('e7', 'e8', 'q') // with promotion
   *
   * Returns the move, or `null` if the notation did not resolve to exactly one
   * legal move. Never throws — a viewer handed bad input should carry on.
   *
   * @param {string} from SAN, or the origin square.
   * @param {string} [to] Destination square, for coordinate form.
   * @param {string} [promotion] 'q' | 'r' | 'b' | 'n'. Defaults to queen.
   * @returns {PgnMove|null}
   */
  move(from, to, promotion) {
    const internal = to
      ? moveFromCoordinates(this.#position, from, to, promotion)
      : moveFromSan(this.#position, from);
    if (!internal) return null;

    const san = moveToSan(this.#position, internal);
    const before = this.#position;
    this.#position = applyMove(before, internal);

    /** @type {PgnMove} */
    const record = {
      san,
      from: indexToSquare(internal.from),
      to: indexToSquare(internal.to),
      piece: internal.piece,
      captured: internal.captured ?? null,
      promotion: internal.promotion ?? null,
      castle: internal.castle ?? null,
      fen: this.fen,
      ply: this.#ply + 1,
    };

    // A move made from the middle of a line replaces the rest of it, the way a
    // physical board would.
    this.#moves = [...this.#moves.slice(0, this.#ply), record];
    this.#ply = this.#moves.length;
    this.#lastMove = { from: record.from, to: record.to };

    this.#draw();
    this.#announce(record, internal);
    return record;
  }

  /** Go to the start of the line. */
  first() {
    return this.goTo(0);
  }

  /** Step back one move. */
  prev() {
    return this.goTo(this.#ply - 1);
  }

  /** Step forward one move. */
  next() {
    return this.goTo(this.#ply + 1);
  }

  /** Go to the end of the line. */
  last() {
    return this.goTo(this.#moves.length);
  }

  /**
   * Jump to a point in the line. `0` is the starting position.
   *
   * Each move carries the FEN that follows it, so this is a direct jump rather
   * than a replay — which is what scrubbing through a broadcast needs.
   *
   * @param {number} ply
   * @returns {boolean} Whether the position changed.
   */
  goTo(ply) {
    const target = Math.max(0, Math.min(Math.trunc(Number(ply) || 0), this.#moves.length));
    if (target === this.#ply) return false;

    const forward = target > this.#ply;
    this.#ply = target;
    const move = target === 0 ? null : this.#moves[target - 1];
    this.#position = parseFen(move ? move.fen : this.#startFen);
    this.#lastMove = move ? { from: move.from, to: move.to } : null;

    this.#draw();
    this.#emit('position', { fen: this.fen, ply: target });

    // Only announce chess events when moving forward through the line —
    // rewinding past a checkmate should not re-fire it.
    if (forward && move) this.#announce(move, null);
    return true;
  }

  /** Reset to the standard starting position. */
  reset() {
    this.fen = STARTING_FEN;
  }

  /** Clear the board. */
  clear() {
    this.fen = EMPTY_FEN;
  }

  /** Flip the board. */
  flip() {
    this.orientation = this.orientation === 'white' ? 'black' : 'white';
    return this.orientation;
  }

  /** Every legal move in the current position, as SAN. */
  legalMoves() {
    return legalMoves(this.#position).map((move) => moveToSan(this.#position, move));
  }

  /* ---------------------------------------------------------------- events */

  /**
   * Listen for an event. Returns an unsubscribe function, so a one-liner can
   * clean itself up.
   *
   * Events: `move`, `position`, `capture`, `promotion`, `castle`, `check`,
   * `checkmate`, `stalemate`, `annotation`, `pin`, `error`.
   *
   * @param {string} name
   * @param {(payload: any, board: Overboard) => void} listener
   * @returns {() => void}
   */
  on(name, listener) {
    if (typeof listener !== 'function') throw new TypeError('Listener must be a function');
    if (!this.#listeners.has(name)) this.#listeners.set(name, new Set());
    this.#listeners.get(name).add(listener);
    return () => this.off(name, listener);
  }

  /** @param {string} name @param {Function} [listener] Omit to remove all. */
  off(name, listener) {
    if (!listener) this.#listeners.delete(name);
    else this.#listeners.get(name)?.delete(listener);
  }

  /** Remove the board from the page and drop every listener. */
  destroy() {
    this.#renderer.destroy();
    this.#listeners.clear();
    this.#moves = [];
  }

  /* --------------------------------------------------------------- private */

  #draw() {
    this.#renderer.setPosition(
      this.#position.board,
      this.#pieceSet,
      this.#lastMove,
      this.#options.highlightLastMove,
    );
    this.#renderer.setLabel(`Chess position: ${this.fen}`);
  }

  /** @param {string} name @param {object} payload */
  #emit(name, payload) {
    const listeners = this.#listeners.get(name);
    if (!listeners?.size) return;
    for (const listener of [...listeners]) {
      // One misbehaving listener must not take the board down with it.
      try {
        listener(payload, this);
      } catch (error) {
        console.error(`Overboard: "${name}" listener threw`, error);
      }
    }
  }

  /** @param {string} name */
  #listening(name) {
    return Boolean(this.#listeners.get(name)?.size);
  }

  /**
   * Emit everything that follows from a move having been played.
   * @param {PgnMove} record
   * @param {import('./position.js').Move|null} internal
   */
  #announce(record, internal) {
    this.#emit('move', { ...record });
    this.#emit('position', { fen: this.fen, ply: this.#ply });

    if (record.captured) {
      this.#emit('capture', {
        square: internal?.capturedOn !== undefined
          ? indexToSquare(internal.capturedOn)
          : record.to,
        piece: record.captured,
      });
    }
    if (record.promotion) {
      this.#emit('promotion', {
        square: record.to,
        piece: record.piece[0] + record.promotion.toUpperCase(),
      });
    }
    if (record.castle) {
      this.#emit('castle', { side: record.piece[0], kingside: record.castle === 'k' });
    }
    if (record.annotation) {
      this.#emit('annotation', { ...record.annotation, nag: record.nag, san: record.san });
    }

    const them = this.#position.turn;
    if (isCheck(this.#position, them)) {
      const mated = legalMoves(this.#position, them).length === 0;
      this.#emit('check', { side: them, king: this.#kingSquare(them) });
      if (mated) this.#emit('checkmate', { winner: them === 'w' ? 'b' : 'w' });
    } else if (legalMoves(this.#position, them).length === 0) {
      this.#emit('stalemate', {});
    }

    // Pins cost a scan per friendly piece and nothing else needs them, so they
    // are only computed when somebody is actually listening.
    if (this.#listening('pin')) {
      const pinned = [...findPins(this.#position, 'w'), ...findPins(this.#position, 'b')];
      if (pinned.length) this.#emit('pin', { pinned });
    }
  }

  /** @param {'w'|'b'} color */
  #kingSquare(color) {
    const index = this.#position.board.indexOf(`${color}K`);
    return index < 0 ? null : indexToSquare(index);
  }
}

export default Overboard;
