export type BlockType =
  | 'text'
  | 'code'
  | 'table'
  | 'list'
  | 'todo'
  | 'question'
  | 'form'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'
  | 'error'
  | 'warning'
  | 'success'
  | 'info'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'json'
  | 'xml'
  | 'math'
  | 'mermaid'
  | 'citation'
  | 'progress'
  | 'steps'
  | 'timeline'
  | 'comparison'
  | 'suggestion'
  | 'divider'
  | 'fallback'
  // New Block Types
  | 'skill'
  | 'patch'
  | 'search_result'
  | 'browser_action'
  | 'terminal'
  | 'chart'
  | 'notification'
  | 'custom_widget';

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface SourceSpan {
  start: number;
  end: number;
}

export interface BaseBlock {
  id: string;
  type: BlockType;
  sourceSpan: SourceSpan;
  state: 'streaming' | 'complete' | 'error';
  meta?: Record<string, unknown>;
}

export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string;
}

export interface CodeBlock extends BaseBlock {
  type: 'code';
  content: string;
  language: string;
  filename?: string;
  lineStart?: number;
  diff?: boolean;
}

export interface TableBlock extends BaseBlock {
  type: 'table';
  headers: string[];
  rows: string[][];
  raw: string;
}

export interface ListBlock extends BaseBlock {
  type: 'list';
  ordered: boolean;
  items: string[];
}

export interface TodoBlock extends BaseBlock {
  type: 'todo';
  title?: string;
  items: { text: string; done: boolean }[];
  progress: number;
}

export interface QuestionBlock extends BaseBlock {
  type: 'question';
  text: string;
  choices: { label: string; value: string }[];
  multi?: boolean;
  required?: boolean;
}

export interface FormBlock extends BaseBlock {
  type: 'form';
  title?: string;
  fields: { name: string; label: string; type: 'text' | 'email' | 'number' | 'password' | 'textarea'; placeholder?: string; required?: boolean }[];
}

export interface ToolCallBlock extends BaseBlock {
  type: 'tool_call';
  name: string;
  args: Record<string, unknown>;
  status: 'running' | 'success' | 'error';
  output?: string;
  durationMs?: number;
}

export interface ToolResultBlock extends BaseBlock {
  type: 'tool_result';
  toolName: string;
  content: string;
  status: 'success' | 'error';
}

export interface ThinkingBlock extends BaseBlock {
  type: 'thinking';
  content: string;
  collapsed: boolean;
}

export interface StatusBlock extends BaseBlock {
  type: 'error' | 'warning' | 'success' | 'info';
  title: string;
  body?: string;
}

export interface MediaBlock extends BaseBlock {
  type: 'image' | 'video' | 'audio';
  url: string;
  alt?: string;
  durationMs?: number;
  sizeBytes?: number;
  mimeType?: string;
}

export interface FileBlock extends BaseBlock {
  type: 'file';
  name: string;
  ext: string;
  sizeBytes: number;
  url?: string;
  preview?: string;
}

export interface JsonBlock extends BaseBlock {
  type: 'json';
  raw: string;
  data: unknown;
}

export interface XmlBlock extends BaseBlock {
  type: 'xml';
  raw: string;
}

export interface MathBlock extends BaseBlock {
  type: 'math';
  latex: string;
  inline: boolean;
}

export interface MermaidBlock extends BaseBlock {
  type: 'mermaid';
  code: string;
  error?: string;
}

export interface CitationBlock extends BaseBlock {
  type: 'citation';
  id: string;
  source: string;
  context?: string;
}

export interface ProgressBlock extends BaseBlock {
  type: 'progress';
  label: string;
  current: number;
  total: number;
  stages?: { label: string; done: boolean }[];
}

export interface StepsBlock extends BaseBlock {
  type: 'steps';
  title?: string;
  steps: { title: string; body?: string; done: boolean }[];
}

export interface TimelineBlock extends BaseBlock {
  type: 'timeline';
  title?: string;
  events: { time?: string; title: string; body?: string; status?: 'done' | 'active' | 'pending' }[];
}

export interface ComparisonBlock extends BaseBlock {
  type: 'comparison';
  title?: string;
  columns: string[];
  rows: { label: string; values: string[] }[];
}

export interface SuggestionBlock extends BaseBlock {
  type: 'suggestion';
  chips: { label: string; value: string }[];
}

export interface DividerBlock extends BaseBlock {
  type: 'divider';
  label?: string;
}

export interface FallbackBlock extends BaseBlock {
  type: 'fallback';
  markdown: string;
}

// --- New Block Interfaces ---

