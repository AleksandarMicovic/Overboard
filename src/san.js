/**
 * Move generation, legality, and Standard Algebraic Notation.
 *
 * This module exists for one reason: SAN like `Nf3` names a destination but not
 * an origin, so displaying a PGN requires working out which piece moved. The
 * PGN standard only requires a disambiguating character when more than one
 * *legal* move fits, so resolving real-world notation means filtering candidate
 * moves by king safety — a pinned knight is not a candidate even though it can
 * geometrically reach the square.
 *
 * That is the entire scope. There is no search, no evaluation, and no notion of
 * a good move. This resolves notation; it does not play chess.
 */

import {
  applyMove,
  colorOf,
  findKing,
  indexToSquare,
  squareToIndex,
} from './position.js';

/** @typedef {import('./position.js').Position} Position */
/** @typedef {import('./position.js').Move} Move */
/** @typedef {import('./position.js').Piece} Piece */

const KNIGHT_DELTAS = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const DIAGONALS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHOGONALS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const KING_DELTAS = [...DIAGONALS, ...ORTHOGONALS];

const SLIDING_DIRS = { R: ORTHOGONALS, B: DIAGONALS, Q: KING_DELTAS };

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'];

/** @param {number} file @param {number} rank */
const onBoard = (file, rank) => file >= 0 && file < 8 && rank >= 0 && rank < 8;

/** @param {'w'|'b'} color */
const opponent = (color) => (color === 'w' ? 'b' : 'w');

/**
 * Is `square` attacked by any piece of `byColor`?
 *
 * Written as a direct scan from the target square outward rather than by
 * generating the opponent's moves, so it can be called from inside move
 * generation without recursion.
 *
 * @param {Position} position
 * @param {number} square
 * @param {'w'|'b'} byColor
 * @returns {boolean}
 */
export function isSquareAttacked(position, square, byColor) {
  const { board } = position;
  const file = square & 7;
  const rank = square >> 3;

  for (const [df, dr] of KNIGHT_DELTAS) {
    const f = file + df;
    const r = rank + dr;
    if (onBoard(f, r) && board[r * 8 + f] === `${byColor}N`) return true;
  }

  for (const [df, dr] of KING_DELTAS) {
    const f = file + df;
    const r = rank + dr;
    if (onBoard(f, r) && board[r * 8 + f] === `${byColor}K`) return true;
  }

  // Pawns attack forward, so look backward from the target square.
  const pawnRank = rank - (byColor === 'w' ? 1 : -1);
  for (const df of [-1, 1]) {
    const f = file + df;
    if (onBoard(f, pawnRank) && board[pawnRank * 8 + f] === `${byColor}P`) return true;
  }

  for (const [dirs, piece] of [[ORTHOGONALS, 'R'], [DIAGONALS, 'B']]) {
    for (const [df, dr] of dirs) {
      let f = file + df;
      let r = rank + dr;
      while (onBoard(f, r)) {
        const found = board[r * 8 + f];
        if (found) {
          if (colorOf(found) === byColor && (found[1] === piece || found[1] === 'Q')) {
            return true;
          }
          break;
        }
        f += df;
        r += dr;
      }
    }
  }

  return false;
}

/**
 * Every move `color` could make ignoring king safety. Castling is included but
 * already excludes castling out of, through, or into check, since those rules
 * are about squares rather than the moving king's final safety.
 *
 * @param {Position} position
 * @param {'w'|'b'} [color] Defaults to the side to move.
 * @returns {Move[]}
 */
