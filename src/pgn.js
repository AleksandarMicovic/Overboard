/**
 * PGN reading.
 *
 * A scanner rather than a grammar: PGN in the wild is inconsistent, and a
 * tolerant scanner that keeps going is more useful to a viewer than a strict
 * parser that rejects the file.
 *
 * Variations (RAVs) are recognized and skipped in v1 so nested parentheses
 * cannot corrupt the mainline, but they are not stored. Comments and NAGs are
 * kept — both matter for Anki cards and stream overlays.
 */

import {
  STARTING_FEN,
  applyMove,
  indexToSquare,
  parseFen,
  toFen,
} from './position.js';
import { moveFromSan, stripSan } from './san.js';

/** @typedef {import('./position.js').Position} Position */

/**
 * Numeric Annotation Glyphs worth surfacing. The rest are passed through as a
 * raw `nag` number without a label.
 */
export const NAG_LABELS = {
  1: { symbol: '!', label: 'good' },
  2: { symbol: '?', label: 'mistake' },
  3: { symbol: '!!', label: 'brilliant' },
  4: { symbol: '??', label: 'blunder' },
  5: { symbol: '!?', label: 'interesting' },
  6: { symbol: '?!', label: 'dubious' },
};

/** Suffixes written straight into SAN map to the same labels. */
const SUFFIX_NAGS = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

/**
 * @typedef {object} PgnMove
 * @property {string} san            As written, minus annotation suffixes.
 * @property {string} from           Origin square, e.g. 'g1'.
 * @property {string} to             Destination square.
 * @property {string} piece          Piece code, e.g. 'wN'.
 * @property {string|null} captured
 * @property {string|null} promotion
 * @property {'k'|'q'|null} castle
 * @property {string} fen            Position *after* the move.
 * @property {number} ply            1-based.
 * @property {string} [comment]
 * @property {number} [nag]
 * @property {{symbol: string, label: string}} [annotation]
 *
 * @typedef {object} PgnGame
 * @property {Record<string, string>} headers
 * @property {PgnMove[]} moves
 * @property {string} result
 * @property {string} startFen
 * @property {string} [comment]      Comment before the first move.
 * @property {string[]} errors       Non-fatal problems, in order.
 */

/**
 * Split a PGN into its tag-pair section and its movetext.
 * @param {string} pgn
 */
function splitSections(pgn) {
  /** @type {Record<string, string>} */
  const headers = {};
  const tagPattern = /\[\s*(\w+)\s*"((?:[^"\\]|\\.)*)"\s*\]/g;

  let lastTagEnd = 0;
  let match;
  while ((match = tagPattern.exec(pgn)) !== null) {
    // Stop collecting tags once real movetext has begun, so a stray bracket
    // later in the file does not get read as a header.
    if (pgn.slice(lastTagEnd, match.index).trim()) break;
    headers[match[1]] = match[2].replace(/\\(.)/g, '$1');
    lastTagEnd = tagPattern.lastIndex;
  }

  return { headers, movetext: pgn.slice(lastTagEnd) };
}

/**
 * Scan movetext into a flat token list. Tokens inside variations are dropped
 * here rather than by the caller, so nesting is handled in one place.
 *
 * @param {string} movetext
 * @returns {{type: 'san'|'comment'|'nag'|'result', value: string|number}[]}
 */
