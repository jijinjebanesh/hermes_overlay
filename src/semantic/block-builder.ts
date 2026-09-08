import type { SemanticBlock, PluginContext, SemanticPlugin, TextBlock, CodeBlock, TableBlock, TodoBlock, QuestionBlock, ToolCallBlock, ThinkingBlock, StatusBlock, SuggestionBlock, ProgressBlock, StepsBlock, TimelineBlock, ComparisonBlock, PatchBlock, SkillBlock, SearchResultBlock, BrowserActionBlock, TerminalBlock, ChartBlock, NotificationBlock, CustomWidgetBlock } from '../semantic/types';
import { classifyResponse, type ResponseClass } from '../semantic/classifier';

function makeId(messageId: string, type: string, spanStart: number): string {
  return `${messageId}_${type}_${spanStart}`;
}

export interface BuildOptions {
  plugins?: SemanticPlugin[];
  defaultClassification?: ResponseClass;
}

export interface BuildResult {
  messageId: string;
  blocks: SemanticBlock[];
  classification: ResponseClass;
}

const registry: SemanticPlugin[] = [];

export function registerPlugin(plugin: SemanticPlugin): void {
  registry.push(plugin);
  registry.sort((a, b) => a.priority - b.priority);
}

export function getPlugins(): SemanticPlugin[] {
  return [...registry];
}

export function clearPlugins(): void {
  registry.length = 0;
}

function makeContext(
  raw: string,
  appendBlock: (block: SemanticBlock) => void,
  updateLastBlock: (patch: Partial<SemanticBlock>) => void,
  messageId: string,
  cursor = 0,
): PluginContext {
  return { raw, cursor, messageId, appendBlock, updateLastBlock };
}

function append(blocks: SemanticBlock[], block: SemanticBlock): void {
  blocks.push(block);
}

function patchLast<T extends SemanticBlock>(blocks: SemanticBlock[], patch: Partial<SemanticBlock>): void {
  if (!blocks.length) return;
  const last = blocks[blocks.length - 1] as Partial<T>;
  Object.assign(last, patch);
}

function textBlock(content: string, spanStart: number, messageId: string): TextBlock {
  return {
    id: makeId(messageId, 'text', spanStart),
    type: 'text',
    content,
    sourceSpan: { start: spanStart, end: spanStart + content.length },
    state: 'complete',
  };
}

function statusBlock(title: string, type: StatusBlock['type'], body: string, spanStart: number, messageId: string): StatusBlock {
  return {
    id: makeId(messageId, type, spanStart),
    type,
    title,
    body,
    sourceSpan: { start: spanStart, end: spanStart + title.length + body.length },
    state: 'complete',
  };
}

function suggestionBlock(chips: { label: string; value: string }[], spanStart: number, messageId: string): SuggestionBlock {
  return {
    id: makeId(messageId, 'suggestion', spanStart),
    type: 'suggestion',
    chips,
    sourceSpan: { start: spanStart, end: spanStart },
    state: 'complete',
  };
}

function codeBlockFromMatch(raw: string, match: RegExpExecArray, messageId: string): CodeBlock | null {
  const full = match[0]!;
  const lang = (match[1] || '').trim();
  const start = match.index ?? 0;
  const bodyStart = start + full.indexOf('\n') + 1;
  const body = raw.slice(bodyStart, start + full.length - 3);
  return {
    id: makeId(messageId, 'code', start),
    type: 'code',
    content: body,
    language: lang || 'plaintext',
    sourceSpan: { start, end: start + full.length },
    state: 'complete',
  };
}

function tableBlockFromMatch(raw: string, match: RegExpExecArray, messageId: string): TableBlock | null {
  const full = match[0]!;
  const start = match.index ?? 0;
  const lines = full.split('\n').filter((l) => l.trim().length > 0);
  const headers = splitRow(lines[0] ?? '');
  const rows = lines.slice(2).map(splitRow);
  return {
    id: makeId(messageId, 'table', start),
    type: 'table',
    headers,
    rows,
    raw: full,
    sourceSpan: { start, end: start + full.length },
    state: 'complete',
  };
}

