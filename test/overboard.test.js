/**
 * The public API: options, accessors, playback, and events.
 *
 * Runs against the DOM stub in dom-stub.js so the whole suite stays
 * dependency-free. Visual behavior is checked by driving demo/index.html.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Overboard } from '../src/overboard.js';
import { STARTING_FEN } from '../src/position.js';
import { highlightsOf, makeDom, piecesOf } from './dom-stub.js';

/** A board on a fresh document. */
function makeBoard(options) {
  const { container } = makeDom();
  return new Overboard(container, options);
}

/** Collect every event a board emits, in order. */
function record(board, names) {
  const seen = [];
  for (const name of names) board.on(name, (payload) => seen.push([name, payload]));
  return seen;
}

const ALL_EVENTS = ['move', 'position', 'capture', 'promotion', 'castle',
  'check', 'checkmate', 'stalemate', 'annotation', 'error'];

const OPERA = `1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7
8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7
14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0`;

/* --------------------------------------------------------------- defaults */

test('a bare board starts from the initial position', () => {
  const board = makeBoard();
  assert.equal(board.fen, STARTING_FEN);
  assert.equal(piecesOf(board).length, 32);
  assert.equal(board.turn, 'w');
  assert.equal(board.ply, 0);
  assert.deepEqual(board.moves, []);
});

test('the documented defaults are the actual defaults', () => {
  const board = makeBoard();
  assert.equal(board.showCoordinates, false, 'coordinates off by default');
  assert.equal(board.orientation, 'white');
  assert.equal(board.boardTheme, 'brown');
  assert.equal(board.pieceTheme, 'classic');
  assert.equal(board.animation, 200);
  assert.equal(board.highlightLastMove, true);
});

test('the default board theme is brown over light brown', () => {
  const board = makeBoard();
  assert.equal(board.element.style.getPropertyValue('--ob-light'), '#f0d9b5');
  assert.equal(board.element.style.getPropertyValue('--ob-dark'), '#b58863');
});

test('options given at construction are applied', () => {
  const board = makeBoard({
    fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
    orientation: 'black',
    showCoordinates: true,
    boardTheme: 'green',
    pieceTheme: 'flat',
    animation: 0,
    highlightLastMove: false,
  });
  assert.equal(piecesOf(board).length, 2);
  assert.equal(board.orientation, 'black');
  assert.equal(board.showCoordinates, true);
  assert.equal(board.element.style.getPropertyValue('--ob-light'), '#eeeed2');
  assert.equal(board.pieceTheme, 'flat');
});

test('a missing container is an error, not a silent no-op', () => {
  assert.throws(() => new Overboard(null), /no element/);
});

/* -------------------------------------------------------------- accessors */

test('every option is also settable after construction', () => {
  const board = makeBoard();

  board.orientation = 'black';
  assert.equal(board.orientation, 'black');

  board.showCoordinates = true;
  assert.equal(board.showCoordinates, true);
  assert.equal(board.element.querySelectorAll('.ob-coords').length, 1);
  board.showCoordinates = false;
  assert.equal(board.element.querySelectorAll('.ob-coords').length, 0);

  board.boardTheme = 'ink';
  assert.equal(board.element.style.getPropertyValue('--ob-dark'), '#33373b');

  board.pieceTheme = 'flat';
  assert.equal(board.pieceTheme, 'flat');

  board.animation = 0;
  assert.equal(board.animation, 0);
});

test('a board theme can be given inline as two colors', () => {
  const board = makeBoard();
  board.boardTheme = { light: '#ffffff', dark: '#000000' };
  assert.equal(board.element.style.getPropertyValue('--ob-light'), '#ffffff');
  assert.equal(board.element.style.getPropertyValue('--ob-dark'), '#000000');
});

test('an unknown theme name falls back instead of blanking the board', () => {
  const board = makeBoard({ boardTheme: 'nope', pieceTheme: 'nope' });
  assert.equal(board.element.style.getPropertyValue('--ob-light'), '#f0d9b5');
  assert.equal(piecesOf(board).length, 32, 'pieces still render');
});

test('flip toggles orientation and returns the new one', () => {
  const board = makeBoard();
  assert.equal(board.flip(), 'black');
  assert.equal(board.flip(), 'white');
});

