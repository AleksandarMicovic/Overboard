/**
 * Overboard 0.1.0
 * A dependency-free chess board viewer. https://github.com/AleksandarMicovic/Overboard
 * MIT licensed. Built from src/ by build.js — edit the source, not this file.
 */
(function (global) {
  'use strict';

/* ---- src/position.js ------------------------------------------------- */
/**
 * Position model and FEN handling.
 *
 * A position is a plain object. Nothing in this module mutates its input —
 * `applyMove` always returns a new position.
 *
 * Squares are indexed 0..63 with **a1 = 0** and **h8 = 63**, so that
 * `file = i & 7` and `rank = i >> 3`. This is the opposite reading order from
 * FEN (which starts at rank 8), and `parseFen`/`toFen` handle the flip.
 *
 * @typedef {'wK'|'wQ'|'wR'|'wB'|'wN'|'wP'|'bK'|'bQ'|'bR'|'bB'|'bN'|'bP'} Piece
 *
 * @typedef {object} Position
 * @property {(Piece|null)[]} board     64 entries, index 0 = a1.
 * @property {'w'|'b'} turn             Side to move.
 * @property {string} castling          Subset of 'KQkq' in that order, or ''.
 * @property {number} ep                En-passant *target* square index, or -1.
 * @property {number} halfmove          Halfmove clock (50-move rule).
 * @property {number} fullmove          Fullmove number, starts at 1.
 *
 * @typedef {object} Move
 * @property {number} from              Origin square index.
 * @property {number} to                Destination square index.
 * @property {Piece} piece              The piece that moves.
 * @property {Piece|null} [captured]    Piece removed, if any.
 * @property {number} [capturedOn]      Where it was removed from (differs from
 *                                      `to` on en passant).
 * @property {'q'|'r'|'b'|'n'|null} [promotion]
 * @property {'k'|'q'|null} [castle]    Kingside or queenside, if castling.
 */

const STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

const FILES = 'abcdefgh';

/** FEN letter -> piece code. */
const PIECE_OF = {
  K: 'wK', Q: 'wQ', R: 'wR', B: 'wB', N: 'wN', P: 'wP',
  k: 'bK', q: 'bQ', r: 'bR', b: 'bB', n: 'bN', p: 'bP',
};

/** Piece code -> FEN letter. */
const LETTER_OF = Object.fromEntries(
  Object.entries(PIECE_OF).map(([letter, piece]) => [piece, letter]),
);

/** Rook home squares, and the castling right each one carries. */
const ROOK_HOME = { 0: 'Q', 7: 'K', 56: 'q', 63: 'k' };

/**
 * Convert a square name to an index. Returns -1 if it isn't a square.
 * @param {string} square e.g. 'e4'
 * @returns {number} 0..63, or -1
 */
function squareToIndex(square) {
  if (typeof square !== 'string' || square.length !== 2) return -1;
  const file = FILES.indexOf(square[0].toLowerCase());
  const rank = square.charCodeAt(1) - 49; // '1' -> 0
  if (file < 0 || rank < 0 || rank > 7) return -1;
  return rank * 8 + file;
}

/**
 * Convert an index to a square name.
 * @param {number} index 0..63
 * @returns {string} e.g. 'e4'
 */
function indexToSquare(index) {
  return FILES[index & 7] + ((index >> 3) + 1);
}

/** @param {Piece} piece @returns {'w'|'b'} */
function colorOf(piece) {
  return /** @type {'w'|'b'} */ (piece[0]);
}

/**
 * Parse a FEN string into a position.
 *
 * Throws on malformed input rather than guessing — a silently wrong board is
 * worse than a clear error. Callers that need tolerance should catch.
 *
 * @param {string} fen
 * @returns {Position}
 */
function parseFen(fen) {
  if (typeof fen !== 'string') throw new Error('FEN must be a string');

  const parts = fen.trim().split(/\s+/);
  if (parts.length < 1 || !parts[0]) throw new Error(`Invalid FEN: ${fen}`);

  // Fields after the placement are optional; fall back to sensible defaults so
  // that bare placement strings (common in puzzle collections) still work.
  const [placement, turn = 'w', castling = '-', ep = '-', half = '0', full = '1'] =
    parts;

  const ranks = placement.split('/');
  if (ranks.length !== 8) {
    throw new Error(`Invalid FEN: expected 8 ranks, got ${ranks.length}`);
  }

  /** @type {(Piece|null)[]} */
  const board = new Array(64).fill(null);

  for (let r = 0; r < 8; r++) {
    const row = ranks[r];
    const rank = 7 - r; // FEN starts at rank 8
    let file = 0;
    for (const char of row) {
      if (char >= '1' && char <= '8') {
        file += Number(char);
      } else if (PIECE_OF[char]) {
        if (file > 7) throw new Error(`Invalid FEN: rank ${rank + 1} overflows`);
        board[rank * 8 + file] = PIECE_OF[char];
        file++;
      } else {
        throw new Error(`Invalid FEN: unexpected '${char}'`);
      }
    }
    if (file !== 8) {
      throw new Error(`Invalid FEN: rank ${rank + 1} has ${file} squares, need 8`);
    }
  }

  if (turn !== 'w' && turn !== 'b') {
    throw new Error(`Invalid FEN: side to move must be 'w' or 'b', got '${turn}'`);
  }
  if (castling !== '-' && !/^[KQkq]+$/.test(castling)) {
    throw new Error(`Invalid FEN: bad castling field '${castling}'`);
  }
  if (ep !== '-' && squareToIndex(ep) < 0) {
    throw new Error(`Invalid FEN: bad en passant square '${ep}'`);
  }

  return {
    board,
    turn,
    castling: castling === '-' ? '' : normalizeCastling(castling),
    ep: ep === '-' ? -1 : squareToIndex(ep),
    halfmove: Number.isFinite(Number(half)) ? Number(half) : 0,
    fullmove: Number(full) > 0 ? Number(full) : 1,
  };
}

/** Keep castling rights in the canonical KQkq order so FEN round-trips. */
function normalizeCastling(rights) {
  return [...'KQkq'].filter((r) => rights.includes(r)).join('');
}

/**
 * Serialize a position back to FEN.
 * @param {Position} position
 * @returns {string}
 */
function toFen(position) {
  const rows = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = position.board[rank * 8 + file];
      if (piece) {
        if (empty) { row += empty; empty = 0; }
        row += LETTER_OF[piece];
      } else {
        empty++;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }

  return [
    rows.join('/'),
    position.turn,
    position.castling || '-',
    position.ep >= 0 ? indexToSquare(position.ep) : '-',
    position.halfmove,
    position.fullmove,
  ].join(' ');
}

/**
 * Shallow-copy a position. The board array is copied; everything else is a
 * primitive, so this is a full clone in practice.
 * @param {Position} position
 * @returns {Position}
 */
function clonePosition(position) {
  return { ...position, board: position.board.slice() };
}

/** @param {Position} position @param {'w'|'b'} color @returns {number} index or -1 */
function findKing(position, color) {
  return position.board.indexOf(/** @type {Piece} */ (`${color}K`));
}

/**
 * Apply a move and return the resulting position. Does not validate legality —
 * that is `san.js`'s job. This function is purely mechanical.
 *
 * @param {Position} position
 * @param {Move} move
 * @returns {Position}
 */
function applyMove(position, move) {
  const next = clonePosition(position);
  const { board } = next;
  const { from, to } = move;
  const piece = board[from];
  if (!piece) throw new Error(`No piece on ${indexToSquare(from)}`);

  const color = colorOf(piece);
  const isPawn = piece[1] === 'P';
  const captured = move.captured ?? board[to];

  // Remove the captured piece. On en passant it is not on the target square.
  if (move.capturedOn !== undefined && move.capturedOn !== to) {
    board[move.capturedOn] = null;
  }

  board[from] = null;
  board[to] = move.promotion
    ? /** @type {Piece} */ (color + move.promotion.toUpperCase())
    : piece;

  // Castling moves the rook too. The king has already been placed above.
  if (move.castle) {
    const rookFrom = move.castle === 'k' ? to + 1 : to - 2;
    const rookTo = move.castle === 'k' ? to - 1 : to + 1;
    board[rookTo] = board[rookFrom];
    board[rookFrom] = null;
  }

  // Castling rights are lost by moving the king, moving a rook off its home
  // square, or having a rook captured on its home square.
  let rights = next.castling;
  if (piece[1] === 'K') {
    rights = [...rights].filter((r) => (color === 'w' ? r === r.toLowerCase() : r === r.toUpperCase())).join('');
  }
  for (const square of [from, to]) {
    const right = ROOK_HOME[square];
    if (right) rights = rights.replace(right, '');
  }
  next.castling = normalizeCastling(rights);

  // An en-passant target only exists immediately after a double pawn push.
  const isDoublePush = isPawn && Math.abs((to >> 3) - (from >> 3)) === 2;
  next.ep = isDoublePush ? (from + to) / 2 : -1;

  next.halfmove = isPawn || captured ? 0 : position.halfmove + 1;
  next.fullmove = position.turn === 'b' ? position.fullmove + 1 : position.fullmove;
  next.turn = position.turn === 'w' ? 'b' : 'w';

  return next;
}

/* ---- src/san.js ------------------------------------------------------ */
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
function isSquareAttacked(position, square, byColor) {
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
function pseudoLegalMoves(position, color = position.turn) {
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
function legalMoves(position, color = position.turn) {
  const enemy = opponent(color);
  return pseudoLegalMoves(position, color).filter((move) => {
    const after = applyMove(position, move);
    const king = findKing(after, color);
    return king < 0 || !isSquareAttacked(after, king, enemy);
  });
}

/** @param {Position} position @param {'w'|'b'} [color] */
function isCheck(position, color = position.turn) {
  const king = findKing(position, color);
  return king >= 0 && isSquareAttacked(position, king, opponent(color));
}

/** @param {Position} position @param {'w'|'b'} [color] */
function isCheckmate(position, color = position.turn) {
  return isCheck(position, color) && legalMoves(position, color).length === 0;
}

/** @param {Position} position @param {'w'|'b'} [color] */
function isStalemate(position, color = position.turn) {
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
function findPins(position, color = position.turn) {
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
function stripSan(san) {
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
function moveFromSan(position, san) {
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
function moveToSan(position, move) {
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
function moveFromCoordinates(position, from, to, promotion) {
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

/* ---- src/pgn.js ------------------------------------------------------ */
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




/** @typedef {import('./position.js').Position} Position */

/**
 * Numeric Annotation Glyphs worth surfacing. The rest are passed through as a
 * raw `nag` number without a label.
 */
const NAG_LABELS = {
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
function parsePgn(pgn) {
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

/* ---- src/themes.js --------------------------------------------------- */
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
const boardThemes = {
  brown: { light: '#f0d9b5', dark: '#b58863' },
  wood: { light: '#e8c99b', dark: '#a3703f' },
  blue: { light: '#dee3e6', dark: '#8ca2ad' },
  green: { light: '#eeeed2', dark: '#769656' },
  slate: { light: '#e8ebef', dark: '#7d8796' },
  ink: { light: '#c8ccd0', dark: '#33373b' },
  rose: { light: '#f7dde2', dark: '#c2708a' },
};

const DEFAULT_BOARD_THEME = 'brown';

/**
 * Resolve a theme name or an inline `{light, dark}` pair to a theme.
 * Falls back to the default rather than throwing, so a typo degrades to a
 * usable board instead of a blank one.
 *
 * @param {string|BoardTheme} theme
 * @returns {BoardTheme}
 */
function resolveBoardTheme(theme) {
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
function registerBoardTheme(name, theme) {
  if (!name || !theme?.light || !theme?.dark) {
    throw new Error('A board theme needs a name and both `light` and `dark` colors');
  }
  boardThemes[name] = { light: theme.light, dark: theme.dark };
}

/* ---- src/pieces.js --------------------------------------------------- */
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
const pieceThemes = Object.fromEntries(
  Object.entries(DEFINITIONS).map(([name, definition]) => [name, buildSet(definition)]),
);

const DEFAULT_PIECE_THEME = 'classic';

const PIECE_CODES = [
  'wK', 'wQ', 'wR', 'wB', 'wN', 'wP',
  'bK', 'bQ', 'bR', 'bB', 'bN', 'bP',
];

/**
 * Resolve a theme name to a piece set, falling back to the default so a typo
 * degrades to a visible board rather than an empty one.
 * @param {string|PieceSet} theme
 * @returns {PieceSet}
 */
function resolvePieceTheme(theme) {
  if (theme && typeof theme === 'object') return theme;
  return pieceThemes[String(theme)] ?? pieceThemes[DEFAULT_PIECE_THEME];
}

/**
 * Register a custom piece theme. Every one of the twelve codes must be present
 * — a partial set would render an invisible piece, which is worse than an error.
 * @param {string} name
 * @param {PieceSet} set
 */
function registerPieceTheme(name, set) {
  if (!name || !set) throw new Error('A piece theme needs a name and a set of SVGs');
  const missing = PIECE_CODES.filter((code) => !set[code]);
  if (missing.length) {
    throw new Error(`Piece theme "${name}" is missing: ${missing.join(', ')}`);
  }
  pieceThemes[name] = { ...set };
}

/* ---- src/render.js --------------------------------------------------- */
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
function squareToXY(square, orientation = 'white') {
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
class Renderer {
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

/* ---- src/overboard.js ------------------------------------------------ */
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

class Overboard {
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

  global.Overboard = Overboard;
  if (typeof module !== 'undefined' && module.exports) module.exports = Overboard;
})(typeof globalThis !== 'undefined' ? globalThis : this);