function splitRow(line: string): string[] {
  const trimmed = line.trim();
  if (trimmed.startsWith('|')) return trimmed.slice(1, -1).split('|').map((c) => c.trim());
  return trimmed.split('|').map((c) => c.trim());
}

function todoBlockFromText(raw: string, spanStart: number, messageId: string): TodoBlock {
  const lines = raw.split('\n');
  const items = lines
    .map((line) => {
      const trimmed = line.trim();
      const match = trimmed.match(/[-*]\s*\[([ xX])\]\s*(.+)/);
      if (!match) return null;
      return { text: match[2]!.trim(), done: match[1]!.toLowerCase() === 'x' };
    })
    .filter((item): item is { text: string; done: boolean } => item !== null);

  const doneCount = items.filter((i) => i.done).length;
  return {
    id: makeId(messageId, 'todo', spanStart),
    type: 'todo',
    items,
    progress: items.length === 0 ? 0 : doneCount / items.length,
    sourceSpan: { start: spanStart, end: spanStart + raw.length },
    state: 'complete',
  };
}

function questionBlockFromText(raw: string, spanStart: number, messageId: string): QuestionBlock | null {
  const lines = raw.split(/\r?\n/);
  const choiceRegex = /^(?:[-*]|\d+\.|[a-zA-Z]\))\s+/;
  
  const firstChoiceIdx = lines.findIndex((line) => choiceRegex.test(line.trim()));
  if (firstChoiceIdx === -1) return null;

  const textLines = lines.slice(0, firstChoiceIdx).filter((l) => l.trim().length > 0);
  const text = textLines.join('\n').trim() || lines[0]?.trim() || raw.trim();

  const choices: { label: string; value: string }[] = [];
  for (let i = firstChoiceIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (choiceRegex.test(trimmed)) {
      choices.push({ label: trimmed, value: trimmed });
    }
  }

  if (choices.length === 0) return null;

  return {
    id: makeId(messageId, 'question', spanStart),
    type: 'question',
    text,
    choices,
    sourceSpan: { start: spanStart, end: spanStart + raw.length },
    state: 'complete',
    multi: false,
    required: true,
  };
}

function stepsBlockFromText(raw: string, spanStart: number, messageId: string): StepsBlock {
  const lines = raw.split('\n');
  const steps = lines
    .map((line) => line.trim())
    .filter((line) => /^(?:\d+\.|step\s+\d+)/i.test(line))
    .map((line) => {
      const cleaned = line.replace(/^\d+\.\s*|^step\s+\d+\s*[-:]\s*/i, '').trim();
      return { title: cleaned, done: false, body: '' };
    });

  return {
    id: makeId(messageId, 'steps', spanStart),
    type: 'steps',
    steps,
    sourceSpan: { start: spanStart, end: spanStart + raw.length },
    state: 'complete',
  };
}

function timelineBlockFromText(raw: string, spanStart: number, messageId: string): TimelineBlock {
  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  const events = lines.map((line) => {
    const match = line.match(/^(\d{4}[-/]\d{2}(?:[-/]\d{2})?)[\s\-:]+(.+)/);
    if (match) {
      return { time: match[1]!, title: match[2]!.trim(), status: 'pending' as const };
    }
    return { title: line.trim(), status: 'pending' as const };
  });

  return {
    id: makeId(messageId, 'timeline', spanStart),
    type: 'timeline',
    events,
    sourceSpan: { start: spanStart, end: spanStart + raw.length },
    state: 'complete',
  };
}