export function pseudoLegalMoves(position, color = position.turn) {
  const { board } = position;
  /** @type {Move[]} */
  const moves = [];

  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (!piece || colorOf(piece) !== color) continue;

    const file = from & 7;
    const rank = from >> 3;
    const type = piece[1];

    if (type === 'P') {
      addPawnMoves(position, moves, from, piece, file, rank, color);
      continue;
    }

    if (type === 'N' || type === 'K') {
      const deltas = type === 'N' ? KNIGHT_DELTAS : KING_DELTAS;
      for (const [df, dr] of deltas) {
        const f = file + df;
        const r = rank + dr;
        if (!onBoard(f, r)) continue;
        const to = r * 8 + f;
        const target = board[to];
        if (target && colorOf(target) === color) continue;
        moves.push({ from, to, piece, captured: target, capturedOn: target ? to : undefined });
      }
      if (type === 'K') addCastlingMoves(position, moves, from, piece, color);
      continue;
    }

    for (const [df, dr] of SLIDING_DIRS[type]) {
      let f = file + df;
      let r = rank + dr;
      while (onBoard(f, r)) {
        const to = r * 8 + f;
        const target = board[to];
        if (target && colorOf(target) === color) break;
        moves.push({ from, to, piece, captured: target, capturedOn: target ? to : undefined });
        if (target) break;
        f += df;
        r += dr;
      }
    }
  }

  return moves;
}

/**
 * @param {Position} position @param {Move[]} moves @param {number} from
 * @param {Piece} piece @param {number} file @param {number} rank @param {'w'|'b'} color
 */
function addPawnMoves(position, moves, from, piece, file, rank, color) {
  const { board } = position;
  const dir = color === 'w' ? 1 : -1;
  const startRank = color === 'w' ? 1 : 6;
  const lastRank = color === 'w' ? 7 : 0;

  /** @param {number} to @param {Piece|null} captured @param {number} [capturedOn] */
  const push = (to, captured, capturedOn) => {
    if ((to >> 3) === lastRank) {
      for (const promotion of PROMOTION_PIECES) {
        moves.push({ from, to, piece, captured, capturedOn, promotion });
      }
    } else {
      moves.push({ from, to, piece, captured, capturedOn });
    }
  };

  const oneAhead = from + dir * 8;
  if (onBoard(file, rank + dir) && !board[oneAhead]) {
    push(oneAhead, null, undefined);
    const twoAhead = from + dir * 16;
    if (rank === startRank && !board[twoAhead]) {
      moves.push({ from, to: twoAhead, piece, captured: null });
    }
  }

  for (const df of [-1, 1]) {
    const f = file + df;
    const r = rank + dir;
    if (!onBoard(f, r)) continue;
    const to = r * 8 + f;
    const target = board[to];
    if (target && colorOf(target) !== color) {
      push(to, target, to);
    } else if (!target && to === position.ep) {
      // The captured pawn sits beside the moving pawn, not on the target.
      const capturedOn = to - dir * 8;
      push(to, board[capturedOn], capturedOn);
    }
  }
}

/**
 * @param {Position} position @param {Move[]} moves @param {number} from
 * @param {Piece} piece @param {'w'|'b'} color
 */
function addCastlingMoves(position, moves, from, piece, color) {
  const { board } = position;
  const home = color === 'w' ? 4 : 60;
  if (from !== home) return;

  const enemy = opponent(color);
  // Castling out of check is illegal, and this is the cheapest place to check.
  if (isSquareAttacked(position, home, enemy)) return;

  const options = color === 'w'
    ? [{ side: 'k', right: 'K', rook: 7 }, { side: 'q', right: 'Q', rook: 0 }]
    : [{ side: 'k', right: 'k', rook: 63 }, { side: 'q', right: 'q', rook: 56 }];

  for (const { side, right, rook } of options) {
    if (!position.castling.includes(right)) continue;
    if (board[rook] !== `${color}R`) continue;

    const step = side === 'k' ? 1 : -1;
    const between = side === 'k' ? [home + 1, home + 2] : [home - 1, home - 2, home - 3];
    if (between.some((square) => board[square])) continue;

    // The king may not pass through an attacked square. Its destination is
    // covered by the normal king-safety filter, but checking it here keeps
    // castling self-contained.
    const path = [home + step, home + step * 2];
    if (path.some((square) => isSquareAttacked(position, square, enemy))) continue;

    moves.push({ from, to: home + step * 2, piece, captured: null, castle: side });
  }
}

