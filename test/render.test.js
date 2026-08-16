/**
 * Board geometry.
 *
 * `squareToXY` is the one piece of rendering that can be wrong in a way that
 * still looks like a chess board — a flipped rank or a mirrored file produces a
 * plausible picture of the wrong position. It is pure, so it is tested here
 * exhaustively rather than by driving a browser.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { squareToXY } from '../src/render.js';
import { indexToSquare } from '../src/position.js';

test('the corners land where a player sitting behind white would expect', () => {
  assert.deepEqual(squareToXY('a8', 'white'), { x: 0, y: 0 }, 'top-left');
  assert.deepEqual(squareToXY('h8', 'white'), { x: 7, y: 0 }, 'top-right');
  assert.deepEqual(squareToXY('a1', 'white'), { x: 0, y: 7 }, 'bottom-left');
  assert.deepEqual(squareToXY('h1', 'white'), { x: 7, y: 7 }, 'bottom-right');
});

test('flipping the board rotates it by 180 degrees', () => {
  assert.deepEqual(squareToXY('a8', 'black'), { x: 7, y: 7 });
  assert.deepEqual(squareToXY('h8', 'black'), { x: 0, y: 7 });
  assert.deepEqual(squareToXY('a1', 'black'), { x: 7, y: 0 });
  assert.deepEqual(squareToXY('h1', 'black'), { x: 0, y: 0 });
});

test('every square maps to a distinct cell in both orientations', () => {
  for (const orientation of /** @type {const} */ (['white', 'black'])) {
    const seen = new Set();
    for (let index = 0; index < 64; index++) {
      const { x, y } = squareToXY(indexToSquare(index), orientation);
      assert.ok(x >= 0 && x < 8 && y >= 0 && y < 8, `${indexToSquare(index)} in range`);
      seen.add(`${x},${y}`);
    }
    assert.equal(seen.size, 64, `${orientation}: all 64 cells covered`);
  }
});

test('the two orientations are exact opposites of one another', () => {
  for (let index = 0; index < 64; index++) {
    const square = indexToSquare(index);
    const white = squareToXY(square, 'white');
    const black = squareToXY(square, 'black');
    assert.equal(white.x + black.x, 7, `${square} x`);
    assert.equal(white.y + black.y, 7, `${square} y`);
  }
});

test('indices are accepted as well as square names', () => {
  for (let index = 0; index < 64; index++) {
    assert.deepEqual(squareToXY(index), squareToXY(indexToSquare(index)));
  }
});

test('white defaults when no orientation is given', () => {
  assert.deepEqual(squareToXY('a1'), squareToXY('a1', 'white'));
});

test('a1 is a dark square and h1 is light, in both orientations', () => {
  // The checkerboard is painted by CSS from the cell parity, so if this drifts
  // the board renders with the wrong squares colored.
  const parity = (square, orientation) => {
    const { x, y } = squareToXY(square, orientation);
    return (x + y) % 2;
  };
  for (const orientation of /** @type {const} */ (['white', 'black'])) {
    assert.equal(parity('a1', orientation), 1, `a1 dark (${orientation})`);
    assert.equal(parity('h1', orientation), 0, `h1 light (${orientation})`);
    assert.equal(parity('a8', orientation), 0, `a8 light (${orientation})`);
    assert.equal(parity('h8', orientation), 1, `h8 dark (${orientation})`);
  }
});

test('a square outside the board is rejected rather than drawn off-screen', () => {
  for (const bad of ['', 'z9', 'a0', 'i4', -1, 64, 999]) {
    assert.throws(() => squareToXY(/** @type {any} */ (bad)), `${bad}`);
  }
});
