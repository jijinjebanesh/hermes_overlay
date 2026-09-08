import React from 'react';
import { motion } from 'framer-motion';
import { CheckSquare, Square, Circle, ChevronRight, Copy, Check, AlertTriangle, XCircle, Info, Lightbulb } from 'lucide-react';
import type { SemanticBlock, RendererContext, BlockRenderer } from '../../semantic/types';

import { useOverlayStore } from '../../store/overlayStore';

const EASE = [0.16, 1, 0.3, 1] as const;

function copyText(text: string): void {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function classNames(...classes: Array<string | false | undefined | null>): string {
  return classes.filter(Boolean).join(' ');
}

const textVariants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0 },
};

export function animateBlock(children: React.ReactNode, key?: string) {
  return (
    <motion.div
      key={key}
      initial="hidden"
      animate="visible"
      transition={{ duration: 0.18, ease: EASE }}
      variants={textVariants}
    >
      {children}
    </motion.div>
  );
}

// ── Wrapper: converts a React FC into a BlockRenderer ──
function componentRenderer(
  types: string | string[],
  Component: React.FC<RendererContext>
): BlockRenderer {
  const typeArr = Array.isArray(types) ? types : [types];
  return {
    canRender: (block) => typeArr.includes(block.type),
    render: (ctx) => <Component {...ctx} />,
  };
}

// 1. Text Component
const TextComponent: React.FC<RendererContext> = ({ block, streaming }) => {
  const lines = ((block as any).content || '').split('\n');
  const isStreaming = streaming && block.state !== 'complete';
  const node = (
    <div className="semantic-text">
      {lines.map((line: string, idx: number) => (
        <p key={idx} className="semantic-text__line">
          {line || <br />}
          {isStreaming && idx === lines.length - 1 && <span className="semantic-text__caret" />}
        </p>
      ))}
    </div>
  );
  return isStreaming ? animateBlock(node, block.id) : node;
};

