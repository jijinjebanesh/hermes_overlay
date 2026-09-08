/**
 * Lightweight streaming tokenizer for assistant output.
 *
 * Goals:
 *  - incremental: works on arbitrary byte chunks
 *  - preserves boundaries for fences, code, tables
 *  - never drops or duplicates characters
 */

export type TokenKind =
  | 'word'
  | 'space'
  | 'newline'
  | 'punctuation'
  | 'fence_open'
  | 'fence_close'
  | 'table_pipe'
  | 'tool_open'
  | 'tool_close'
  | 'list_marker'
  | 'heading_marker'
  | 'math_open'
  | 'math_close'
  | 'markdown_escape';

export interface Token {
  kind: TokenKind;
  value: string;
  index: number;
}

const WORD_RE = /[A-Za-z0-9_]+/;
const PUNCTUATION_RE = /[^\w\s]/;
const SPACE_RE = /[ \t]+/;
const NEWLINE_RE = /\r?\n/;
const FENCE_OPEN_RE = /^```([a-zA-Z0-9+_-]*)\s*$/;
const FENCE_CLOSE_RE = /^```\s*$/;
const TOOL_OPEN_RE = /^<tool\s+/i;
const TOOL_CLOSE_RE = /\/>\s*$/;
const LIST_MARKER_RE = /^(\s*)([-*]|\d+\.)\s+/;
const HEADING_MARKER_RE = /^#{1,6}\s+/;
const MATH_OPEN_RE = /^\$\$?$/;
const MATH_CLOSE_RE = /^\$\$?$/;

export class StreamingTokenizer {
  private buffer: string = '';
  private position: number = 0;

  feed(chunk: string): Token[] {
    this.buffer += chunk;
    const tokens: Token[] = [];
    let pos = 0;

    while (pos < this.buffer.length) {
      const token = this.readNext(pos);
      if (!token) break;

      tokens.push(token);
      pos = token.index + token.value.length;
    }

    this.position += pos;
    this.buffer = this.buffer.slice(pos);
    return tokens;
  }

  flush(): Token[] {
    const tokens: Token[] = [];
    let pos = 0;

    while (pos < this.buffer.length) {
      const token = this.readNext(pos);
      if (!token) break;

      tokens.push(token);
      pos = token.index + token.value.length;
    }

    this.position += pos;
    this.buffer = '';
    return tokens;
  }

  get positionRef(): number {
    return this.position;
  }

  private readNext(pos: number): Token | null {
    const remaining = this.buffer.slice(pos);

    if (remaining.length === 0) return null;

    const newlineMatch = remaining.match(NEWLINE_RE);
    const spaceMatch = remaining.match(SPACE_RE);
    const wordMatch = remaining.match(WORD_RE);
    const punctMatch = remaining.match(PUNCTUATION_RE);

    const newlineStart = newlineMatch ? 0 : -1;
    const spaceStart = spaceMatch ? 0 : -1;
    const wordStart = wordMatch ? 0 : -1;
    const punctStart = punctMatch ? 0 : -1;

    // Priority: newline > space > structural > word/punct
    if (newlineStart === 0) {
      const m = remaining.match(NEWLINE_RE)!;
      return this.makeToken('newline', m[0], pos);
    }

    if (spaceStart === 0) {
      const m = remaining.match(SPACE_RE)!;
      return this.makeToken('space', m[0], pos);
    }

    const fenceOpen = remaining.match(FENCE_OPEN_RE);
    if (fenceOpen && remaining.indexOf('\n') === -1) {
      return this.makeToken('fence_open', fenceOpen[0], pos);
    }

    const fenceClose = remaining.match(FENCE_CLOSE_RE);
    if (fenceClose && remaining.indexOf('\n') === -1) {
      return this.makeToken('fence_close', fenceClose[0], pos);
    }

    const toolOpen = remaining.match(TOOL_OPEN_RE);
    if (toolOpen) {
      const closeIdx = remaining.indexOf('/>');
      if (closeIdx !== -1) {
        const toolToken = remaining.slice(0, closeIdx + 2);
        return this.makeToken('tool_open', toolToken, pos);
      }
      return this.makeToken('tool_open', remaining, pos);
    }

    const listMarker = remaining.match(LIST_MARKER_RE);
    if (listMarker && (wordStart === -1 || listMarker[0].length <= (wordMatch?.[0]?.length ?? Infinity))) {
      return this.makeToken('list_marker', listMarker[0], pos);
    }

    const headingMarker = remaining.match(HEADING_MARKER_RE);
    if (headingMarker) {
      return this.makeToken('heading_marker', headingMarker[0], pos);
    }

    const mathOpen = remaining.match(MATH_OPEN_RE);
    if (mathOpen && (wordStart === -1 || mathOpen[0].length < (wordMatch?.[0]?.length ?? Infinity))) {
      return this.makeToken('math_open', mathOpen[0], pos);
    }

    if (wordStart === 0) {
      const m = remaining.match(WORD_RE)!;
      return this.makeToken('word', m[0], pos);
    }

    if (punctStart === 0) {
      const m = remaining.match(PUNCTUATION_RE)!;
      return this.makeToken('punctuation', m[0], pos);
    }

    // Fallback: emit one character
    return this.makeToken('punctuation', remaining[0]!, pos);
  }

  private makeToken(kind: TokenKind, value: string, index: number): Token {
    return { kind, value, index: this.position + index };
  }

  reset(): void {
    this.buffer = '';
    this.position = 0;
  }
}
