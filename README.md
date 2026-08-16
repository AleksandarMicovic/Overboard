# Overboard

A modern, dependency-free chess board viewer. One file, no build step, no jQuery,
SVG pieces, and an API you can hold in your head.

Built for the three places a board usually needs to go: **Anki cards**, **a simple
viewer on a website**, and **streaming overlays** where a FEN or a game has to run
onto a board that looks good.

**Overboard is a viewer, not an engine.** It resolves and displays moves. It never
chooses one, evaluates a position, or suggests anything.

```js
const board = new Overboard('#board', { fen: 'start' });

board.move('e4');
board.orientation = 'black';
board.boardTheme = 'green';
```

## Install

Drop the single file in and go — this is the path for Anki and for plain HTML:

```html
<div id="board" style="width: 400px"></div>
<script src="overboard.js"></script>
<script>
  const board = new Overboard('#board', { fen: 'start' });
</script>
```

`dist/overboard.js` is fully self-contained: the piece SVGs and the CSS are inside
it. Nothing is fetched at runtime, which is why it works from `file://`, offline,
and inside an Anki card template.

As a module, with no build step:

```html
<script type="module">
  import Overboard from './src/overboard.js';
  const board = new Overboard('#board', { pgn: myPgn });
</script>
```

Or from npm: `npm install overboard`, then `import Overboard from 'overboard'`.

## Options

Everything can be passed at construction **or** set at any time afterwards as a
property. There is no separate setter to learn.

```js
const board = new Overboard('#board', {
  fen: 'start',        // FEN string, 'start', or 'empty'
  pgn: null,           // a PGN game; wins over `fen` if both are given
  orientation: 'white',
  showCoordinates: false,
  pieceTheme: 'classic',
  boardTheme: 'brown', // a name, or { light, dark }
  animation: 200,      // ms; 0 disables
  highlightLastMove: true,
});

board.showCoordinates = true;   // same option, later
board.animation = 0;
```

The board fills its container's width and is always square, so sizing is done in
CSS on the container. It resizes with the page on its own.

## Methods

```js
board.move('Nf3');            // algebraic
board.move('e2', 'e4');       // coordinates
board.move('e7', 'e8', 'n');  // underpromotion

board.first(); board.prev(); board.next(); board.last();
board.goTo(12);               // or: board.ply = 12

board.flip();
board.reset();                // starting position
board.clear();                // empty board
board.legalMoves();           // ['a3', 'a4', 'Nf3', ...]
board.destroy();
```

`move()` returns the move, or `null` if the notation didn't resolve to exactly one
legal move. It never throws — a viewer handed bad input should carry on.

Read-only: `board.fen`, `board.moves`, `board.headers`, `board.turn`, `board.ply`,
`board.element`.

## PGN

```js
board.pgn = `[White "Morphy"]

1.e4 e5 2.Nf3 d6 3.d4 Bg4 {The losing move.} 4.dxe5 Bxf3 $2 5.Qxf3 1-0`;

board.moves.length;        // 9
board.moves[5].san;        // 'Bxf3'
board.moves[4].comment;    // 'The losing move.'
board.moves[5].annotation; // { symbol: '?', label: 'mistake' }
board.headers.White;       // 'Morphy'
```

Tag pairs, `{...}` and `;` comments, NAGs, and results are all read. Variations
(`(...)`) are recognized and skipped — only the mainline is kept in v1.

Every move stores the position that follows it, so `goTo(n)` is a jump, not a
replay. Scrubbing a long game is instant.

If a move can't be resolved, parsing stops there, everything before it is kept,
and an `error` event fires with the offending notation.

## Themes

A board theme is two colors, and switching one writes two CSS custom properties —
no re-render:

```js
board.boardTheme = 'wood';
board.boardTheme = { light: '#f0f0f0', dark: '#5a7d9a' };

Overboard.registerBoardTheme('midnight', { light: '#8b93a8', dark: '#2c3244' });
```

Built in: `brown` (default), `wood`, `blue`, `green`, `slate`, `ink`, `rose`.

