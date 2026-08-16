/**
 * Move resolution and Standard Algebraic Notation.
 *
 * Perft (see perft.test.js) already proves the move generator counts correctly.
 * These tests cover the layer above it: turning notation into a specific move
 * and back again, which is where a viewer silently shows the wrong board.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { STARTING_FEN, applyMove, indexToSquare, parseFen } from '../src/position.js';
import {
  findPins,
  isCheck,
  isCheckmate,
  isStalemate,
  legalMoves,
  moveFromCoordinates,
  moveFromSan,
  moveToSan,
  stripSan,
} from '../src/san.js';

/** Resolve SAN and return the origin square, or null. */
function originOf(fen, san) {
  const move = moveFromSan(parseFen(fen), san);
  return move ? indexToSquare(move.from) : null;
}

/* ------------------------------------------------------------------ pins */

// Two white knights can geometrically reach f3, but the d2 knight is pinned to
// the king by the bishop on a5. PGN therefore writes a bare "Nf3", and only a
// resolver that filters by king safety picks the right knight. This is the case
// that justifies legality filtering existing at all.
const PINNED_KNIGHT = '4k3/8/8/b7/3N4/8/3N4/4K3 w - - 0 1';

test('bare SAN resolves correctly when a rival piece is pinned', () => {
  assert.equal(originOf(PINNED_KNIGHT, 'Nf3'), 'd4');
});

test('the pinned knight has no legal moves at all', () => {
  const moves = legalMoves(parseFen(PINNED_KNIGHT))
    .filter((move) => indexToSquare(move.from) === 'd2');
  assert.equal(moves.length, 0);
});

test('serializing that move produces the bare SAN a real PGN would contain', () => {
  const position = parseFen(PINNED_KNIGHT);
  const move = moveFromSan(position, 'Nf3');
  assert.equal(moveToSan(position, move), 'Nf3');
});

test('without the pin the same notation is genuinely ambiguous', () => {
  // Same position, bishop removed: both knights can legally reach f3.
  const unpinned = '4k3/8/8/8/3N4/8/3N4/4K3 w - - 0 1';
  assert.equal(originOf(unpinned, 'Nf3'), null, 'ambiguous SAN must not guess');
  assert.equal(originOf(unpinned, 'N4f3'), 'd4');
  assert.equal(originOf(unpinned, 'N2f3'), 'd2');
});

test('findPins reports the pinned piece and its pinner', () => {
  const pins = findPins(parseFen(PINNED_KNIGHT), 'w');
  assert.equal(pins.length, 1);
  assert.equal(pins[0].square, 'd2');
  assert.equal(pins[0].piece, 'wN');
  assert.equal(pins[0].by, 'a5');
});

test('two friendly pieces on the same ray are not a pin', () => {
  // Knights on d2 and c3 both sit between the king and the bishop.
  assert.equal(findPins(parseFen('4k3/8/8/b7/8/2N5/3N4/4K3 w - - 0 1'), 'w').length, 0);
});

/* -------------------------------------------------------- disambiguation */

test('disambiguation by file', () => {
  const fen = '4k3/8/8/8/4K3/8/8/R6R w - - 0 1';
  assert.equal(originOf(fen, 'Rad1'), 'a1');
  assert.equal(originOf(fen, 'Rhd1'), 'h1');
  assert.equal(originOf(fen, 'Rd1'), null, 'ambiguous without the file');
});

test('disambiguation by rank', () => {
  const fen = '4k3/8/8/8/8/8/R7/R3K3 w - - 0 1';
  assert.equal(originOf(fen, 'R1a3'), null, 'a1 rook is blocked by its own rook');
  assert.equal(originOf(fen, 'Ra3'), 'a2');
});

test('disambiguation falling back to the full origin square', () => {
  // Three queens reach e1: a1 is unique by rank, e5 by file, and a5 by neither.
  const fen = '2k5/8/8/Q3Q3/8/8/8/Q6K w - - 0 1';
  const position = parseFen(fen);

  const sans = legalMoves(position)
    .filter((move) => indexToSquare(move.to) === 'e1' && move.piece === 'wQ')
    .map((move) => `${indexToSquare(move.from)}:${moveToSan(position, move)}`)
    .sort();

  assert.deepEqual(sans, ['a1:Q1e1', 'a5:Qa5e1', 'e5:Qee1']);
  assert.equal(originOf(fen, 'Qa5e1'), 'a5');
});

/* --------------------------------------------------------- en passant */

test('en passant that would expose your own king is rejected', () => {
  // After bxc6 e.p. both pawns leave rank 5, opening the rook's line to the king.
  const fen = '8/8/8/KPp4r/8/8/8/7k w - c6 0 1';
  assert.equal(originOf(fen, 'bxc6'), null);
  assert.equal(
    legalMoves(parseFen(fen)).some((move) => indexToSquare(move.to) === 'c6'),
    false,
  );
});

test('the same capture is legal once the rook is gone', () => {
  assert.equal(originOf('8/8/8/KPp5/8/8/8/7k w - c6 0 1', 'bxc6'), 'b5');
});

/* --------------------------------------------------- check and mate state */

test('check, checkmate, and stalemate are detected', () => {
  const foolsMate = parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  assert.ok(isCheck(foolsMate, 'w'));
  assert.ok(isCheckmate(foolsMate, 'w'));
  assert.ok(!isStalemate(foolsMate, 'w'));

  const stalemate = parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.ok(!isCheck(stalemate, 'b'));
  assert.ok(isStalemate(stalemate, 'b'));
  assert.ok(!isCheckmate(stalemate, 'b'));

  assert.ok(!isCheck(parseFen(STARTING_FEN), 'w'));
});