/**
 * Every fully legal move — pseudo-legal moves that do not leave the mover's own
 * king attacked. This single filter subsumes pins, discovered check, and moving
 * into check.
 *
 * @param {Position} position
 * @param {'w'|'b'} [color] Defaults to the side to move.
 * @returns {Move[]}
 */
export function legalMoves(position, color = position.turn) {
  const enemy = opponent(color);
  return pseudoLegalMoves(position, color).filter((move) => {
    const after = applyMove(position, move);
    const king = findKing(after, color);
    return king < 0 || !isSquareAttacked(after, king, enemy);
  });
}

/** @param {Position} position @param {'w'|'b'} [color] */
export function isCheck(position, color = position.turn) {
  const king = findKing(position, color);
  return king >= 0 && isSquareAttacked(position, king, opponent(color));
}

/** @param {Position} position @param {'w'|'b'} [color] */
export function isCheckmate(position, color = position.turn) {
  return isCheck(position, color) && legalMoves(position, color).length === 0;
}

/** @param {Position} position @param {'w'|'b'} [color] */
export function isStalemate(position, color = position.turn) {
  return !isCheck(position, color) && legalMoves(position, color).length === 0;
}

/**
 * Pieces of `color` that cannot move without exposing their own king.
 *
 * Not needed for correctness anywhere — `legalMoves` already handles pins
 * implicitly — so this is only computed when something asks for it.
 *
 * @param {Position} position
 * @param {'w'|'b'} [color]
 * @returns {{square: string, piece: Piece, by: string}[]}
 */
export function findPins(position, color = position.turn) {
  const king = findKing(position, color);
  if (king < 0) return [];

  const enemy = opponent(color);
  const pins = [];
  const kingFile = king & 7;
  const kingRank = king >> 3;

  for (const [dirs, sliderType] of [[ORTHOGONALS, 'R'], [DIAGONALS, 'B']]) {
    for (const [df, dr] of dirs) {
      let f = kingFile + df;
      let r = kingRank + dr;
      let candidate = -1;

      while (onBoard(f, r)) {
        const square = r * 8 + f;
        const piece = position.board[square];
        if (piece) {
          if (colorOf(piece) === color) {
            if (candidate >= 0) break; // Two friendly pieces — no pin.
            candidate = square;
          } else {
            if (candidate >= 0 && (piece[1] === sliderType || piece[1] === 'Q')) {
              pins.push({
                square: indexToSquare(candidate),
                piece: /** @type {Piece} */ (position.board[candidate]),
                by: indexToSquare(square),
              });
            }
            break;
          }
        }
        f += df;
        r += dr;
      }
    }
  }

  return pins;
}

const SAN_PATTERN =
  /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([QRBN]))?$/;

const ANNOTATION_SUFFIX = /([!?]{1,2})$/;

/**
 * Take a SAN token apart.
 *
 * `notation` keeps the `+`/`#` mark — a move list that showed "Rd8" where the
 * game ended in "Rd8#" would be wrong — while `core` strips everything down to
 * what the resolver matches against.
 *
 * @param {string} san
 * @returns {{core: string, notation: string, check: boolean, mate: boolean, suffix: string}}
 */
