/**
 * ResponseRenderer — Exact port of Hermes CLI's markdown/render pipeline
 * (cli.py + agent/markdown_tables.py)
 *
 * Modes:
 *   render → rich.markdown.Markdown
 *   strip  → _strip_markdown_syntax + realign_markdown_tables
 *   raw    → preserve ANSI exactly
 *
 * Streaming:
 *   StreamBuffer + StreamRenderer replicate cli.py's _emit_stream_text /
 *   _flush_stream, including table buffering/delayed flush.
 */

/* ═══════════════════════════════════════════════════════════════
   ANSI / Rich-text helpers
   ═══════════════════════════════════════════════════════════════ */

// CSI/SGR escape sequence: ESC [ ... m
const _SGR_RE = /\x1b\[[0-9;]*m/g;
// OSC 8 hyperlink and other OSC sequences: ESC ] ... ST (ST = ESC \ or BEL)
const _OSC_RE = /\x1b\][\s\S]*?(?:\x07|\x1b\\)/g;
// Full ANSI escape: ESC [ ... [a-zA-Z] or ESC ] ... ST or ESC [ K / J / etc.
const _ANSI_RE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function stripAnsi(text: string): string {
  return text.replace(_OSC_RE, '').replace(_ANSI_RE, '');
}

/**
 * Equivalent of cli.py `_rich_text_from_ansi` → rich.text.Text.from_ansi.
 * In a web context we don't have Rich; we keep literal brackets intact
 * while stripping real ANSI sequences.
 */
export function richTextFromAnsi(text: string): string {
  return stripAnsi(text || '');
}

/* ═══════════════════════════════════════════════════════════════
   Table detection / alignment (exact port of agent/markdown_tables.py)
   ═══════════════════════════════════════════════════════════════ */

const DIVIDER_CELL_RE = /^\s*:?-{3,}:?\s*$/;
const MIN_COL_WIDTH = 3;