test('SAN carries + for check and # for mate', () => {
  // After 1.f3 e5 2.g4 — the black queen is still on d8 and mates via h4.
  const position = parseFen('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2');
  const mate = moveFromSan(position, 'Qh4');
  assert.equal(moveToSan(position, mate), 'Qh4#');

  const checking = parseFen('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  assert.equal(moveToSan(checking, moveFromSan(checking, 'Rh8')), 'Rh8+');
});

/* --------------------------------------------------------- notation forms */

test('castling is accepted in both letter and digit spellings', () => {
  const fen = '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1';
  for (const san of ['O-O', '0-0']) {
    assert.equal(moveFromSan(parseFen(fen), san).castle, 'k', san);
  }
  for (const san of ['O-O-O', '0-0-0']) {
    assert.equal(moveFromSan(parseFen(fen), san).castle, 'q', san);
  }
});

test('promotion notation resolves with and without the equals sign', () => {
  const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
  assert.equal(moveFromSan(parseFen(fen), 'a8=Q').promotion, 'q');
  assert.equal(moveFromSan(parseFen(fen), 'a8Q').promotion, 'q');
  assert.equal(moveFromSan(parseFen(fen), 'a8=N').promotion, 'n');
});

test('stripSan separates the move from its decorations', () => {
  assert.deepEqual(stripSan('Nf3'),
    { core: 'Nf3', notation: 'Nf3', check: false, mate: false, suffix: '' });
  assert.deepEqual(stripSan('Qxh7+'),
    { core: 'Qxh7', notation: 'Qxh7+', check: true, mate: false, suffix: '' });
  assert.deepEqual(stripSan('Rd8#'),
    { core: 'Rd8', notation: 'Rd8#', check: false, mate: true, suffix: '' });
  assert.deepEqual(stripSan('Nf3!!'),
    { core: 'Nf3', notation: 'Nf3', check: false, mate: false, suffix: '!!' });
  assert.deepEqual(stripSan('e4?!'),
    { core: 'e4', notation: 'e4', check: false, mate: false, suffix: '?!' });
  // The check mark survives an annotation suffix written after it.
  assert.deepEqual(stripSan('Qb8+!!'),
    { core: 'Qb8', notation: 'Qb8+', check: true, mate: false, suffix: '!!' });
});

test('decorated SAN still resolves', () => {
  assert.equal(originOf(STARTING_FEN, 'e4!!'), 'e2');
  assert.equal(originOf(STARTING_FEN, 'Nf3?!'), 'g1');
});

/* ------------------------------------------------------- coordinate moves */

test('coordinate moves resolve, and default promotion to a queen', () => {
  const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
  assert.equal(moveFromCoordinates(parseFen(fen), 'a7', 'a8').promotion, 'q');
  assert.equal(moveFromCoordinates(parseFen(fen), 'a7', 'a8', 'n').promotion, 'n');
  assert.equal(moveFromCoordinates(parseFen(STARTING_FEN), 'e2', 'e4').to, 28);
});

/* ------------------------------------------------------ failure behavior */

test('unresolvable notation returns null instead of throwing', () => {
  const position = parseFen(STARTING_FEN);
  const rubbish = [
    '', '   ', 'xyz', 'e9', 'Ke2', 'Nf6', 'O-O', 'Qxd8', 'e5', '!!', 'z1z2',
    'Rxx4', '12345', null, undefined, 42, {}, [],
  ];
  for (const san of rubbish) {
    assert.doesNotThrow(() => moveFromSan(position, /** @type {any} */ (san)), `${san}`);
    assert.equal(moveFromSan(position, /** @type {any} */ (san)), null, `${san}`);
  }
});

test('coordinate moves reject nonsense without throwing', () => {
  const position = parseFen(STARTING_FEN);
  for (const [from, to] of [['e2', 'e5'], ['e4', 'e5'], ['zz', 'e4'], ['e2', ''], ['', '']]) {
    assert.equal(moveFromCoordinates(position, from, to), null, `${from}-${to}`);
  }
});

/* -------------------------------------------------- round-trip property */

test('every legal move round-trips through SAN, in many positions', () => {
  const corpus = [
    STARTING_FEN,
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
    '2k5/8/8/Q3Q3/8/8/8/Q6K w - - 0 1',
  ];

  let checked = 0;
  for (const fen of corpus) {
    const position = parseFen(fen);
    for (const move of legalMoves(position)) {
      const san = moveToSan(position, move);
      const resolved = moveFromSan(position, san);
      assert.ok(resolved, `"${san}" did not resolve in ${fen}`);
      assert.equal(resolved.from, move.from, `${san} origin`);
      assert.equal(resolved.to, move.to, `${san} destination`);
      assert.equal(resolved.promotion ?? null, move.promotion ?? null, `${san} promotion`);
      checked++;
    }
  }
  // Exact, so that a generator regression that quietly drops moves fails here
  // too. Six of these positions have perft-verified move counts (20 + 48 + 14 +
  // 6 + 44 + 46 = 178); the three-queen position supplies the remaining 56.
  assert.equal(checked, 234);
});

test('round-trip holds two plies deep from the opening', () => {
  const root = parseFen(STARTING_FEN);
  let checked = 0;
  for (const first of legalMoves(root)) {
    const after = applyMove(root, first);
    for (const second of legalMoves(after)) {
      const san = moveToSan(after, second);
      const resolved = moveFromSan(after, san);
      assert.ok(resolved, `"${san}" failed after ${moveToSan(root, first)}`);
      assert.equal(resolved.from, second.from);
      assert.equal(resolved.to, second.to);
      checked++;
    }
  }
  assert.equal(checked, 400);
});
