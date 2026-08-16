/**
 * Whole-game replays.
 *
 * A complete master game exercises more of the resolver in one pass than a pile
 * of synthetic positions: dozens of quiet moves, captures, castling, checks, and
 * disambiguations, each one resolved against a position produced by the move
 * before it. If anything drifts, the game stops resolving partway through.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePgn } from '../src/pgn.js';
import { parseFen } from '../src/position.js';
import { isCheckmate, moveFromSan, moveToSan } from '../src/san.js';

const OPERA_GAME = `
[Event "Paris Opera"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7
8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7
14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0
`;

const IMMORTAL_GAME = `
[Event "London"]
[Date "1851.06.21"]
[White "Adolf Anderssen"]
[Black "Lionel Kieseritzky"]
[Result "1-0"]

1.e4 e5 2.f4 exf4 3.Bc4 Qh4+ 4.Kf1 b5 5.Bxb5 Nf6 6.Nf3 Qh6 7.d3 Nh5
8.Nh4 Qg5 9.Nf5 c6 10.g4 Nf6 11.Rg1 cxb5 12.h4 Qg6 13.h5 Qg5 14.Qf3 Ng8
15.Bxf4 Qf6 16.Nc3 Bc5 17.Nd5 Qxb2 18.Bd6 Bxg1 19.e5 Qxa1+ 20.Ke2 Na6
21.Nxg7+ Kd8 22.Qf6+ Nxf6 23.Be7# 1-0
`;

const GAMES = [
  { name: 'Morphy — Opera Game, 1858', pgn: OPERA_GAME, plies: 33, mate: 'Rd8#' },
  { name: 'Anderssen — Immortal Game, 1851', pgn: IMMORTAL_GAME, plies: 45, mate: 'Be7#' },
];

for (const { name, pgn, plies, mate } of GAMES) {
  test(`${name}: every move resolves`, () => {
    const game = parsePgn(pgn);
    assert.deepEqual(game.errors, [], 'no move should fail to resolve');
    assert.equal(game.moves.length, plies);
    assert.equal(game.result, '1-0');
  });

  test(`${name}: ends in the checkmate the score claims`, () => {
    const game = parsePgn(pgn);
    const final = game.moves[game.moves.length - 1];
    assert.equal(final.san, mate);

    const position = parseFen(final.fen);
    assert.ok(isCheckmate(position, position.turn), 'final position must be mate');
  });

  test(`${name}: every move re-serializes to the notation it was read from`, () => {
    const game = parsePgn(pgn);
    let position = parseFen(game.startFen);

    for (const record of game.moves) {
      const move = moveFromSan(position, record.san);
      assert.ok(move, `could not re-resolve ${record.san}`);
      // Independently derived in both directions: the resolver picked this move
      // from the notation, and the serializer must produce that notation back.
      assert.equal(moveToSan(position, move), record.san);
      position = parseFen(record.fen);
    }
  });

  test(`${name}: recorded positions follow from the recorded moves`, () => {
    const game = parsePgn(pgn);
    game.moves.forEach((record, index) => {
      const position = parseFen(record.fen);
      assert.equal(position.turn, index % 2 === 0 ? 'b' : 'w', `ply ${record.ply}`);
      assert.equal(record.ply, index + 1);
    });
  });
}

test('the Opera Game castles queenside at move 12', () => {
  const game = parsePgn(OPERA_GAME);
  const castle = game.moves.find((move) => move.castle);
  assert.equal(castle.san, 'O-O-O');
  assert.equal(castle.castle, 'q');
  assert.equal(castle.from, 'e1');
  assert.equal(castle.to, 'c1');
});

test('a game with en passant and promotion replays correctly', () => {
  // 3.exd6 is en passant; the surviving pawn then walks to c7 and takes the
  // knight still sitting on b8, underpromoting.
  const game = parsePgn('1. e4 Nf6 2. e5 d5 3. exd6 e6 4. dxc7 Be7 5. cxb8=N');
  assert.deepEqual(game.errors, []);

  const enPassant = game.moves[4];
  assert.equal(enPassant.san, 'exd6');
  assert.equal(enPassant.to, 'd6');
  assert.equal(enPassant.captured, 'bP', 'the pawn beside the target is taken');
  assert.equal(parseFen(enPassant.fen).board[35], null, 'd5 is emptied, not d6');

  const underpromotion = game.moves[8];
  assert.equal(underpromotion.san, 'cxb8=N');
  assert.equal(underpromotion.promotion, 'n');
  assert.equal(underpromotion.captured, 'bN');
  assert.equal(parseFen(underpromotion.fen).board[57], 'wN', 'a knight now stands on b8');
});
