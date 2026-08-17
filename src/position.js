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

export const STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

const FILES = 'abcdefgh';

/** FEN letter -> piece code. @type {Record<string, Piece>} */
const PIECE_OF = {
  K: 'wK', Q: 'wQ', R: 'wR', B: 'wB', N: 'wN', P: 'wP',
  k: 'bK', q: 'bQ', r: 'bR', b: 'bB', n: 'bN', p: 'bP',
};

/** Piece code -> FEN letter. @type {Record<string, string>} */
const LETTER_OF = Object.fromEntries(
  Object.entries(PIECE_OF).map(([letter, piece]) => [piece, letter]),
);

/** Rook home squares, and the castling right each one carries. @type {Record<number, string>} */
const ROOK_HOME = { 0: 'Q', 7: 'K', 56: 'q', 63: 'k' };

/**
 * Convert a square name to an index. Returns -1 if it isn't a square.
 * @param {string} square e.g. 'e4'
 * @returns {number} 0..63, or -1
 */
export function squareToIndex(square) {
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
export function indexToSquare(index) {
  return FILES[index & 7] + ((index >> 3) + 1);
}

/** @param {Piece} piece @returns {'w'|'b'} */
export function colorOf(piece) {
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
export function parseFen(fen) {
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

/** Keep castling rights in the canonical KQkq order so FEN round-trips. @param {string} rights */
function normalizeCastling(rights) {
  return [...'KQkq'].filter((r) => rights.includes(r)).join('');
}

/**
 * Serialize a position back to FEN.
 * @param {Position} position
 * @returns {string}
 */
export function toFen(position) {
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
export function clonePosition(position) {
  return { ...position, board: position.board.slice() };
}

/** @param {Position} position @param {'w'|'b'} color @returns {number} index or -1 */
export function findKing(position, color) {
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
export function applyMove(position, move) {
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
