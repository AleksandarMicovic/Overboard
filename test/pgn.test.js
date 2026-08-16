/** PGN scanning: tag pairs, comments, NAGs, variations, and malformed input. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { NAG_LABELS, parsePgn } from '../src/pgn.js';
import { STARTING_FEN } from '../src/position.js';

const sans = (game) => game.moves.map((move) => move.san);

test('tag pairs are read, including escaped quotes', () => {
  const game = parsePgn(`
    [Event "Casual \\"Blitz\\" game"]
    [White "Alice"]
    [Black "Bob"]
    [Result "1/2-1/2"]

    1. e4 e5 1/2-1/2
  `);
  assert.equal(game.headers.Event, 'Casual "Blitz" game');
  assert.equal(game.headers.White, 'Alice');
  assert.equal(game.result, '1/2-1/2');
  assert.deepEqual(sans(game), ['e4', 'e5']);
});

test('move numbers glued to moves are handled', () => {
  assert.deepEqual(sans(parsePgn('1.e4 e5 2.Nf3 Nc6 3.Bb5')), ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
});

test('black-to-move continuation dots are not mistaken for moves', () => {
  assert.deepEqual(sans(parsePgn('1... e5 2. Nf3')), []);
  assert.deepEqual(sans(parsePgn('1. e4 1... e5 2. Nf3')), ['e4', 'e5', 'Nf3']);
});

test('brace comments attach to the preceding move', () => {
  const game = parsePgn('1. e4 {King\'s pawn} e5 {Symmetrical} 2. Nf3');
  assert.equal(game.moves[0].comment, "King's pawn");
  assert.equal(game.moves[1].comment, 'Symmetrical');
  assert.equal(game.moves[2].comment, undefined);
});

test('a comment before the first move becomes the game comment', () => {
  const game = parsePgn('{Annotated by hand} 1. e4 e5');
  assert.equal(game.comment, 'Annotated by hand');
  assert.equal(game.moves[0].comment, undefined);
});

test('semicolon comments run to the end of the line', () => {
  const game = parsePgn('1. e4 ; a rest-of-line note\n e5 2. Nf3');
  assert.equal(game.moves[0].comment, 'a rest-of-line note');
  assert.deepEqual(sans(game), ['e4', 'e5', 'Nf3']);
});

test('NAGs become both a number and a readable label', () => {
  const game = parsePgn('1. e4 $1 e5 $3 2. Nf3 $4');
  assert.deepEqual(game.moves[0].annotation, NAG_LABELS[1]);
  assert.equal(game.moves[1].annotation.label, 'brilliant');
  assert.equal(game.moves[1].nag, 3);
  assert.equal(game.moves[2].annotation.label, 'blunder');
});

test('annotation suffixes written into SAN mean the same thing', () => {
  const game = parsePgn('1. e4! e5?? 2. Nf3!? Nc6?!');
  assert.deepEqual(
    game.moves.map((move) => move.annotation.label),
    ['good', 'blunder', 'interesting', 'dubious'],
  );
  // The suffix is not kept in the move's own notation.
  assert.deepEqual(sans(game), ['e4', 'e5', 'Nf3', 'Nc6']);
});

test('an unrecognized NAG is kept as a number without inventing a label', () => {
  const game = parsePgn('1. e4 $42');
  assert.equal(game.moves[0].nag, 42);
  assert.equal(game.moves[0].annotation, undefined);
});

test('variations are skipped, including nested ones', () => {
  const game = parsePgn('1. e4 (1. d4 d5 (1... Nf6 2. c4) 2. c4) 1... e5 2. Nf3');
  assert.deepEqual(sans(game), ['e4', 'e5', 'Nf3']);
});

test('comments inside a variation do not leak onto mainline moves', () => {
  const game = parsePgn('1. e4 (1. d4 {Queen\'s pawn} d5) e5');
  assert.equal(game.moves[0].comment, undefined);
  assert.deepEqual(sans(game), ['e4', 'e5']);
});

test('a FEN header sets the starting position', () => {
  const game = parsePgn(`
    [SetUp "1"]
    [FEN "4k3/P7/8/8/8/8/8/4K3 w - - 0 1"]

    1. a8=Q+ Kf7
  `);
  assert.equal(game.startFen, '4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  assert.deepEqual(sans(game), ['a8=Q+', 'Kf7']);
  assert.equal(game.moves[0].promotion, 'q');
});

test('a broken FEN header falls back to the standard start and says so', () => {
  const game = parsePgn('[FEN "not a fen"]\n\n1. e4');
  assert.equal(game.startFen, STARTING_FEN);
  assert.equal(game.errors.length, 1);
  assert.deepEqual(sans(game), ['e4']);
});

test('each move records the position that follows it', () => {
  const game = parsePgn('1. e4 e5');
  assert.match(game.moves[0].fen, /^rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b/);
  assert.match(game.moves[1].fen, /^rnbqkbnr\/pppp1ppp\/8\/4p3\/4P3\/8\/PPPP1PPP\/RNBQKBNR w/);
});

test('moves carry their origin, destination, and captured piece', () => {
  const game = parsePgn('1. e4 d5 2. exd5');
  assert.deepEqual(
    { from: game.moves[2].from, to: game.moves[2].to, captured: game.moves[2].captured },
    { from: 'e4', to: 'd5', captured: 'bP' },
  );
});

/* ------------------------------------------------------ malformed input */

test('an illegal move stops parsing and is reported, keeping what came before', () => {
  // No white knight can reach f6: b1 covers a3/c3/d2 and g1 covers e2/f3/h3.
  const game = parsePgn('1. e4 e5 2. Nf6 Nc6 3. Nf3');
  assert.deepEqual(sans(game), ['e4', 'e5']);
  assert.equal(game.errors.length, 1);
  assert.match(game.errors[0], /Nf6/);
});

test('unbalanced braces and parentheses terminate instead of hanging', () => {
  assert.deepEqual(sans(parsePgn('1. e4 {unterminated comment e5 2. Nf3')), ['e4']);
  assert.deepEqual(sans(parsePgn('1. e4 (1. d4 e5 2. Nf3')), ['e4']);
  assert.deepEqual(sans(parsePgn('1. e4 ) e5')), ['e4', 'e5']);
});

test('empty and junk input produce an empty game rather than an error', () => {
  for (const input of ['', '   ', '\n\n', '*', '[Event "x"]']) {
    const game = parsePgn(input);
    assert.deepEqual(game.moves, [], JSON.stringify(input));
  }
});

test('a non-string PGN is rejected outright', () => {
  for (const input of [null, undefined, 42, {}]) {
    assert.throws(() => parsePgn(/** @type {any} */ (input)));
  }
});

test('headers appearing after movetext are not absorbed as tags', () => {
  const game = parsePgn('[White "Alice"]\n\n1. e4 e5\n\n[Event "second game"]');
  assert.equal(game.headers.White, 'Alice');
  assert.equal(game.headers.Event, undefined);
});