export function stripSan(san) {
  const raw = String(san).trim();
  const mate = raw.includes('#');
  const check = raw.includes('+');

  const match = raw.match(ANNOTATION_SUFFIX);
  const suffix = match ? match[1] : '';
  const notation = (suffix ? raw.slice(0, -suffix.length) : raw).trim();

  return { core: notation.replace(/[+#]/g, ''), notation, check, mate, suffix };
}

/**
 * Resolve a SAN token against a position.
 *
 * Returns `null` rather than throwing when the notation does not match exactly
 * one legal move — a viewer handed a malformed PGN should degrade, not crash.
 *
 * @param {Position} position
 * @param {string} san
 * @returns {Move|null}
 */
export function moveFromSan(position, san) {
  if (typeof san !== 'string') return null;
  const { core } = stripSan(san);
  if (!core) return null;

  const candidates = legalMoves(position);

  // Castling is written as a word, not a coordinate, so it bypasses the regex.
  const castleSide = /^(O-O-O|0-0-0)$/.test(core) ? 'q'
    : /^(O-O|0-0)$/.test(core) ? 'k'
      : null;
  if (castleSide) {
    return candidates.find((move) => move.castle === castleSide) ?? null;
  }

  const match = core.match(SAN_PATTERN);
  if (!match) return null;

  const [, pieceLetter, fromFile, fromRank, , targetSquare, promotionLetter] = match;
  const type = pieceLetter ?? 'P';
  const to = squareToIndex(targetSquare);
  const promotion = promotionLetter ? promotionLetter.toLowerCase() : null;

  const matches = candidates.filter((move) => {
    if (move.to !== to) return false;
    if (move.piece[1] !== type) return false;
    if ((move.promotion ?? null) !== promotion) return false;
    if (fromFile && (move.from & 7) !== 'abcdefgh'.indexOf(fromFile)) return false;
    if (fromRank && (move.from >> 3) !== Number(fromRank) - 1) return false;
    return true;
  });

  // Exactly one legal move must fit. Anything else means the notation is
  // ambiguous or wrong, and guessing would silently corrupt the board.
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Serialize a move to SAN, including the minimum disambiguation the standard
 * requires and a trailing `+` or `#`.
 *
 * @param {Position} position Position *before* the move.
 * @param {Move} move
 * @returns {string}
 */
export function moveToSan(position, move) {
  let san;

  if (move.castle) {
    san = move.castle === 'k' ? 'O-O' : 'O-O-O';
  } else {
    const type = move.piece[1];
    const target = indexToSquare(move.to);
    const isCapture = Boolean(move.captured);

    if (type === 'P') {
      san = isCapture ? `${'abcdefgh'[move.from & 7]}x${target}` : target;
      if (move.promotion) san += `=${move.promotion.toUpperCase()}`;
    } else {
      san = type + disambiguate(position, move) + (isCapture ? 'x' : '') + target;
    }
  }

  const after = applyMove(position, move);
  const them = after.turn;
  if (isCheck(after, them)) {
    san += legalMoves(after, them).length === 0 ? '#' : '+';
  }

  return san;
}

/**
 * The shortest disambiguator that identifies this move: nothing, a file, a
 * rank, or the full origin square.
 * @param {Position} position @param {Move} move @returns {string}
 */
function disambiguate(position, move) {
  const rivals = legalMoves(position).filter(
    (other) =>
      other.to === move.to &&
      other.piece === move.piece &&
      other.from !== move.from,
  );
  if (rivals.length === 0) return '';

  const from = indexToSquare(move.from);
  if (!rivals.some((other) => (other.from & 7) === (move.from & 7))) return from[0];
  if (!rivals.some((other) => (other.from >> 3) === (move.from >> 3))) return from[1];
  return from;
}

/**
 * Resolve a coordinate move, e.g. e2 -> e4.
 * @param {Position} position
 * @param {string} from
 * @param {string} to
 * @param {string} [promotion] 'q' | 'r' | 'b' | 'n'
 * @returns {Move|null}
 */
export function moveFromCoordinates(position, from, to, promotion) {
  const fromIndex = squareToIndex(from);
  const toIndex = squareToIndex(to);
  if (fromIndex < 0 || toIndex < 0) return null;

  const matches = legalMoves(position).filter(
    (move) => move.from === fromIndex && move.to === toIndex,
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Multiple matches means a promotion, where the target piece decides.
  const wanted = (promotion ?? 'q').toLowerCase();
  return matches.find((move) => move.promotion === wanted) ?? null;
}