function dispWidth(s: string): number {
  if (!s) return 0;
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if ((code >= 0x3000 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7af) || (code >= 0xff01 && code <= 0xff60)) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

function padToWidth(s: string, target: number): string {
  const w = dispWidth(s);
  if (w >= target) return s;
  return s + ' '.repeat(target - w);
}

export function splitTableRow(row: string): string[] {
  let s = row.trim();
  if (s.startsWith('|')) s = s.substring(1);
  if (s.endsWith('|')) s = s.substring(0, s.length - 1);
  return s.split('|').map((c) => c.trim());
}

export function isTableDivider(row: string): boolean {
  const cells = splitTableRow(row);
  if (cells.length <= 1) return false;
  return cells.every((c) => DIVIDER_CELL_RE.test(c));
}

export function looksLikeTableRow(row: string): boolean {
  if (!row.includes('|')) return false;
  const stripped = row.trim();
  if (!stripped) return false;
  if (stripped.startsWith('|')) return true;
  return (stripped.match(/\|/g) || []).length >= 2;
}

function wrapToWidth(text: string, width: number): string[] {
  if (width <= 0 || !text) return [text];
  const words = text.split(/\s+/);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';
  let currentW = 0;

  const hardBreak = (word: string, w: number): string[] => {
    const out: string[] = [];
    let buf = '';
    let bw = 0;
    for (const ch of word) {
      const cw = dispWidth(ch) || 1;
      if (bw + cw > w && buf) {
        out.push(buf);
        buf = ch;
        bw = cw;
      } else {
        buf += ch;
        bw += cw;
      }
    }
    if (buf) out.push(buf);
    return out;
  };

  for (const word of words) {
    const ww = dispWidth(word);
    if (!current) {
      if (ww <= width) {
        current = word;
        currentW = ww;
      } else {
        const pieces = hardBreak(word, width);
        lines.push(...pieces.slice(0, -1));
        current = pieces[pieces.length - 1] || '';
        currentW = dispWidth(current);
      }
      continue;
    }
    if (currentW + 1 + ww <= width) {
      current += ' ' + word;
      currentW += 1 + ww;
    } else {
      lines.push(current);
      if (ww <= width) {
        current = word;
        currentW = ww;
      } else {
        const pieces = hardBreak(word, width);
        lines.push(...pieces.slice(0, -1));
        current = pieces[pieces.length - 1] || '';
        currentW = dispWidth(current);
      }
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function renderVertical(rows: string[][], ncols: number, availableWidth: number): string[] {
  if (rows.length === 0) return [];

  const headers = rows[0];
  const body = rows.slice(1);
  const labels = Array.from({ length: ncols }, (_, i) => headers[i] || `Column ${i + 1}`);

  const sepWidth = availableWidth ? Math.max(20, Math.min(40, availableWidth - 2)) : 30;
  const separator = '─'.repeat(sepWidth);
  const indent = '  ';
  const indentW = dispWidth(indent);

  const out: string[] = [];
  for (let ri = 0; ri < body.length; ri++) {
    const row = body[ri];
    if (ri > 0) out.push(separator);

    for (let ci = 0; ci < ncols; ci++) {
      const label = labels[ci];
      const value = row[ci] || '';
      const labelW = dispWidth(label);
      const firstBudget = Math.max(10, availableWidth - labelW - 2);
      const contBudget = Math.max(10, availableWidth - indentW);

      if (!value) {
        out.push(`${label}:`);
        continue;
      }

      const wrapped = wrapToWidth(value, firstBudget);
      out.push(`${label}: ${wrapped[0]}`);

      if (wrapped.length > 1) {
        const contText = wrapped.slice(1).join(' ');
        for (const cl of wrapToWidth(contText, contBudget)) {
          if (cl.trim()) {
            out.push(`${indent}${cl}`);
          }
        }
      }
    }
  }
  return out;
}

function renderBlock(rows: string[][], availableWidth?: number): string[] {
  const ncols = Math.max(...rows.map((r) => r.length));
  rows = rows.map((r) => {
    const newRow = [...r];
    while (newRow.length < ncols) newRow.push('');
    return newRow;
  });

  const widths: number[] = [];
  for (let c = 0; c < ncols; c++) {
    widths.push(Math.max(MIN_COL_WIDTH, ...rows.map((r) => dispWidth(r[c]))));
  }

  const horizontalWidth = widths.reduce((a, b) => a + b, 0) + 3 * ncols + 1;

  if (availableWidth !== undefined && horizontalWidth > Math.max(availableWidth, 20)) {
    return renderVertical(rows, ncols, availableWidth);
  }

  const formatRow = (cells: string[]) => {
    return '| ' + cells.map((c, k) => padToWidth(c, widths[k])).join(' | ') + ' |';
  };

  const out = [formatRow(rows[0])];
  out.push('|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|');
  for (let i = 1; i < rows.length; i++) {
    out.push(formatRow(rows[i]));
  }
  return out;
}

export function realignMarkdownTables(text: string, availableWidth?: number): string {
  if (!text.includes('|')) return text;

  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  const n = lines.length;

  while (i < n) {
    const line = lines[i];
    if (line.includes('|') && i + 1 < n && isTableDivider(lines[i + 1])) {
      const header = splitTableRow(line);
      const body: string[][] = [];
      let j = i + 2;
      while (j < n && lines[j].includes('|') && lines[j].trim()) {
        if (isTableDivider(lines[j])) {
          j++;
          continue;
        }
        body.push(splitTableRow(lines[j]));
        j++;
      }

      if (header.some((c) => c) || body.length > 0) {
        out.push(...renderBlock([header, ...body], availableWidth));
        i = j;
        continue;
      }
    }
    out.push(line);
    i++;
  }

  return out.join('\n');
}

/* ═══════════════════════════════════════════════════════════════
   _strip_markdown_syntax — exact port from cli.py lines 2399-2426
   ═══════════════════════════════════════════════════════════════ */

export function stripMarkdownSyntax(text: string): string {
  // First, strip ANSI to get plain text (like _rich_text_from_ansi(...).plain)
  let plain = stripAnsi(text || '');

  // HR: - / _ variants (3+ chars, optional whitespace between)
  plain = plain.replace(/^\s{0,3}(?:[-_]\s*){3,}$/gm, '');

  // HR: * variant — ONLY exactly 3 asterisks with optional whitespace
  // This protects cron expressions like "* * * * *"
  plain = plain.replace(/^\s{0,3}(?:\*\s*){3}\s*$/gm, '');

  // Headings
  plain = plain.replace(/^\s{0,3}#{1,6}\s+/gm, '');

  // Fenced code blocks (``` or ~~~)
  plain = plain.replace(/(```+|~~~+)/g, '');

  // Inline code
  plain = plain.replace(/`([^`]*)`/g, '$1');

  // Images: ![alt](url) → alt
  plain = plain.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Links: [text](url) → text
  plain = plain.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // Bold+italic: ***text***
  plain = plain.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');

  // Bold+italic: ___text___ (with word-boundary guards)
  plain = plain.replace(/(?<!\w)___([^_]+)___(?!\w)/g, '$1');

  // Bold: **text**
  plain = plain.replace(/\*\*([^*]+)\*\*/g, '$1');

  // Bold: __text__ (with word-boundary guards)
  plain = plain.replace(/(?<!\w)__([^_]+)__(?!\w)/g, '$1');

  // Italic: *text* — only when inner text is non-whitespace (protects cron "* * * * *")
  plain = plain.replace(/\*([^\s*][^*]*?[^\s*])\*/g, '$1');

  // Italic: _text_ (with word-boundary guards)
  plain = plain.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1');

  // Strikethrough: ~~text~~
  plain = plain.replace(/~~([^~]+)~~/g, '$1');

  // Collapse 3+ newlines to 2
  plain = plain.replace(/\n{3,}/g, '\n\n');

  return plain.replace(/\n$/, '').trimEnd();
}

/* ═══════════════════════════════════════════════════════════════
   _preserve_windows_dot_segments_for_markdown (exact port cli.py)
   ═══════════════════════════════════════════════════════════════ */

const WINDOWS_PATH_WITH_DOT_SEGMENT_RE = /(?:\b[a-z]:\\|\\)[^\s`]*\.[^\s`]*/g;

export function preserveWindowsDotSegmentsForMarkdown(text: string): string {
  if (!text.includes('\\.')) return text;

  return text.replace(WINDOWS_PATH_WITH_DOT_SEGMENT_RE, (match) =>
    match.replace(/(?<!\\)\\(?=\.)/g, '\\\\')
  );
}

/* ═══════════════════════════════════════════════════════════════
   _terminal_width_for_streaming (exact port cli.py)
   ═══════════════════════════════════════════════════════════════ */

const _STREAM_PAD_CELLS = 4; // "    " — matches cli.py _STREAM_PAD

export function terminalWidthForStreaming(): number {
  try {
    const cols = typeof window !== 'undefined' ? Math.max(40, window.innerWidth / 8 | 0) : 80;
    return Math.max(20, cols - _STREAM_PAD_CELLS - 2);
  } catch {
    return 68; // 80 - 4 - 2
  }
}

export function panelWidth(): number {
  try {
    const cols = typeof window !== 'undefined' ? Math.max(40, window.innerWidth / 8 | 0) : 80;
    return Math.max(20, cols - 12);
  } catch {
    return 68;
  }
}

/* ═══════════════════════════════════════════════════════════════
   _render_final_assistant_content — exact port cli.py:2469-2504
   ═══════════════════════════════════════════════════════════════ */

export type RenderMode = 'render' | 'strip' | 'raw';

export function renderFinalAssistantContent(text: string, mode: RenderMode = 'render'): string {
  const normalizedMode = String(mode || 'render').trim().toLowerCase();

  if (normalizedMode === 'strip') {
    return realignMarkdownTables(stripMarkdownSyntax(text), panelWidth());
  }

  if (normalizedMode === 'raw') {
    return stripAnsi(text || '');
  }

  // 'render' mode: preserve ANSI, protect Windows dot segments, re-align tables,
  // then emit Rich Markdown (here: return cleaned markdown string for ReactMarkdown)
  const plain = richTextFromAnsi(text || '');
  const withWindowsFix = preserveWindowsDotSegmentsForMarkdown(plain);
  return realignMarkdownTables(withWindowsFix, panelWidth());
}

/* ═══════════════════════════════════════════════════════════════
   StreamBuffer — exact port of cli.py _emit_stream_text / _flush_stream
   ═══════════════════════════════════════════════════════════════ */

export interface StreamRenderResult {
  /** Text chunks ready for display, in order */
  chunks: string[];
  /** Whether the response box header has been emitted */
  boxOpened: boolean;
  /** Whether we're currently inside a table block */
  inTable: boolean;
}

export class StreamBuffer {
  private buffer = '';
  private tableBuf: string[] = [];
  private inTable = false;
  private boxOpened = false;
  private mode: RenderMode = 'render';
  private boxHeaderEmitted = false;

  constructor(mode: RenderMode = 'render') {
    this.mode = mode;
  }

  reset(mode?: RenderMode): void {
    this.buffer = '';
    this.tableBuf = [];
    this.inTable = false;
    this.boxOpened = false;
    this.boxHeaderEmitted = false;
    if (mode) this.mode = mode;
  }

  setMode(mode: RenderMode): void {
    this.mode = mode;
  }

  getState(): StreamRenderResult {
    return {
      chunks: [],
      boxOpened: this.boxOpened,
      inTable: this.inTable,
    };
  }

  /** Text which is safe to paint immediately but has no terminating newline. */
  getPendingText(): string {
    if (!this.buffer || this.inTable) return '';
    return this.mode === 'strip' ? stripMarkdownSyntax(this.buffer) : this.buffer;
  }

  needsBoxHeader(): boolean {
    if (this.boxOpened || this.boxHeaderEmitted) return false;
    const stripped = this.buffer.replace(/^\n+/, '');
    if (!stripped) return false;
    return true;
  }

  markBoxHeaderEmitted(): void {
    this.boxHeaderEmitted = true;
    this.boxOpened = true;
    const stripped = this.buffer.replace(/^\n+/, '');
    this.buffer = stripped;
  }

  /**
   * Feed a chunk of text from the streaming response.
   * Returns an array of display-ready line chunks.
   * First call when box hasn't opened yet returns a single marker chunk
   * representing the box header; caller can replace it with the actual header.
   */
  feed(chunk: string): string[] {
    const emitted: string[] = [];
    this.buffer += chunk;

    if (!this.boxHeaderEmitted) {
      const stripped = this.buffer.replace(/^\n+/, '');
      if (!stripped) return emitted;
      this.boxHeaderEmitted = true;
      this.boxOpened = true;
      this.buffer = stripped;
      emitted.push('__BOX_HEADER__');
    }

    // --- Emit complete lines, buffer table rows ---
    while (this.buffer.indexOf('\n') !== -1) {
      const idx = this.buffer.indexOf('\n');
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);

      if (this.inTable) {
        if (looksLikeTableRow(line) || isTableDivider(line)) {
          this.tableBuf.push(line);
          continue;
        }
        emitted.push(...this.flushTableBuf());
      } else if (looksLikeTableRow(line)) {
        this.tableBuf.push(line);
        this.inTable = true;
        continue;
      }

      // Normal line
      if (this.mode === 'strip') {
        emitted.push(stripMarkdownSyntax(line));
      } else {
        emitted.push(line);
      }
    }

    // --- Force-flush long partial lines (TTFT perception fix) ---
    const wrapW = Math.max(40, terminalWidthForStreaming());
    if (
      this.buffer &&
      !this.inTable &&
      !this.buffer.trimStart().startsWith('|')
    ) {
      while (this.buffer.length >= wrapW) {
        let cut = this.buffer.lastIndexOf(' ', wrapW);
        if (cut <= 0) cut = wrapW;
        const chunk = this.buffer.slice(0, cut);
        this.buffer = this.buffer.slice(cut).trimStart();
        if (this.mode === 'strip') {
          emitted.push(stripMarkdownSyntax(chunk));
        } else {
          emitted.push(chunk);
        }
      }
    }

    return emitted;
  }

  /**
   * Flush remaining buffer at end of stream.
   */
  flush(): string[] {
    const emitted: string[] = [];

    if (!this.boxHeaderEmitted && this.buffer.replace(/^\n+/, '')) {
      this.boxHeaderEmitted = true;
      this.boxOpened = true;
      const stripped = this.buffer.replace(/^\n+/, '');
      this.buffer = stripped;
      emitted.push('__BOX_HEADER__');
    }

    // Flush any trailing table partial
    if (
      this.buffer &&
      this.inTable &&
      (looksLikeTableRow(this.buffer) || isTableDivider(this.buffer))
    ) {
      this.tableBuf.push(this.buffer);
      this.buffer = '';
    }

    // Flush table buffer first
    if (this.tableBuf.length > 0) {
      const joined = this.tableBuf.join('\n');
      this.tableBuf = [];
      this.inTable = false;

      if (this.mode === 'strip') {
        const stripped = stripMarkdownSyntax(joined);
        const realigned = realignMarkdownTables(stripped, terminalWidthForStreaming());
        emitted.push(...realigned.split('\n'));
      } else {
        const realigned = realignMarkdownTables(joined, terminalWidthForStreaming());
        emitted.push(...realigned.split('\n'));
      }
    }

    // Flush remaining partial line
    if (this.buffer) {
      if (this.mode === 'strip') {
        emitted.push(stripMarkdownSyntax(this.buffer));
      } else {
        emitted.push(this.buffer);
      }
      this.buffer = '';
    }

    return emitted;
  }

  private flushTableBuf(): string[] {
    const joined = this.tableBuf.join('\n');
    this.tableBuf = [];
    this.inTable = false;

    if (this.mode === 'strip') {
      const stripped = stripMarkdownSyntax(joined);
      const realigned = realignMarkdownTables(stripped, terminalWidthForStreaming());
      return realigned.split('\n');
    } else {
      const realigned = realignMarkdownTables(joined, terminalWidthForStreaming());
      return realigned.split('\n');
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   ResponseRenderer — orchestrator
   ═══════════════════════════════════════════════════════════════ */

export interface RendererOptions {
  mode: RenderMode;
  /** Optional: response label text (e.g. "⚕ Hermes") */
  responseLabel?: string;
  /** Optional: body text color hex for streaming text */
  streamTextColor?: string;
}

export class ResponseRenderer {
  private buffer: StreamBuffer;
  private mode: RenderMode;
  private responseLabel?: string;
  private streamTextColor?: string;

  constructor(opts: RendererOptions) {
    this.buffer = new StreamBuffer(opts.mode);
    this.mode = opts.mode;
    this.responseLabel = opts.responseLabel;
    this.streamTextColor = opts.streamTextColor;
  }

  setMode(mode: RenderMode): void {
    this.mode = mode;
    this.buffer.setMode(mode);
  }

  /**
   * Feed a streaming chunk. Returns display-ready lines.
   * First call (when boxOpened transitions false→true) returns the box header as the first element.
   */
  feed(chunk: string): string[] {
    const result: string[] = [];

    // Open box header on first visible content
    if (!this.buffer['boxOpened'] && chunk) {
      const stripped = chunk.replace(/^\n+/, '');
      if (stripped) {
        this.buffer['boxOpened'] = true;
        result.push(this.buildBoxHeader());
        chunk = stripped;
      }
    }

    const lines = this.buffer.feed(chunk);
    result.push(...lines);
    return result;
  }

  /**
   * Finalize: flush remaining buffer and close box.
   */
  flush(): string[] {
    const result = this.buffer.flush();
    const closed = [this.buildBoxClose()];
    return [...result, ...closed];
  }

  /**
   * Render a complete final response (non-streaming path).
   */
  renderFinal(text: string): string {
    return renderFinalAssistantContent(text, this.mode);
  }

  /**
   * Reset state for a new response.
   */
  reset(mode?: RenderMode): void {
    if (mode) this.mode = mode;
    this.buffer.reset(this.mode);
  }

  private buildBoxHeader(): string {
    const label = this.responseLabel || '⚕ Hermes';
    const w = Math.min(88, (typeof window !== 'undefined' ? window.innerWidth / 8 | 0 : 80) - 2);
    const fill = Math.max(0, w - 2 - label.length);
    return `╭─${label}${'─'.repeat(fill)}╮`;
  }

  private buildBoxClose(): string {
    const w = Math.min(88, (typeof window !== 'undefined' ? window.innerWidth / 8 | 0 : 80) - 2);
    return `╰${'─'.repeat(w - 2)}╯`;
  }
}