function tokenize(movetext) {
  const tokens = [];
  let index = 0;
  let ravDepth = 0;

  /** @param {'san'|'comment'|'nag'|'result'} type @param {string|number} value */
  const emit = (type, value) => {
    if (ravDepth === 0) tokens.push({ type, value });
  };

  while (index < movetext.length) {
    const char = movetext[index];

    if (/\s/.test(char)) {
      index++;
    } else if (char === '{') {
      const end = movetext.indexOf('}', index + 1);
      // An unterminated comment swallows the rest rather than looping forever.
      const stop = end === -1 ? movetext.length : end;
      emit('comment', movetext.slice(index + 1, stop).trim());
      index = stop + 1;
    } else if (char === ';') {
      const end = movetext.indexOf('\n', index);
      const stop = end === -1 ? movetext.length : end;
      emit('comment', movetext.slice(index + 1, stop).trim());
      index = stop;
    } else if (char === '(') {
      ravDepth++;
      index++;
    } else if (char === ')') {
      ravDepth = Math.max(0, ravDepth - 1);
      index++;
    } else if (char === '$') {
      let end = index + 1;
      while (end < movetext.length && /\d/.test(movetext[end])) end++;
      emit('nag', Number(movetext.slice(index + 1, end)));
      index = end;
    } else {
      let end = index;
      while (end < movetext.length && !/[\s{}();$]/.test(movetext[end])) end++;
      const word = movetext.slice(index, end);
      index = end === index ? index + 1 : end;

      if (!word) continue;
      if (RESULTS.has(word)) {
        emit('result', word);
        continue;
      }
      // "1." and "1..." are structure, not moves. They may also be glued to the
      // move itself, as in "1.e4".
      const stripped = word.replace(/^\d+\.*/, '');
      if (!stripped || stripped === '.') continue;
      if (RESULTS.has(stripped)) {
        emit('result', stripped);
        continue;
      }
      emit('san', stripped);
    }
  }

  return tokens;
}

/**
 * Parse a PGN game and resolve every move against the board.
 *
 * Resolution happens here rather than lazily so that each move carries the FEN
 * that follows it — which makes `goTo(n)` an O(1) jump instead of a replay,
 * the thing scrubbing through a stream overlay actually needs.
 *
 * @param {string} pgn
 * @returns {PgnGame}
 */
export function parsePgn(pgn) {
  if (typeof pgn !== 'string') throw new Error('PGN must be a string');

  const { headers, movetext } = splitSections(pgn);
  const startFen = headers.FEN ?? STARTING_FEN;

  /** @type {PgnGame} */
  const game = {
    headers,
    moves: [],
    result: headers.Result ?? '*',
    startFen,
    errors: [],
  };

  let position;
  try {
    position = parseFen(startFen);
  } catch (error) {
    game.errors.push(`Bad FEN header: ${error.message}`);
    position = parseFen(STARTING_FEN);
    game.startFen = STARTING_FEN;
  }

  for (const token of tokenize(movetext)) {
    const previous = game.moves[game.moves.length - 1];

    if (token.type === 'result') {
      game.result = /** @type {string} */ (token.value);
      continue;
    }

    if (token.type === 'comment') {
      const text = /** @type {string} */ (token.value);
      if (!text) continue;
      if (previous) {
        previous.comment = previous.comment ? `${previous.comment} ${text}` : text;
      } else {
        game.comment = game.comment ? `${game.comment} ${text}` : text;
      }
      continue;
    }

    if (token.type === 'nag') {
      if (previous) applyNag(previous, Number(token.value));
      continue;
    }

    const san = /** @type {string} */ (token.value);
    const move = moveFromSan(position, san);
    if (!move) {
      // Stop at the first unreadable move: everything after it would be
      // resolved against a position that never occurred.
      game.errors.push(
        `Could not resolve "${san}" at ply ${game.moves.length + 1}; stopped there.`,
      );
      break;
    }

    position = applyMove(position, move);

    /** @type {PgnMove} */
    const entry = {
      san: stripSan(san).notation,
      from: indexToSquare(move.from),
      to: indexToSquare(move.to),
      piece: move.piece,
      captured: move.captured ?? null,
      promotion: move.promotion ?? null,
      castle: move.castle ?? null,
      fen: toFen(position),
      ply: game.moves.length + 1,
    };

    const { suffix } = stripSan(san);
    if (suffix && SUFFIX_NAGS[suffix]) applyNag(entry, SUFFIX_NAGS[suffix]);

    game.moves.push(entry);
  }

  return game;
}

/** @param {PgnMove} move @param {number} nag */
function applyNag(move, nag) {
  if (!Number.isFinite(nag)) return;
  move.nag = nag;
  if (NAG_LABELS[nag]) move.annotation = NAG_LABELS[nag];
}