Pieces are SVG. Two sets ship — `classic` (outlined, Staunton-derived) and `flat`
(geometric, reads well at small sizes) — and a custom set is just twelve strings:

```js
Overboard.registerPieceTheme('mine', {
  wK: '<svg viewBox="0 0 45 45">…</svg>',
  wQ: '…', /* wR wB wN wP bK bQ bR bB bN bP */
});
board.pieceTheme = 'mine';
```

Both bundled sets were drawn for this project, so Overboard carries no third-party
asset licenses.

## Events

```js
board.on('check', ({ side, king }) => { /* … */ });
```

| Event | Payload |
| --- | --- |
| `move` | the move object |
| `position` | `{ fen, ply }` — any position change, including `board.fen = …` |
| `capture` | `{ square, piece }` — `square` is where the piece actually stood, which differs from the destination on en passant |
| `promotion` | `{ square, piece }` |
| `castle` | `{ side, kingside }` |
| `check` | `{ side, king }` |
| `checkmate` | `{ winner }` |
| `stalemate` | `{}` |
| `annotation` | `{ symbol, label, nag, san }` |
| `pin` | `{ pinned: [{ square, piece, by }] }` |
| `error` | `{ message }` |

`on()` returns an unsubscribe function. A listener that throws is reported to the
console and does not disturb the board or the listeners after it.

Events fire when a move is played and when you step *forward* through a game.
Stepping backwards is silent, so rewinding past a checkmate doesn't re-announce it.
Jumping straight to a ply announces only that ply.

Pin detection costs a scan per piece and nothing else needs it, so it only runs
when a `pin` listener is registered.

Annotations come from PGN NAGs and from suffixes written into the notation
(`Nf3!!` and `$3` mean the same thing):

| NAG | Symbol | Label |
| --- | --- | --- |
| `$1` | `!` | good |
| `$2` | `?` | mistake |
| `$3` | `!!` | brilliant |
| `$4` | `??` | blunder |
| `$5` | `!?` | interesting |
| `$6` | `?!` | dubious |

The event system is there to be built on. A board that flinches when a king is
attacked is three lines:

```js
board.on('check', () => board.element.animate(
  [{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }],
  { duration: 160, iterations: 2 },
));
```

## Why there is legality code in a viewer

`Nf3` names a destination but not an origin, so showing a PGN means working out
which knight moved. The PGN standard requires a disambiguating character only when
more than one **legal** move fits — so when two knights can both reach f3 but one
is pinned, real-world PGN writes a bare `Nf3`.

Overboard therefore filters candidate moves by king safety: a move is discarded if
it would leave the mover's own king attacked. That one test covers pins, discovered
check, and moving into check.

It is a move *resolver*, not an engine: no search, no evaluation, no move ordering,
no opinion about which move is good. Check, checkmate, and stalemate detection come
along for free, which is what the events above report.

## Anki

Put `dist/overboard.js` in your collection's `collection.media` folder as
`_overboard.js` (the leading underscore stops Anki treating it as unused), then in
your card template:

```html
<div id="board" style="max-width: 340px; margin: 0 auto"></div>
<script src="_overboard.js"></script>
<script>
  new Overboard('#board', { fen: '{{FEN}}', showCoordinates: true });
</script>
```

Nothing is fetched, so it works offline and on mobile.

## Development

```
npm test        # 122 tests, no dependencies
npm run build   # regenerate dist/overboard.js
open demo/index.html
```

`demo/index.html` exercises every option, method, and theme, and has a live event
log — it's the fastest way to see what the library does.

The source is plain ES modules under `src/`, which browsers run directly; the build
step exists only to produce the single-file distributable. Types are JSDoc plus a
hand-written `index.d.ts`, so there's no compile step between the code you read and
the code that runs.

Move generation is verified with [perft](https://www.chessprogramming.org/Perft)
against the six standard test positions — a wrong castling right or a missed en
passant shows up as a node-count mismatch.

## License

MIT.