export interface PatchBlock extends BaseBlock {
  type: 'patch';
  filename?: string;
  hunks?: any[];
  additions?: number;
  deletions?: number;
  diffHtml?: string;
  raw: string;
}

export interface SkillBlock extends BaseBlock {
  type: 'skill';
  skillName: string;
  icon?: string;
  description?: string;
  status: 'running' | 'success' | 'error';
  logs: string[];
  durationMs?: number;
  result?: string;
}

export interface SearchResultBlock extends BaseBlock {
  type: 'search_result';
  results: {
    title: string;
    snippet?: string;
    url: string;
    favicon?: string;
    domain?: string;
    time?: string;
    confidence?: number;
  }[];
}

export interface BrowserActionBlock extends BaseBlock {
  type: 'browser_action';
  screenshot?: string;
  visitedUrls: string[];
  domActions: string[];
  status: 'running' | 'success' | 'error';
}

export interface TerminalBlock extends BaseBlock {
  type: 'terminal';
  command?: string;
  output: string;
  exitCode?: number;
  ansiOutput?: string;
  status: 'running' | 'success' | 'error';
}

export interface ChartBlock extends BaseBlock {
  type: 'chart';
  chartType: 'bar' | 'pie' | 'line' | 'area' | 'radar' | 'flow' | 'timeline';
  data: any;
  labels?: string[];
  options?: any;
}

export interface NotificationBlock extends BaseBlock {
  type: 'notification';
  severity: 'success' | 'warning' | 'info' | 'error' | 'critical';
  message: string;
  dismissable: boolean;
}

export interface CustomWidgetBlock extends BaseBlock {
  type: 'custom_widget';
  widgetType: string;
  props: Record<string, unknown>;
}

export type SemanticBlock =
  | TextBlock
  | CodeBlock
  | TableBlock
  | ListBlock
  | TodoBlock
  | QuestionBlock
  | FormBlock
  | ToolCallBlock
  | ToolResultBlock
  | ThinkingBlock
  | StatusBlock
  | MediaBlock
  | FileBlock
  | JsonBlock
  | XmlBlock
  | MathBlock
  | MermaidBlock
  | CitationBlock
  | ProgressBlock
  | StepsBlock
  | TimelineBlock
  | ComparisonBlock
  | SuggestionBlock
  | DividerBlock
  | FallbackBlock
  // New blocks
  | PatchBlock
  | SkillBlock
  | SearchResultBlock
  | BrowserActionBlock
  | TerminalBlock
  | ChartBlock
  | NotificationBlock
  | CustomWidgetBlock;

// --- Event Stream Protocol ---

export type StreamEvent =
  | { type: 'token'; value: string }
  | { type: 'block_start'; blockType: BlockType; id: string }
  | { type: 'block_update'; id: string; patch: Partial<SemanticBlock> }
  | { type: 'block_end'; id: string }
  | { type: 'status_change'; status: string }
  | { type: 'error'; message: string }
  | { type: 'cancel' }
  | { type: 'done' };

export interface ResponseAST {
  id: string;
  blocks: SemanticBlock[];
  meta?: Record<string, unknown>;
}

export interface PersistableState {
  blocks: Record<string, SemanticBlock[]>;
  uiState: Record<string, any>;
  todoState: Record<string, any[]>;
  questionSelections: Record<string, string[]>;
  formData: Record<string, Record<string, string>>;
  scrollPosition: number;
}

export interface SemanticMessage {
  id: string;
  conversationId: string;
  parentId?: string;
  role: MessageRole;
  turnIndex: number;
  rawText: string;
  blocks: SemanticBlock[];
  createdAt: string;
  status: 'streaming' | 'complete' | 'error' | 'stopped';
}

export interface PluginContext {
  raw: string;
  cursor: number;
  messageId: string;
  appendBlock: (block: SemanticBlock) => void;
  updateLastBlock: (patch: Partial<SemanticBlock>) => void;
}

export interface SemanticPlugin {
  name: string;
  priority: number;
  detect(ctx: PluginContext): boolean;
  start(ctx: PluginContext): void;
  feed?(ctx: PluginContext, token: string): void;
  flush?(ctx: PluginContext): SemanticBlock | null;
}

export interface RendererContext {
  block: SemanticBlock;
  streaming: boolean;
  onAction?: (action: string, payload?: unknown) => void;
}

export interface BlockRenderer {
  canRender(block: SemanticBlock): boolean;
  render(ctx: RendererContext): import('react').ReactNode;
  actions?(block: SemanticBlock): { label: string; value: string }[];
}