// 2. Code Component (uses useState for copy state)
const CodeComponent: React.FC<RendererContext> = ({ block, streaming }) => {
  const codeBlock = block as any;
  const [copied, setCopied] = React.useState(false);
  const code = codeBlock.content || '';
  const isStreaming = streaming && block.state !== 'complete';
  const node = (
    <div className="code-block">
      <div className="code-block-header">
        <div className="code-block-dots">
          <span className="code-block-dot code-block-dot--red" />
          <span className="code-block-dot code-block-dot--yellow" />
          <span className="code-block-dot code-block-dot--green" />
        </div>
        {codeBlock.language && <span className="code-block-lang">{codeBlock.language}</span>}
        <button
          type="button"
          className={`code-copy-btn${copied ? ' copied' : ''}`}
          onClick={() => {
            copyText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="code-block-content selectable">
        <pre className="semantic-code__pre">
          <code>{code || (streaming ? ' ' : '')}</code>
        </pre>
      </div>
      {isStreaming && <div className="semantic-code__caret" />}
    </div>
  );
  return isStreaming ? animateBlock(node, block.id) : node;
};

// 3. Table Component
const TableComponent: React.FC<RendererContext> = ({ block }) => {
  const tableBlock = block as any;
  const headers = tableBlock.headers || [];
  const rows = tableBlock.rows || [];
  return (
    <div className="semantic-table-wrap">
      <table className="semantic-table">
        <thead>
          <tr>
            {headers.map((h: string, i: number) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row: string[], idx: number) => (
            <tr key={idx}>
              {row.map((cell: string, cellIdx: number) => (
                <td key={cellIdx}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// 4. Todo Component
const TodoComponent: React.FC<RendererContext> = ({ block, onAction }) => {
  const todoBlock = block as any;
  const items = todoBlock.items || [];
  const title = todoBlock.title || 'Task list';
  const doneCount = items.filter((i: any) => i.done).length;
  const pct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

  return (
    <div className="semantic-todo">
      <div className="semantic-todo__header">
        <div className="semantic-todo__header-info">
          <div className="semantic-todo__title">{title}</div>
          <div className="semantic-todo__progress-text">{doneCount} of {items.length} completed</div>
        </div>
        <div className="semantic-todo__progress-track">
          <div className="semantic-todo__progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="semantic-todo__items">
        {items.map((item: any, idx: number) => {
          const isDone = item.done;
          return (
            <button
              type="button"
              key={idx}
              className={classNames('semantic-todo__item', isDone && 'semantic-todo__item--done')}
              onClick={() => onAction?.('toggle_todo', { blockId: block.id, index: idx })}
            >
              <span className={classNames('semantic-todo__checkbox', isDone && 'semantic-todo__checkbox--done')}>
                {isDone ? <Check size={12} strokeWidth={3} className="semantic-todo__check-icon" /> : null}
              </span>
              <span className={classNames('semantic-todo__text', isDone && 'semantic-todo__text--done')}>{item.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// 5. Question Component
const QuestionComponent: React.FC<RendererContext> = ({ block, onAction }) => {
  const questionBlock = block as any;
  const choices = questionBlock.choices || [];
  const [localSelected, setLocalSelected] = React.useState<string | null>(null);

  const blockState = useOverlayStore((state) => state.uiState[block.id]);
  const setStreamState = useOverlayStore((state) => state.setStreamState);
  const isSubmitted = blockState?.submitted;
  const activeSelection = blockState?.selected || localSelected;

  // A rendered question is a checkpoint in the active task. The stream has
  // finished for now, but the task is waiting for the user's choice.
  React.useEffect(() => {
    if (!isSubmitted) {
      setStreamState({ isStreaming: false, mode: 'waiting' });
    }
  }, []);

  return (
    <div className="semantic-question">
      <div className="semantic-question__title">{questionBlock.text}</div>
      <div className="semantic-question__choices">
        {choices.map((choice: any) => {
          const active = activeSelection === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              disabled={isSubmitted}
              className={classNames('semantic-question__choice', active && 'semantic-question__choice--active', isSubmitted && 'opacity-60 cursor-not-allowed')}
              onClick={() => {
                if (isSubmitted) return;
                setLocalSelected(choice.value);
                // Choosing an option is the confirmation step. Continue the
                // resumed task immediately instead of requiring Submit.
                onAction?.('submit_choice', { blockId: block.id, value: choice.value });
              }}
            >
              <Circle size={16} className={classNames('semantic-question__radio', active && 'semantic-question__radio--active')} />
              <span>{choice.label}</span>
            </button>
          );
        })}
      </div>
      {!isSubmitted && (
        <div className="mt-1 text-xs text-white/50">Waiting for your choice…</div>
      )}
      {isSubmitted && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-white/60">
          <Check size={14} className="text-emerald-400" /> Continuing…
        </div>
      )}
    </div>
  );
};

// 6. Thinking Component (uses useState for collapse)
const ThinkingComponent: React.FC<RendererContext> = ({ block, streaming }) => {
  const [open, setOpen] = React.useState(true);
  const isStreaming = streaming && block.state !== 'complete';
  const node = (
    <div className="semantic-thinking">
      <button type="button" className="semantic-thinking__toggle" onClick={() => setOpen((v) => !v)}>
        <ChevronRight size={14} className={classNames(open && 'semantic-thinking__chevron--open')} />
        <span>{open ? 'Hide reasoning' : 'View reasoning'}</span>
      </button>
      {open && (
        <div className="semantic-thinking__body">
          <pre>{(block as any).content || (streaming ? ' ' : '')}</pre>
          {isStreaming && <div className="semantic-thinking__caret" />}
        </div>
      )}
    </div>
  );
  return isStreaming ? animateBlock(node, block.id) : node;
};

// 7. Status Component
const StatusComponent: React.FC<RendererContext> = ({ block }) => {
  const statusBlock = block as any;
  const Icon = block.type === 'error' ? XCircle : block.type === 'warning' ? AlertTriangle : block.type === 'success' ? Check : Info;
  return (
    <div className={classNames('semantic-status', `semantic-status--${block.type}`)}>
      <Icon size={16} />
      <div>
        <div className="semantic-status__title">{statusBlock.title}</div>
        {statusBlock.body ? <div className="semantic-status__body">{statusBlock.body}</div> : null}
      </div>
    </div>
  );
};

// 8. ToolCall Component
const ToolCallComponent: React.FC<RendererContext> = ({ block, streaming }) => {
  const toolBlock = block as any;
  const status = toolBlock.status || 'running';
  const isStreaming = streaming && block.state !== 'complete';
  const [expanded, setExpanded] = React.useState(true);
  const args = toolBlock.args || {};
  const toolName = String(toolBlock.name || 'tool');
  const normalizedName = toolName.toLowerCase();
  const kind = normalizedName.includes('read') ? 'read' : normalizedName.includes('write') || normalizedName.includes('edit') ? 'write' : normalizedName.includes('terminal') || normalizedName.includes('command') || normalizedName.includes('shell') ? 'terminal' : 'tool';
  const target = args.file_path || args.path || args.filename || args.file || args.command || args.cmd;
  const detail = args.content || args.patch || args.code || toolBlock.output;
  const visibleArgs = Object.entries(args).filter(([key]) => !['content', 'patch', 'code'].includes(key));
  const node = (
    <section className={`semantic-execution semantic-execution--${kind}`}>
      <button
        type="button"
        className={`semantic-execution__header tool-call-pill--${status}`}
        onClick={() => detail && setExpanded((v) => !v)}
      >
        <span className="semantic-execution__kicker">{kind}</span>
        <span className="tool-call-copy">
          <span className="tool-call-verb">{toolName}</span>
          {target && <span className="tool-call-summary">{String(target)}</span>}
        </span>
        <span className={`tool-call-status-indicator tool-call-status-indicator--${status}`} />
        {detail && <ChevronRight className={`tool-call-chevron${expanded ? ' is-expanded' : ''}`} size={14} />}
      </button>
      {target && <div className="semantic-execution__target" title={String(target)}>{String(target)}</div>}
      {expanded && (visibleArgs.length > 0 || detail) && (
        <div className="semantic-execution__body">
          {visibleArgs.length > 0 && (
            <dl className="semantic-execution__meta">
              {visibleArgs.map(([key, value]) => (
                <React.Fragment key={key}>
                  <dt>{key}</dt><dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}
          {detail && <pre className="semantic-execution__output">{String(detail)}</pre>}
        </div>
      )}
      {isStreaming && <div className="semantic-tool__caret" />}
    </section>
  );
  return isStreaming ? animateBlock(node, block.id) : node;
};

// ── Export as BlockRenderers ──
export const TextRenderer = componentRenderer('text', TextComponent);
export const CodeRenderer = componentRenderer('code', CodeComponent);
export const TableRenderer = componentRenderer('table', TableComponent);
export const TodoRenderer = componentRenderer('todo', TodoComponent);
export const QuestionRenderer = componentRenderer('question', QuestionComponent);
export const ThinkingRenderer = componentRenderer('thinking', ThinkingComponent);
export const StatusRenderer = componentRenderer(['error', 'warning', 'success', 'info'], StatusComponent);
export const ToolCallRenderer = componentRenderer('tool_call', ToolCallComponent);
