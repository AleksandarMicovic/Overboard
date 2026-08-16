/** FEN parsing, serialization, and the mechanics of applying a move. */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STARTING_FEN,
  applyMove,
  indexToSquare,
  parseFen,
  squareToIndex,
  toFen,
} from '../src/position.js';
import { moveFromSan } from '../src/san.js';

/** A move played through SAN, returning the resulting FEN. */
function play(fen, ...sans) {
  let position = parseFen(fen);
  for (const san of sans) {
    const move = moveFromSan(position, san);
    assert.ok(move, `could not resolve ${san} in ${toFen(position)}`);
    position = applyMove(position, move);
  }
  return toFen(position);
}

test('square names and indices round-trip for all 64 squares', () => {
  for (let index = 0; index < 64; index++) {
    assert.equal(squareToIndex(indexToSquare(index)), index);
  }
  assert.equal(squareToIndex('a1'), 0);
  assert.equal(squareToIndex('h1'), 7);
  assert.equal(squareToIndex('a8'), 56);
  assert.equal(squareToIndex('h8'), 63);
});

test('non-squares resolve to -1 rather than a plausible index', () => {
  for (const bad of ['', 'a', 'a9', 'i1', 'zz', '11', null, undefined, 42, 'e4 ']) {
    assert.equal(squareToIndex(/** @type {any} */ (bad)), -1, `${bad}`);
  }
});

test('FEN round-trips byte-identically', () => {
  const corpus = [
    STARTING_FEN,
    '8/8/8/8/8/8/8/8 w - - 0 1',
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3',
    '4k3/8/8/8/8/8/8/4K2R w K - 12 47',
  ];
  for (const fen of corpus) {
    assert.equal(toFen(parseFen(fen)), fen);
  }
});

test('castling rights are normalized to KQkq order', () => {
  assert.equal(parseFen('r3k2r/8/8/8/8/8/8/R3K2R w qkQK - 0 1').castling, 'KQkq');
  assert.equal(parseFen('r3k2r/8/8/8/8/8/8/R3K2R w qKQ - 0 1').castling, 'KQq');
});

test('a bare placement field is accepted with sensible defaults', () => {
  const position = parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  assert.equal(position.turn, 'w');
  assert.equal(position.fullmove, 1);
});

test('malformed FEN throws with a useful message rather than guessing', () => {
  const cases = [
    ['too few ranks', '8/8/8/8 w - - 0 1'],
    ['rank too short', 'rnbqkbnr/ppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['rank too long', 'rnbqkbnrr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['bad piece letter', 'xnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['bad side to move', '8/8/8/8/8/8/8/8 x - - 0 1'],
    ['bad castling field', '8/8/8/8/8/8/8/8 w XY - 0 1'],
    ['bad en passant square', '8/8/8/8/8/8/8/8 w - z9 0 1'],
    ['not a string', 42],
  ];
  for (const [label, fen] of cases) {
    assert.throws(() => parseFen(/** @type {any} */ (fen)), Error, label);
  }
});

test('en passant target appears after a double push and expires immediately', () => {
  const afterPush = parseFen(play(STARTING_FEN, 'e4'));
  assert.equal(indexToSquare(afterPush.ep), 'e3');

  const afterReply = parseFen(play(STARTING_FEN, 'e4', 'Nf6'));
  assert.equal(afterReply.ep, -1);
});

test('en passant capture removes the pawn beside the target, not on it', () => {
  // White pawn e5, black plays d7-d5, white captures exd6 e.p.
  const fen = play('rnbqkbnr/pppppppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 'd5', 'exd6');
  const position = parseFen(fen);
  assert.equal(position.board[squareToIndex('d6')], 'wP');
  assert.equal(position.board[squareToIndex('d5')], null, 'captured pawn removed');
});

test('castling relocates the rook and clears both rights', () => {
  const kingside = parseFen(play('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'O-O'));
  assert.equal(kingside.board[squareToIndex('g1')], 'wK');
  assert.equal(kingside.board[squareToIndex('f1')], 'wR');
  assert.equal(kingside.board[squareToIndex('h1')], null);
  assert.equal(kingside.castling, '');

  const queenside = parseFen(play('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'O-O-O'));
  assert.equal(queenside.board[squareToIndex('c1')], 'wK');
  assert.equal(queenside.board[squareToIndex('d1')], 'wR');
  assert.equal(queenside.board[squareToIndex('a1')], null);
});

test('castling rights are lost by moving the rook', () => {
  assert.equal(parseFen(play('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'Rb1')).castling, 'K');
  assert.equal(parseFen(play('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'Rg1')).castling, 'Q');
});

test('castling rights are lost when a rook is captured on its home square', () => {
  // A bishop takes the h8 rook, so only black's kingside right is affected —
  // nothing white owns has moved.
  const byBishop = parseFen(play('r3k2r/8/8/8/8/8/8/B3K3 w kq - 0 1', 'Bxh8'));
  assert.equal(byBishop.castling, 'q');

  // When a rook does the capturing, both sides lose a right: black's because
  // its rook died on a8, white's because its own rook left a1.
  const byRook = parseFen(play('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'Rxa8+'));
  assert.equal(byRook.castling, 'Kk');
});

test('promotion places the chosen piece, and underpromotion is honored', () => {
  for (const [san, expected] of [['a8=Q', 'wQ'], ['a8=R', 'wR'], ['a8=B', 'wB'], ['a8=N', 'wN']]) {
    const after = parseFen(play('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', san));
    assert.equal(after.board[squareToIndex('a8')], expected, san);
  }
});

test('the halfmove clock resets on pawn moves and captures, and counts otherwise', () => {
  assert.equal(parseFen(play('4k3/7p/5n2/8/8/8/8/4K2R w K - 9 40', 'Rh3')).halfmove, 10);
  assert.equal(parseFen(play('4k3/7p/5n2/8/8/8/8/4K2R w K - 9 40', 'Rxh7')).halfmove, 0);
  assert.equal(parseFen(play(STARTING_FEN, 'e4')).halfmove, 0);
});

test('the fullmove number advances only after black moves', () => {
  assert.equal(parseFen(play(STARTING_FEN, 'e4')).fullmove, 1);
  assert.equal(parseFen(play(STARTING_FEN, 'e4', 'e5')).fullmove, 2);
});

test('applyMove does not mutate the position it was given', () => {
  const before = parseFen(STARTING_FEN);
  const snapshot = toFen(before);
  applyMove(before, moveFromSan(before, 'e4'));
  assert.equal(toFen(before), snapshot);
});
