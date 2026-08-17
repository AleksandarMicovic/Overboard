/**
 * Proves the hand-written index.d.ts matches the implementation. Type-checked
 * by `npm run typecheck`; never executed and never published.
 */

import { Overboard } from '../src/overboard.js';
import type { Move, Overboard as Declared } from '../index.js';
import type { PgnMove } from '../src/pgn.js';

// One assignment covers the constructor signature, the instance shape, and
// every static in one go.
const conforms: typeof Declared = Overboard;
void conforms;

// The record the implementation actually produces must satisfy the published
// Move type.
declare const produced: PgnMove;
const published: Move = produced;
void published;