test('setting a FEN replaces the position and clears any loaded game', () => {
  const board = makeBoard();
  board.pgn = OPERA;
  board.last();
  board.fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
  assert.deepEqual(board.moves, []);
  assert.equal(board.ply, 0);
  assert.equal(piecesOf(board).length, 2);
  assert.deepEqual(highlightsOf(board), [], 'no stale highlight');
});

test('reset and clear do what they say', () => {
  const board = makeBoard();
  board.clear();
  assert.equal(piecesOf(board).length, 0);
  board.reset();
  assert.equal(board.fen, STARTING_FEN);
});

/* ------------------------------------------------------------------ moves */

test('move accepts algebraic notation', () => {
  const board = makeBoard();
  const move = board.move('e4');
  assert.equal(move.san, 'e4');
  assert.equal(move.from, 'e2');
  assert.equal(move.to, 'e4');
  assert.equal(board.ply, 1);
  assert.equal(board.turn, 'b');
});

test('move accepts coordinates, with promotion', () => {
  // A queen on a8 rakes the eighth rank, so the default promotion gives check.
  const board = makeBoard({ fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1' });
  assert.equal(board.move('a7', 'a8').san, 'a8=Q+');

  const other = makeBoard({ fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1' });
  assert.equal(other.move('a7', 'a8', 'n').san, 'a8=N');
});

test('an unresolvable move returns null and changes nothing', () => {
  const board = makeBoard();
  const before = board.fen;
  for (const bad of [['Nf6'], ['e2', 'e5'], ['zzz'], ['']]) {
    assert.equal(board.move(...bad), null, bad.join('-'));
  }
  assert.equal(board.fen, before);
  assert.equal(board.ply, 0);
});

test('the moved piece keeps its DOM node so it can animate', () => {
  const board = makeBoard();
  const before = board.element.querySelectorAll('.ob-piece').find((n) => n.dataset.square === 'e2');
  board.move('e4');
  const after = board.element.querySelectorAll('.ob-piece').find((n) => n.dataset.square === 'e4');
  assert.equal(before, after, 'same node, relocated');
});

test('the last move is highlighted, and the highlight can be turned off', () => {
  const board = makeBoard();
  board.move('e4');
  assert.deepEqual(highlightsOf(board).sort(), ['e2', 'e4']);
  board.highlightLastMove = false;
  assert.deepEqual(highlightsOf(board), []);
});

test('a move played mid-line replaces the rest of it', () => {
  const board = makeBoard();
  board.pgn = OPERA;
  board.goTo(4);
  assert.equal(board.moves.length, 33);
  board.move('Bc4');
  assert.equal(board.moves.length, 5);
  assert.equal(board.moves.at(-1).san, 'Bc4');
  assert.equal(board.ply, 5);
});

test('legalMoves lists the position, in notation', () => {
  const board = makeBoard();
  const moves = board.legalMoves();
  assert.equal(moves.length, 20);
  assert.ok(moves.includes('e4'));
  assert.ok(moves.includes('Nf3'));
});

/* --------------------------------------------------------------- playback */

test('a PGN loads, sits at the start, and steps through', () => {
  const board = makeBoard({ pgn: OPERA });
  assert.equal(board.moves.length, 33);
  assert.equal(board.ply, 0, 'starts at the beginning');
  assert.equal(board.fen, STARTING_FEN);

  board.next();
  assert.equal(board.ply, 1);
  assert.equal(board.moves[0].san, 'e4');

  board.last();
  assert.equal(board.ply, 33);
  assert.equal(board.moves.at(-1).san, 'Rd8#');

  board.prev();
  assert.equal(board.ply, 32);

  board.first();
  assert.equal(board.ply, 0);
  assert.equal(board.fen, STARTING_FEN);
});

test('playback clamps at both ends rather than running off', () => {
  const board = makeBoard({ pgn: '1. e4 e5' });
  board.prev();
  assert.equal(board.ply, 0);
  board.goTo(-5);
  assert.equal(board.ply, 0);
  board.goTo(999);
  assert.equal(board.ply, 2);
  board.next();
  assert.equal(board.ply, 2);
});

test('goTo reports whether it moved, and ply is a settable alias', () => {
  const board = makeBoard({ pgn: OPERA });
  assert.equal(board.goTo(10), true);
  assert.equal(board.goTo(10), false, 'already there');
  board.ply = 4;
  assert.equal(board.ply, 4);
});

test('jumping lands on exactly the position that move produced', () => {
  const board = makeBoard({ pgn: OPERA });
  board.goTo(12);
  const jumped = board.fen;

  const stepwise = makeBoard({ pgn: OPERA });
  for (let i = 0; i < 12; i++) stepwise.next();
  assert.equal(jumped, stepwise.fen);
});

test('PGN headers are exposed', () => {
  const board = makeBoard({ pgn: '[White "Alice"]\n[Black "Bob"]\n\n1. e4 e5' });
  assert.equal(board.headers.White, 'Alice');
  assert.equal(board.headers.Black, 'Bob');
});

test('the pgn getter reproduces a playable game', () => {
  const board = makeBoard({ pgn: OPERA });
  const out = board.pgn;
  assert.match(out, /^1\. ?e4 e5 2\. ?Nf3/);
  assert.match(out, /17\.Rd8#$|17\. Rd8#$/);

  // The strongest check: what comes out goes back in and produces the same line.
  const round = makeBoard({ pgn: out });
  assert.deepEqual(round.moves.map((m) => m.san), board.moves.map((m) => m.san));
});

test('moves and headers are copies, so callers cannot corrupt the board', () => {
  const board = makeBoard({ pgn: '[White "Alice"]\n\n1. e4 e5' });
  board.moves.push('junk');
  board.headers.White = 'Mallory';
  assert.equal(board.moves.length, 2);
  assert.equal(board.headers.White, 'Alice');
});

/* ----------------------------------------------------------------- events */

test('a move emits move, position, and capture', () => {
  const board = makeBoard({ fen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2' });
  const seen = record(board, ALL_EVENTS);
  board.move('exd5');

  assert.deepEqual(seen.map(([name]) => name), ['move', 'position', 'capture']);
  assert.equal(seen[0][1].san, 'exd5');
  assert.equal(seen[2][1].piece, 'bP');
  assert.equal(seen[2][1].square, 'd5');
});

test('en passant reports the square the pawn actually came off', () => {
  const board = makeBoard({ fen: 'rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3' });
  const seen = record(board, ['capture']);
  board.move('dxe3');
  assert.equal(seen[0][1].square, 'e4', 'not the destination');
  assert.equal(seen[0][1].piece, 'wP');
});

test('check and checkmate fire, in that order', () => {
  const board = makeBoard({
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2',
  });
  const seen = record(board, ALL_EVENTS);
  board.move('Qh4');

  const names = seen.map(([name]) => name);
  assert.deepEqual(names, ['move', 'position', 'check', 'checkmate']);
  assert.deepEqual(seen[2][1], { side: 'w', king: 'e1' });
  assert.deepEqual(seen[3][1], { winner: 'b' });
});

test('stalemate fires without a check', () => {
  const board = makeBoard({ fen: '7k/6Q1/8/8/8/8/8/K7 w - - 0 1' });
  const seen = record(board, ALL_EVENTS);
  board.move('Qg6');
  const names = seen.map(([name]) => name);
  assert.ok(names.includes('stalemate'), names.join(','));
  assert.ok(!names.includes('check'));
});

test('castling and promotion each announce themselves', () => {
  const castled = makeBoard({ fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1' });
  const castleSeen = record(castled, ALL_EVENTS);
  castled.move('O-O-O');
  assert.deepEqual(
    castleSeen.find(([name]) => name === 'castle')[1],
    { side: 'w', kingside: false },
  );

  const promoted = makeBoard({ fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1' });
  const promoSeen = record(promoted, ALL_EVENTS);
  promoted.move('a8=N');
  assert.deepEqual(
    promoSeen.find(([name]) => name === 'promotion')[1],
    { square: 'a8', piece: 'wN' },
  );
});

test('annotations surface as a readable label when stepping onto the move', () => {
  const board = makeBoard({ pgn: '1. e4 $3 e5?? 2. Nf3 $6' });
  const seen = record(board, ['annotation']);

  board.next();
  assert.deepEqual(seen[0][1], { symbol: '!!', label: 'brilliant', nag: 3, san: 'e4' });
  board.next();
  assert.equal(seen[1][1].label, 'blunder');
  board.next();
  assert.equal(seen[2][1].label, 'dubious');
});

test('rewinding does not re-fire the events of moves already seen', () => {
  const board = makeBoard({ pgn: OPERA });
  board.last();
  const seen = record(board, ['move', 'check', 'checkmate']);
  board.first();
  assert.deepEqual(seen, [], 'stepping backwards announces nothing');
});

test('pins are only computed when something is listening', () => {
  const pinned = '4k3/8/8/b7/3N4/8/3N4/4K3 w - - 0 1';

  const quiet = makeBoard({ fen: pinned });
  quiet.move('Nf3');  // No pin listener: must not throw, must not compute.

  const listening = makeBoard({ fen: pinned });
  const seen = record(listening, ['pin']);
  listening.move('Nf3');
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0][1].pinned, [{ square: 'd2', piece: 'wN', by: 'a5' }]);
});

test('a PGN that cannot be fully read reports an error event', () => {
  const board = makeBoard();
  const seen = record(board, ['error']);
  board.pgn = '1. e4 e5 2. Nf6';
  assert.equal(seen.length, 1);
  assert.match(seen[0][1].message, /Nf6/);
  assert.equal(board.moves.length, 2, 'the readable prefix is kept');
});

test('on returns an unsubscribe, and off removes listeners', () => {
  const board = makeBoard();
  let count = 0;
  const stop = board.on('move', () => { count++; });
  board.move('e4');
  stop();
  board.move('e5');
  assert.equal(count, 1);

  const listener = () => { count++; };
  board.on('move', listener);
  board.off('move', listener);
  board.move('Nf3');
  assert.equal(count, 1);

  board.on('move', () => { count++; });
  board.off('move');
  board.move('Nc6');
  assert.equal(count, 1, 'off with no listener clears them all');
});

test('a listener that throws does not take the board down', () => {
  const board = makeBoard();
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try {
    board.on('move', () => { throw new Error('listener exploded'); });
    let reached = false;
    board.on('move', () => { reached = true; });

    assert.doesNotThrow(() => board.move('e4'));
    assert.ok(reached, 'later listeners still run');
    assert.equal(board.ply, 1, 'the move still happened');
    assert.equal(errors.length, 1);
  } finally {
    console.error = original;
  }
});

test('on rejects a non-function listener rather than failing later', () => {
  const board = makeBoard();
  assert.throws(() => board.on('move', 'nope'), TypeError);
});

/* --------------------------------------------------------------- teardown */

test('destroy removes the board and stops events', () => {
  const { container } = makeDom();
  const board = new Overboard(container);
  assert.equal(container.children.length, 1);

  let fired = 0;
  board.on('position', () => { fired++; });
  board.destroy();

  assert.equal(container.children.length, 0);
  board.fen = STARTING_FEN;
  assert.equal(fired, 0);
});

/* ----------------------------------------------------------------- statics */

test('custom themes can be registered and used', () => {
  Overboard.registerBoardTheme('test-theme', { light: '#111111', dark: '#222222' });
  const board = makeBoard({ boardTheme: 'test-theme' });
  assert.equal(board.element.style.getPropertyValue('--ob-dark'), '#222222');

  const set = Object.fromEntries(
    ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP']
      .map((code) => [code, `<svg data-code="${code}"></svg>`]),
  );
  Overboard.registerPieceTheme('test-pieces', set);
  board.pieceTheme = 'test-pieces';
  assert.match(
    board.element.querySelectorAll('.ob-piece')[0].innerHTML,
    /data-code=/,
  );
});

test('an incomplete piece theme is rejected, naming what is missing', () => {
  assert.throws(
    () => Overboard.registerPieceTheme('broken', { wK: '<svg/>' }),
    /missing: wQ/,
  );
});

test('a board theme needs both colors', () => {
  assert.throws(() => Overboard.registerBoardTheme('bad', { light: '#fff' }), /dark/);
});
