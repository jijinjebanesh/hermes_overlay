import React from 'react';
import { motion } from 'framer-motion';
import { CheckSquare, Square, Circle, ChevronRight, ChevronDown, Copy, Check, Play, AlertTriangle, XCircle, Info, Lightbulb, Search, Globe, Bell, FileText, BarChart3, Zap } from 'lucide-react';
import type { BlockRenderer, RendererContext, ProgressBlock, StepsBlock, TimelineBlock, ListBlock, MathBlock, MermaidBlock, MediaBlock, SuggestionBlock, ComparisonBlock, CitationBlock, FormBlock, SearchResultBlock, SkillBlock, BrowserActionBlock, NotificationBlock, CustomWidgetBlock, DividerBlock, FallbackBlock, FileBlock, JsonBlock, XmlBlock } from '../../semantic/types';
import { animateBlock } from './StandardRenderers';

function classNames(...classes: Array<string | false | undefined | null>): string {
  return classes.filter(Boolean).join(' ');
}

// ── Progress Renderer ──
export const ProgressRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'progress',
  render: ({ block }) => {
    const b = block as ProgressBlock;
    const pct = b.total > 0 ? Math.round((b.current / b.total) * 100) : 0;
    const stages = b.stages || [];
    return (
      <div className="semantic-progress">
        <div className="semantic-progress__header">
          <span>{b.label}</span>
          <span>{pct}%</span>
        </div>
        <div className="semantic-progress__track">
          <div className="semantic-progress__fill" style={{ width: `${pct}%` }} />
        </div>
        {stages.length > 0 && (
          <div className="semantic-progress__stages">
            {stages.map((stage, idx) => (
              <div key={idx} className={classNames('semantic-progress__stage', stage.done && 'semantic-progress__stage--done')}>
                {stage.label}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
};

// ── Steps Renderer ──
export const StepsRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'steps',
  render: ({ block }) => {
    const b = block as StepsBlock;
    const steps = b.steps || [];
    return (
      <div className="semantic-steps">
        {b.title ? <div className="semantic-steps__title">{b.title}</div> : null}
        <ol className="semantic-steps__list">
          {steps.map((step, idx) => (
            <li key={idx} className={classNames('semantic-steps__item', step.done && 'semantic-steps__item--done')}>
              <span className="semantic-steps__marker">{idx + 1}</span>
              <div>
                <div>{step.title}</div>
                {step.body ? <div className="semantic-steps__body">{step.body}</div> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  },
};

// ── Timeline Renderer ──
export const TimelineRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'timeline',
  render: ({ block }) => {
    const b = block as TimelineBlock;
    const events = b.events || [];
    return (
      <div className="semantic-timeline">
        {b.title ? <div className="semantic-timeline__title">{b.title}</div> : null}
        <div className="semantic-timeline__track">
          {events.map((event, idx) => (
            <div key={idx} className={classNames('semantic-timeline__event', `semantic-timeline__event--${event.status || 'pending'}`)}>
              <div className="semantic-timeline__dot" />
              <div>
                {event.time ? <div className="semantic-timeline__time">{event.time}</div> : null}
                <div>{event.title}</div>
                {event.body ? <div className="semantic-timeline__body">{event.body}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },
};

// ── List Renderer ──
export const ListRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'list',
  render: ({ block }) => {
    const b = block as ListBlock;
    const Tag = b.ordered ? 'ol' : 'ul';
    return (
      <Tag className="semantic-list">
        {b.items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </Tag>
    );
  },
};

// ── Math Renderer ──
export const MathRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'math',
  render: ({ block }) => {
    const b = block as MathBlock;
    return (
      <div className="semantic-math">
        <code>{b.latex}</code>
      </div>
    );
  },
};

// ── Mermaid Renderer ──
export const MermaidRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'mermaid',
  render: ({ block }) => {
    const b = block as MermaidBlock;
    return (
      <div className="semantic-mermaid">
        <pre>{b.code}</pre>
        {b.error ? <div className="semantic-mermaid__error">{b.error}</div> : null}
      </div>
    );
  },
};

// ── Media Renderer (image / video / audio) ──
export const MediaRenderer: BlockRenderer = {
  canRender: (block) => ['image', 'video', 'audio'].includes(block.type),
  render: ({ block }) => {
    const b = block as MediaBlock;
    if (b.type === 'image' && b.url) {
      return (
        <div className="semantic-media">
          <img src={b.url} alt={b.alt || ''} className="semantic-media__img" loading="lazy" />
        </div>
      );
    }
    return (
      <div className="semantic-media">
        <div className="semantic-media__placeholder">{b.type}</div>
      </div>
    );
  },
};

// ── Suggestion Renderer ──
export const SuggestionRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'suggestion',
  render: ({ block, onAction }) => {
    const b = block as SuggestionBlock;
    const chips = b.chips || [];
    return (
      <div className="semantic-suggestions">
        {chips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            className="semantic-chip"
            onClick={() => onAction?.('select_suggestion', { blockId: block.id, value: chip.value })}
          >
            {chip.label}
          </button>
        ))}
      </div>
    );
  },
};

// ── Comparison Renderer ──
export const ComparisonRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'comparison',
  render: ({ block }) => {
    const b = block as ComparisonBlock;
    const rows = b.rows || [];
    const columns = b.columns || [];
    return (
      <div className="semantic-comparison">
        {b.title ? <div className="semantic-comparison__title">{b.title}</div> : null}
        <div className="semantic-table-wrap">
          <table className="semantic-table">
            <thead>
              <tr>
                {columns.map((col, i) => (
                  <th key={i}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td>{row.label}</td>
                  {row.values.map((value, cellIdx) => (
                    <td key={cellIdx}>{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  },
};

// ── Citation Renderer ──
export const CitationRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'citation',
  render: ({ block }) => {
    const b = block as CitationBlock;
    return (
      <div className="semantic-citation">
        <div className="semantic-citation__id">{b.id}</div>
        <div>{b.source}</div>
        {b.context ? <div className="semantic-citation__context">{b.context}</div> : null}
      </div>
    );
  },
};

// ── Form Renderer ──
export const FormRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'form',
  render: ({ block, onAction }) => {
    const b = block as FormBlock;
    const fields = b.fields || [];
    return (
      <div className="semantic-form">
        {b.title ? <div className="semantic-form__title">{b.title}</div> : null}
        <div className="semantic-form__fields">
          {fields.map((field, idx) => (
            <div key={idx} className="semantic-form__field">
              <label className="semantic-form__label">{field.label}</label>
              <input
                type={field.type || 'text'}
                className="semantic-form__input"
                placeholder={field.placeholder || ''}
              />
            </div>
          ))}
        </div>
        <button
          className="semantic-form__submit"
          onClick={() => onAction?.('submit_form', { blockId: block.id })}
        >
          Submit
        </button>
      </div>
    );
  },
};

// ── Search Result Renderer ──
export const SearchResultRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'search_result',
  render: ({ block }) => {
    const b = block as SearchResultBlock;
    const results = b.results || [];
    return (
      <div className="semantic-search-results">
        <div className="semantic-search-results__header">
          <Search size={14} />
          <span>Search Results ({results.length})</span>
        </div>
        <div className="semantic-search-results__list">
          {results.map((result, idx) => (
            <div key={idx} className="semantic-search-results__item">
              <div className="semantic-search-results__title">{result.title}</div>
              {result.url && <div className="semantic-search-results__url">{result.url}</div>}
              {result.snippet && <div className="semantic-search-results__snippet">{result.snippet}</div>}
            </div>
          ))}
        </div>
      </div>
    );
  },
};

// ── Skill Renderer ──
export const SkillRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'skill',
  render: ({ block, streaming }) => {
    const b = block as SkillBlock;
    const [expanded, setExpanded] = React.useState(false);
    const status = b.status || 'running';
    const hasLogs = Boolean(b.result || (b.logs && b.logs.length > 0));

    const node = (
      <section className="semantic-execution semantic-execution--skill">
        <button
          type="button"
          className={`semantic-execution__header tool-call-pill--${status}`}
          onClick={() => hasLogs && setExpanded((v) => !v)}
        >
          <span className="tool-call-icon-wrap tool-call-icon-wrap--skill">
            <Zap size={14} strokeWidth={2.1} className="skill-zap-icon" />
          </span>
          <span className="semantic-execution__kicker">skill</span>
          <span className="tool-call-copy"><span className="tool-call-verb">{b.skillName}</span>{b.description && <span className="tool-call-summary">{b.description}</span>}</span>
          <span className={`tool-call-status-indicator tool-call-status-indicator--${status}`} />
          {hasLogs && (
            <ChevronDown className={`tool-call-chevron${expanded ? ' is-expanded' : ''}`} size={14} />
          )}
        </button>
        {expanded && hasLogs && (
          <div className="semantic-execution__body">
            {b.result && <pre className="semantic-execution__output">{b.result}</pre>}
            {b.logs && b.logs.length > 0 && !b.result && (
              <pre className="semantic-execution__output">{b.logs.join('\n')}</pre>
            )}
          </div>
        )}
      </section>
    );
    return streaming && block.state !== 'complete' ? animateBlock(node, block.id) : node;
  },
};

// ── Browser Action Renderer ──
export const BrowserActionRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'browser_action',
  render: ({ block, streaming }) => {
    const b = block as BrowserActionBlock;
    const node = (
      <div className="semantic-browser">
        <div className="semantic-browser__header">
          <Globe size={14} />
          <span>{b.domActions?.[0] || 'Browsing'}</span>
          {b.visitedUrls?.[0] && <span className="semantic-browser__url">{b.visitedUrls[0]}</span>}
        </div>
        {b.screenshot && (
          <div className="semantic-browser__screenshot">
            <img src={b.screenshot} alt="Browser screenshot" loading="lazy" />
          </div>
        )}
      </div>
    );
    return streaming && block.state !== 'complete' ? animateBlock(node, block.id) : node;
  },
};

// ── Notification Renderer ──
export const NotificationRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'notification',
  render: ({ block }) => {
    const b = block as NotificationBlock;
    return (
      <div className={classNames('semantic-notification', `semantic-notification--${b.severity || 'info'}`)}>
        <Bell size={14} />
        <div>
          <div className="semantic-notification__title">{b.message}</div>
        </div>
      </div>
    );
  },
};

// ── Custom Widget Renderer ──
export const CustomWidgetRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'custom_widget',
  render: ({ block }) => {
    const b = block as CustomWidgetBlock;
    return (
      <div className="semantic-custom-widget">
        <div className="semantic-custom-widget__header">
          <span>{b.widgetType || 'Custom Widget'}</span>
        </div>
        <pre className="semantic-custom-widget__data">{JSON.stringify(b.props, null, 2)}</pre>
      </div>
    );
  },
};

// ── Divider Renderer ──
export const DividerRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'divider',
  render: () => <hr className="semantic-divider" />,
};

// ── Fallback Renderer ──
export const FallbackRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'fallback',
  render: ({ block }) => {
    const b = block as FallbackBlock;
    return <div className="semantic-fallback">{b.markdown}</div>;
  },
};

// ── File Renderer ──
export const FileRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'file',
  render: ({ block }) => {
    const b = block as FileBlock;
    return (
      <section className="semantic-file semantic-file--detail">
        <div className="semantic-file__icon"><FileText size={14} /></div>
        <div className="semantic-file__copy">
          <strong>{b.name}</strong>
          <span>{b.ext ? `${b.ext.toUpperCase()} file` : 'File'}</span>
        </div>
        {b.sizeBytes > 0 && <span className="semantic-file__size">{formatBytes(b.sizeBytes)}</span>}
        {b.preview && <pre className="semantic-file__preview">{b.preview}</pre>}
      </section>
    );
  },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── JSON Renderer ──
export const JsonRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'json',
  render: ({ block }) => {
    const b = block as JsonBlock;
    return (
      <div className="semantic-code">
        <div className="semantic-code__header">
          <span className="semantic-code__lang">JSON</span>
        </div>
        <pre className="semantic-code__pre"><code>{b.raw}</code></pre>
      </div>
    );
  },
};

// ── XML Renderer ──
export const XmlRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'xml',
  render: ({ block }) => {
    const b = block as XmlBlock;
    return (
      <div className="semantic-code">
        <div className="semantic-code__header">
          <span className="semantic-code__lang">XML</span>
        </div>
        <pre className="semantic-code__pre"><code>{b.raw}</code></pre>
      </div>
    );
  },
};
