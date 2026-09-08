// Hermes Overlay – Core Types & Enums

/** Enumerates every semantic block the UI can render */
export enum BlockType {
  Conversation = "conversation",
  Question = "question",
  MultiChoice = "multi_choice",
  Confirmation = "confirmation",
  Todo = "todo",
  Progress = "progress",
  Steps = "steps",
  Timeline = "timeline",
  Code = "code",
  File = "file",
  Error = "error",
  Warning = "warning",
  Success = "success",
  Info = "info",
  Form = "form",
  Command = "command",
  ToolResult = "tool_result",
  SearchResult = "search_result",
  Image = "image",
  Video = "video",
  Audio = "audio",
  LinkCollection = "link_collection",
  Comparison = "comparison",
  Table = "table",
  Checklist = "checklist",
  JSON = "json",
  XML = "xml",
  Terminal = "terminal",
  Logs = "logs",
  Thinking = "thinking",
  Reasoning = "reasoning",
  Citations = "citations",
  Math = "math",
  Mermaid = "mermaid",
  Diagram = "diagram",
  Workflow = "workflow",
  Unknown = "unknown"
}

/** Immutable representation of a parsed semantic block */
export interface SemanticBlock {
  /** Unique identifier (UUID v4) */
  id: string;
  /** Block type – drives renderer selection */
  type: BlockType;
  /** The raw text fragment the model emitted for this block */
  raw: string;
  /** Optional structured data for the renderer (e.g. language, options) */
  meta?: Record<string, unknown>;
  /** Nested blocks – used for lists, steps, etc. */
  children?: SemanticBlock[];
}

/** Simple pure‑function detector – runs on a sliding token window */
export interface Detector {
  /** Return true if the window matches this block's pattern */
  detect(window: string): boolean;
}

/** Parser turns the full raw snippet into a SemanticBlock */
export interface Parser {
  parse(raw: string): SemanticBlock;
}

/** React renderer for a block – receives the block as a prop */
export type Renderer = (props: { block: SemanticBlock }) => JSX.Element;
