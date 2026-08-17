/**
 * Overboard — a dependency-free chess board viewer.
 *
 * Hand-written to match src/overboard.js. The source is plain JavaScript with
 * JSDoc annotations; this file exists so TypeScript consumers get full typing
 * without the library needing a compile step.
 */

export type PieceColor = 'w' | 'b';
export type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
export type Piece = `${PieceColor}${PieceType}`;
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';
export type Orientation = 'white' | 'black';

/** A board theme is two colors. That is the whole format. */
export interface BoardTheme {
  light: string;
  dark: string;
}

/** Piece code to SVG markup, for all twelve pieces. */
export type PieceSet = Record<Piece, string>;

export interface Annotation {
  /** `!`, `?`, `!!`, `??`, `!?`, or `?!`. */
  symbol: string;
  label: 'good' | 'mistake' | 'brilliant' | 'blunder' | 'interesting' | 'dubious';
}

export interface Move {
  /** Notation including any `+` or `#`, e.g. `"Rd8#"`. */
  san: string;
  from: string;
  to: string;
  piece: Piece;
  captured: Piece | null;
  promotion: PromotionPiece | null;
  /** `'k'` kingside, `'q'` queenside, `null` if not a castle. */
  castle: 'k' | 'q' | null;
  /** The position after this move. */
  fen: string;
  /** 1-based index into the line. */
  ply: number;
  comment?: string;
  nag?: number;
  annotation?: Annotation;
}

export interface OverboardOptions {
  /** FEN string, `'start'`, or `'empty'`. Default `'start'`. */
  fen?: string;
  /** A PGN game. Takes precedence over `fen` when both are given. */
  pgn?: string;
  /** Default `'white'`. */
  orientation?: Orientation;
  /** Default `false`. */
  showCoordinates?: boolean;
  /** Registered theme name, or an inline set of twelve piece SVGs. Default `'cburnett'`. */
  pieceTheme?: string | PieceSet;
  /** Theme name or an inline pair of colors. Default `'brown'`. */
  boardTheme?: string | BoardTheme;
  /** Move animation in milliseconds. `0` disables. Default `200`. */
  animation?: number;
  /** Default `true`. */
  highlightLastMove?: boolean;
}

export interface EventMap {
  move: Move;
  position: { fen: string; ply: number };
  capture: { square: string; piece: Piece };
  promotion: { square: string; piece: Piece };
  castle: { side: PieceColor; kingside: boolean };
  check: { side: PieceColor; king: string | null };
  checkmate: { winner: PieceColor };
  stalemate: Record<string, never>;
  annotation: Annotation & { nag?: number; san: string };
  pin: { pinned: { square: string; piece: Piece; by: string }[] };
  error: { message: string };
}

export type EventName = keyof EventMap;

export declare class Overboard {
  constructor(target: string | HTMLElement, options?: OverboardOptions);

  /** The element Overboard created inside your container. */
  readonly element: HTMLElement;

  /** Current position. Setting this clears any loaded game. */
  fen: string;

  /** The loaded game. Reading gives movetext for the line on the board. */
  pgn: string;

  /** Moves of the current line. A copy — mutating it does nothing. */
  readonly moves: Move[];

  /** PGN tag pairs. A copy. */
  readonly headers: Record<string, string>;

  /** Side to move. */
  readonly turn: PieceColor;

  /** How many moves of the line are shown, `0` to `moves.length`. */
  ply: number;

  orientation: Orientation;
  showCoordinates: boolean;
  boardTheme: string | BoardTheme;
  pieceTheme: string | PieceSet;
  animation: number;
  highlightLastMove: boolean;

  /** Play a move in algebraic notation, e.g. `move('Nf3')`. */
  move(san: string): Move | null;
  /** Play a move by coordinates. Promotion defaults to a queen. */
  move(from: string, to: string, promotion?: PromotionPiece): Move | null;

  first(): boolean;
  prev(): boolean;
  next(): boolean;
  last(): boolean;
  /** Jump to a point in the line. Returns whether the position changed. */
  goTo(ply: number): boolean;

  /** Back to the standard starting position. */
  reset(): void;
  /** Empty the board. */
  clear(): void;
  /** Toggle orientation; returns the new one. */
  flip(): Orientation;
  /** Every legal move in the current position, in algebraic notation. */
  legalMoves(): string[];

  /** Listen for an event. Returns an unsubscribe function. */
  on<K extends EventName>(
    name: K,
    listener: (payload: EventMap[K], board: Overboard) => void,
  ): () => void;

  /** Remove one listener, or all listeners for an event when omitted. */
  off<K extends EventName>(
    name: K,
    listener?: (payload: EventMap[K], board: Overboard) => void,
  ): void;

  /** Remove the board from the page and drop every listener. */
  destroy(): void;

  static readonly boardThemes: Record<string, BoardTheme>;
  static readonly pieceThemes: Record<string, PieceSet>;
  static registerBoardTheme(name: string, theme: BoardTheme): void;
  static registerPieceTheme(name: string, set: PieceSet): void;
  static readonly NAG_LABELS: Record<number, Annotation>;
}

export default Overboard;
