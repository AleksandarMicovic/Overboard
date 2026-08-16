/**
 * Perft — the decisive test for move generation.
 *
 * Perft counts leaf nodes of the legal-move tree to a fixed depth. The counts
 * below are the long-published reference values for the six standard test
 * positions, which between them cover every rule that is easy to get subtly
 * wrong: castling rights lost by rook capture, en passant that would expose
 * one's own king, promotion under capture, and pins along every ray.
 *
 * A single wrong rule shows up here as a count mismatch, which is why this
 * suite is worth more than any number of hand-written position assertions.
 *
 * This is a TEST-ONLY harness. It counts moves; it does not search, evaluate,
 * or choose. Nothing here ships in the library.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseFen, applyMove } from '../src/position.js';
import { legalMoves } from '../src/san.js';

/**
 * @param {import('../src/position.js').Position} position
 * @param {number} depth
 * @returns {number}
 */
function perft(position, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(position);
  if (depth === 1) return moves.length;

  let nodes = 0;
  for (const move of moves) {
    nodes += perft(applyMove(position, move), depth - 1);
  }
  return nodes;
}

/** The six standard positions, with reference counts by depth. */
const POSITIONS = [
  {
    name: 'initial position',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    counts: [20, 400, 8902, 197281],
  },
  {
    name: 'kiwipete',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    counts: [48, 2039, 97862],
  },
  {
    name: 'position 3 (endgame, en passant heavy)',
    fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    counts: [14, 191, 2812, 43238],
  },
  {
    name: 'position 4 (promotion under capture)',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    counts: [6, 264, 9467],
  },
  {
    name: 'position 5',
    fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    counts: [44, 1486, 62379],
  },
  {
    name: 'position 6',
    fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
    counts: [46, 2079, 89890],
  },
];

for (const { name, fen, counts } of POSITIONS) {
  test(`perft: ${name}`, () => {
    const position = parseFen(fen);
    counts.forEach((expected, index) => {
      const depth = index + 1;
      assert.equal(perft(position, depth), expected, `depth ${depth}`);
    });
  });
}