function comparisonBlockFromText(raw: string, spanStart: number, messageId: string): ComparisonBlock {
  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  const tableLike = lines.some((line) => line.includes('|'));
  if (!tableLike) {
    const bullets = lines.map((line) => line.replace(/^[-*]\s*/, '').trim());
    return {
      id: makeId(messageId, 'comparison', spanStart),
      type: 'comparison',
      columns: ['Option', 'Details'],
      rows: bullets.map((label) => ({ label, values: [''] })),
      sourceSpan: { start: spanStart, end: spanStart + raw.length },
      state: 'complete',
    };
  }

  const rows: ComparisonBlock['rows'] = [];
  let columns: string[] = [];
  lines.forEach((line, idx) => {
    const cells = splitRow(line);
    if (idx === 0) {
      columns = cells;
    } else if (cells.length > 0 && !cells.every((c) => /^[-:]+$/.test(c))) {
      const label = columns[0] ? cells[0] || '' : `Row ${rows.length + 1}`;
      rows.push({ label, values: cells.slice(1) });
    }
  });

  return {
    id: makeId(messageId, 'comparison', spanStart),
    type: 'comparison',
    columns,
    rows,
    sourceSpan: { start: spanStart, end: spanStart + raw.length },
    state: 'complete',
  };
}

function progressBlockFromText(raw: string, spanStart: number, messageId: string): ProgressBlock {
  const match = raw.match(/step\s+(\d+)\s+of\s+(\d+)/i);
  const current = match ? Number(match[1]) : 1;
  const total = match ? Number(match[2]) : 1;
  const label = match ? `Step ${current} of ${total}` : 'Progress';
  const stages = Array.from({ length: total }, (_, idx) => ({
    label: `Step ${idx + 1}`,
    done: idx < current - 1,
  }));

  return {
    id: makeId(messageId, 'progress', spanStart),
    type: 'progress',
    label,
    current,
    total,
    stages,
    sourceSpan: { start: spanStart, end: spanStart + raw.length },
    state: 'complete',
  };
}

function toolCallBlockFromMatch(raw: string, match: RegExpExecArray, messageId: string): ToolCallBlock | null {
  const full = match[0]!;
  const nameMatch = full.match(/name="([^"]+)"/);
  const argsMatch = full.match(/args="([^"]*)"/);
  const start = match.index ?? 0;
  let args: Record<string, unknown> = {};
  if (argsMatch?.[1]) {
    try {
      args = JSON.parse(argsMatch[1]);
    } catch {
      args = { raw: argsMatch[1] };
    }
  }
  return {
    id: makeId(messageId, 'tool_call', start),
    type: 'tool_call',
    name: nameMatch?.[1] || 'unknown',
    args,
    status: 'running',
    sourceSpan: { start, end: start + full.length },
    state: 'streaming',
  };
}

function splitIntoSemanticSegments(raw: string): { text: string; classification: string }[] {
  const segments: { text: string; classification: string }[] = [];
  let lastIndex = 0;
  const patterns: { regex: RegExp; classification: string }[] = [
    { regex: /```(?:diff|patch)[\s\S]*?```/gi, classification: 'patch' },
    { regex: /```(?:bash|sh)[\s\S]*?```/gi, classification: 'terminal' },
    { regex: /```(?:mermaid)[\s\S]*?```/gi, classification: 'mermaid' },
    { regex: /```(?:chart)[\s\S]*?```/gi, classification: 'chart' },
    { regex: /```(?:json)[\s\S]*?```/gi, classification: 'json' },
    { regex: /```(?:xml)[\s\S]*?```/gi, classification: 'xml' },
    { regex: /```[\s\S]*?```/g, classification: 'code' },
    { regex: /<think>[\s\S]*?<\/think>/gi, classification: 'thinking' },
    { regex: /^<tool\s+[\s\S]*?\/>\s*$/gim, classification: 'tool_call' },
    { regex: /<skill\s+[\s\S]*?<\/skill>/gi, classification: 'skill' },
    { regex: /<search_result>[\s\S]*?<\/search_result>/gi, classification: 'search_result' },
    { regex: /^[-*]\s*\[[ xX]\]\s*.+/gm, classification: 'todo' },
    { regex: /^(?:[-*]\s*){3,}.+/gms, classification: 'list' },
    { regex: /^(?:\d+\.\s*){3,}.+/gms, classification: 'list' },
    { regex: /^(?:[^\n]*\|){2,}[^\n]*$/gm, classification: 'table' },
    { regex: /^::[a-zA-Z0-9_]+/gm, classification: 'custom_widget' }
  ];

  const matches: { start: number; end: number; classification: string }[] = [];

  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.regex.exec(raw)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, classification: pattern.classification });
    }
  }

  matches.sort((a, b) => a.start - b.start);

  const filtered = matches.reduce((acc, m) => {
    if (acc.length === 0 || m.start >= acc[acc.length - 1].end) {
      acc.push(m);
    }
    return acc;
  }, [] as typeof matches);

  for (const match of filtered) {
    if (match.start > lastIndex) {
      segments.push({ text: raw.slice(lastIndex, match.start), classification: 'conversation' });
    }
    segments.push({ text: raw.slice(match.start, match.end), classification: match.classification });
    lastIndex = match.end;
  }

  if (lastIndex < raw.length) {
    segments.push({ text: raw.slice(lastIndex), classification: 'conversation' });
  }

  if (!segments.length && raw.trim().length > 0) {
    segments.push({ text: raw.trim(), classification: 'conversation' });
  }

  return segments;
}

export function buildSemanticBlocks(raw: string, messageId: string, options: BuildOptions = {}): BuildResult {
  const classification = classifyResponse(raw);
  const blocks: SemanticBlock[] = [];
  const appendBlock = (block: SemanticBlock) => append(blocks, block);
  const updateLastBlock = (patch: Partial<SemanticBlock>) => patchLast(blocks, patch);
  const ctx = makeContext(raw, appendBlock, updateLastBlock, messageId);

  for (const plugin of options.plugins ?? getPlugins()) {
    try {
      if (plugin.detect(ctx)) {
        plugin.start(ctx);
        break;
      }
    } catch {
      // ignore plugin failure and continue
    }
  }

  const segments = splitIntoSemanticSegments(raw);
  let spanBase = 0;

  for (const segment of segments) {
    const spanStart = raw.indexOf(segment.text, spanBase);

    if (segment.classification === 'code') {
      const match = /```([\s\S]*?)```/y.exec(segment.text);
      if (match) {
        const block = codeBlockFromMatch(segment.text, { ...match, index: spanStart } as RegExpExecArray, messageId);
        if (block) appendBlock(block);
        spanBase = spanStart + segment.text.length;
        continue;
      }
    }
    
    if (segment.classification === 'patch' || segment.classification === 'terminal' || segment.classification === 'chart') {
      const match = /```([a-z]+)\n?([\s\S]*?)```/yi.exec(segment.text);
      if (match) {
        const type = segment.classification as 'patch' | 'terminal' | 'chart';
        if (type === 'patch') {
          appendBlock({
            id: makeId(messageId, 'patch', spanStart),
            type: 'patch',
            raw: match[2] || '',
            sourceSpan: { start: spanStart, end: spanStart + segment.text.length },
            state: 'complete'
          });
        } else if (type === 'terminal') {
          appendBlock({
            id: makeId(messageId, 'terminal', spanStart),
            type: 'terminal',
            command: match[2] || '',
            output: '',
            status: 'success',
            sourceSpan: { start: spanStart, end: spanStart + segment.text.length },
            state: 'complete'
          });
        } else if (type === 'chart') {
          appendBlock({
            id: makeId(messageId, 'chart', spanStart),
            type: 'chart',
            chartType: 'line',
            data: match[2] || '',
            sourceSpan: { start: spanStart, end: spanStart + segment.text.length },
            state: 'complete'
          });
        }
        spanBase = spanStart + segment.text.length;
        continue;
      }
    }

    if (segment.classification === 'json' || segment.classification === 'xml') {
      const match = /```(?:json|xml)\n?([\s\S]*?)```/y.exec(segment.text);
      if (match) {
        const type = segment.classification === 'json' ? 'json' : 'xml';
        appendBlock({
          id: makeId(messageId, type, spanStart),
          type,
          raw: match[1] || match[0],
          sourceSpan: { start: spanStart, end: spanStart + segment.text.length },
          state: 'complete',
          ...(type === 'json' ? { data: match[1] || match[0] } : {}),
        } as SemanticBlock);
        spanBase = spanStart + segment.text.length;
        continue;
      }
    }

    if (segment.classification === 'mermaid') {
      const match = /```mermaid\n?([\s\S]*?)```/yi.exec(segment.text);
      if (match) {
        appendBlock({
          id: makeId(messageId, 'mermaid', spanStart),
          type: 'mermaid',
          code: match[1] || match[0],
          sourceSpan: { start: spanStart, end: spanStart + segment.text.length },
          state: 'complete',
        });
        spanBase = spanStart + segment.text.length;
        continue;
      }
    }

    if (segment.classification === 'thinking') {
      const match = /<think>([\s\S]*?)<\/think>/yi.exec(segment.text);
      if (match) {
        appendBlock({
          id: makeId(messageId, 'thinking', spanStart),
          type: 'thinking',
          content: match[1] || match[0],
          collapsed: true,
          sourceSpan: { start: spanStart, end: spanStart + segment.text.length },
          state: 'complete',
        });
        spanBase = spanStart + segment.text.length;
        continue;
      }
    }

    if (segment.classification === 'tool_call') {
      const match = /^<tool\s+[\s\S]*?\/>\s*$/yim.exec(segment.text);
      if (match) {
        const block = toolCallBlockFromMatch(segment.text, { ...match, index: spanStart } as RegExpExecArray, messageId);
        if (block) appendBlock(block);
        spanBase = spanStart + segment.text.length;
        continue;
      }
    }

    if (segment.classification === 'todo') {
      appendBlock(todoBlockFromText(segment.text, spanStart, messageId));
      spanBase = spanStart + segment.text.length;
      continue;
    }

    if (segment.classification === 'list') {
      const items = segment.text
        .split('\n')
        .map((line) => line.trim().replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, ''))
        .filter((line) => line.length > 0);
      if (items.length > 0) {
        appendBlock({
          id: makeId(messageId, 'list', spanStart),
          type: 'list',
          ordered: /^\d+\./m.test(segment.text),
          items,
          sourceSpan: { start: spanStart, end: spanStart + segment.text.length },
          state: 'complete',
        });
        spanBase = spanStart + segment.text.length;
        continue;
      }
    }

    if (segment.classification === 'table') {
      const match = /(?:[^\n]*\|){2,}[^\n]*(?:\n(?:\|?[\s\-:]+\|)+[\s\S]*)?/y.exec(segment.text);
      if (match) {
        const block = tableBlockFromMatch(segment.text, { ...match, index: spanStart } as RegExpExecArray, messageId);
        if (block) appendBlock(block);
        spanBase = spanStart + segment.text.length;
        continue;
      }
    }

    appendBlock(textBlock(segment.text, spanStart, messageId));
    spanBase = spanStart + segment.text.length;
  }

  let hasQuestionBlock = false;
  if (classification.class === 'question' || classification.signals.includes('choices')) {
    const qBlock = questionBlockFromText(raw, 0, messageId);
    if (qBlock && qBlock.choices.length > 0) {
      blocks.length = 0;
      blocks.push(qBlock);
      hasQuestionBlock = true;
    }
  }

  const classBasedSuggestion: SuggestionBlock | undefined =
    !hasQuestionBlock && (classification.class === 'question' || classification.class === 'confirmation')
      ? suggestionBlock(
          [
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
            { label: 'Explain', value: 'explain' },
          ],
          0,
          messageId
        )
      : undefined;

  if (classBasedSuggestion) {
    blocks.push(classBasedSuggestion);
  }

  if (classification.class === 'error') {
    blocks.unshift(statusBlock(extractTitle(raw, 'error'), 'error', raw, 0, messageId));
  } else if (classification.class === 'warning') {
    blocks.unshift(statusBlock(extractTitle(raw, 'warning'), 'warning', raw, 0, messageId));
  } else if (classification.class === 'success') {
    blocks.unshift(statusBlock(extractTitle(raw, 'success'), 'success', raw, 0, messageId));
  }

  return {
    messageId,
    blocks,
    classification: classification.class,
  };
}

function extractTitle(raw: string, kind: string): string {
  const match = raw.match(new RegExp(`${kind}[:\\s]+([^\\n]+)`, 'i'));
  if (match) return match[1]!.trim();
  const first = raw.split('\n').find((line) => line.trim().length > 0);
  return first?.trim() || kind.toUpperCase();
}
