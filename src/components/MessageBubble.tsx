import React, { useState } from 'react';
import { Message, ToolCall, StreamSegment } from '../store/overlayStore';
import { ChevronRight, ChevronDown, Terminal, PenLine, Search, Globe, Zap, FileText, Cpu } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}


/* ════════════════════════════════════════════════
   CODE BLOCK — with one-click copy button
   ════════════════════════════════════════════════ */

const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // Minimal 3-colour syntax highlighter
  const highlight = (text: string) => {
    return text.split('\n').map((line, i) => {
      let html = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/(\/\/.*$)/gm, '<span class="token comment">$1</span>')
        .replace(/(#.*$)/gm, '<span class="token comment">$1</span>')
        .replace(/(['"`])(.*?)\1/g, '<span class="token string">$1$2$1</span>')
        .replace(
          /\b(import|from|export|const|let|var|function|return|if|else|for|while|class|switch|case|break|default|new|this|typeof|instanceof|async|await|try|catch|throw|finally|yield|void|delete|in|of|def|print|True|False|None)\\b/g,
          '<span class="token keyword">$1</span>'
        );

      return <div key={i} dangerouslySetInnerHTML={{ __html: html || ' ' }} />;
    });
  };

  return (
    <div className="code-block">
      <div className="code-block-header">
        {language && <span className="code-block-lang">{language}</span>}
        <button
          className={`code-copy-btn${copied ? ' copied' : ''}`}
          onClick={handleCopy}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="code-block-content selectable">
        {highlight(code)}
      </div>
    </div>
  );
};


/* ════════════════════════════════════════════════
   DIFF BLOCK — shows file diffs with color coding
   ════════════════════════════════════════════════ */

const DiffBlock: React.FC<{ content: string }> = ({ content }) => {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split('\n');
  const firstLine = lines[0] || 'File diff';

  return (
    <div className="diff-block">
      <button
        className="diff-block-header"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <FileText size={12} />
        <span className="diff-block-title">{firstLine}</span>
      </button>
      {expanded && (
        <div className="diff-block-content selectable">
          {lines.slice(1).map((line, i) => {
            let cls = 'diff-line';
            if (line.startsWith('+')) cls += ' diff-add';
            else if (line.startsWith('-')) cls += ' diff-remove';
            else if (line.startsWith('@@')) cls += ' diff-range';
            return <div key={i} className={cls}>{line || ' '}</div>;
          })}
        </div>
      )}
    </div>
  );
};


/* ════════════════════════════════════════════════
   TOOL ACTIVITY PILL — shows hermes tool actions
   Like terminal output:
     💻 preparing terminal…
     ✍️ preparing write_file…
   ════════════════════════════════════════════════ */

const getToolIcon = (content: string) => {
  if (content.includes('terminal')) return <Terminal size={12} />;
  if (content.includes('write_file') || content.includes('edit_file')) return <PenLine size={12} />;
  if (content.includes('search') || content.includes('find')) return <Search size={12} />;
  if (content.includes('web') || content.includes('browse')) return <Globe size={12} />;
  return <Zap size={12} />;
};

const ToolActivityPill: React.FC<{ segment: StreamSegment }> = ({ segment }) => {
  return (
    <div className="tool-activity-pill">
      <span className="tool-activity-icon">{getToolIcon(segment.content)}</span>
      <span className="tool-activity-text">{segment.content}</span>
    </div>
  );
};


/* ════════════════════════════════════════════════
   THINKING BLOCK — collapsible reasoning section
   Shows hermes' internal reasoning/planning
   ════════════════════════════════════════════════ */

const ThinkingBlock: React.FC<{ content: string }> = ({ content }) => {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split('\n');
  const preview = lines.slice(0, 2).join(' ').substring(0, 80);

  return (
    <div className="thinking-block">
      <button
        className="thinking-block-header"
        onClick={() => setExpanded(!expanded)}
      >
        <Cpu size={12} />
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span className="thinking-block-label">Thinking</span>
        {!expanded && (
          <span className="thinking-block-preview">{preview}…</span>
        )}
      </button>
      {expanded && (
        <div className="thinking-block-content selectable">
          {content}
        </div>
      )}
    </div>
  );
};


/* ════════════════════════════════════════════════
   TOOL CALL PILL — from store toolCalls
   ════════════════════════════════════════════════ */

const ToolCallBlock: React.FC<{ tool: ToolCall }> = ({ tool }) => {
  const [expanded, setExpanded] = useState(false);

  const statusClass = tool.status === 'error'
    ? 'status-error'
    : tool.status === 'success'
      ? 'status-success'
      : 'status-pending';

  return (
    <div>
      <button
        className={`tool-pill ${statusClass}`}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="tool-pill-chevron">{expanded ? '▼' : '▶'}</span>
        {tool.name} · {tool.command}
      </button>

      <div className={`tool-output ${expanded ? 'expanded' : 'collapsed'}`}>
        <div className="tool-output-content selectable">
          {tool.output || 'Running…'}
        </div>
      </div>
    </div>
  );
};


/* ════════════════════════════════════════════════
   MESSAGE BUBBLE
   User: right-aligned blue bubble
   Assistant: left-aligned, renders segments
   ════════════════════════════════════════════════ */

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  // Parse content: extract ```code blocks``` from text
  const renderTextContent = (content: string) => {
    if (!content) return null;
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).split('\n');
        let language = '';
        if (lines[0] && !lines[0].includes(' ')) {
          language = lines.shift() || '';
        }
        return <CodeBlock key={i} code={lines.join('\n').trim()} language={language} />;
      }
      if (!part.trim()) return null;
      return (
        <span
          key={i}
          className="selectable"
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {part}
        </span>
      );
    });
  };

  // ── USER MESSAGE ──
  if (message.role === 'user') {
    return (
      <div className="message-user-row message-row">
        <div className="message-user-bubble selectable">
          {message.content}
        </div>
        <div className="message-timestamp">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    );
  }

  // ── ASSISTANT MESSAGE ──
  const hasSegments = message.segments && message.segments.length > 0;

  return (
    <div className="message-row" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* Render structured segments if available */}
      {hasSegments && message.segments!.map((seg, idx) => {
        switch (seg.type) {
          case 'tool_activity':
            return <ToolActivityPill key={idx} segment={seg} />;
          case 'diff':
            return <DiffBlock key={idx} content={seg.content} />;
          case 'thinking':
            return <ThinkingBlock key={idx} content={seg.content} />;
          case 'text':
            return (
              <div key={idx} className="message-assistant selectable">
                {renderTextContent(seg.content)}
              </div>
            );
          default:
            return null;
        }
      })}

      {/* Fallback: render plain content if no segments */}
      {!hasSegments && message.content && (
        <div className="message-assistant selectable">
          {renderTextContent(message.content)}
        </div>
      )}

      {message.cancelled && (
        <span className="message-cancelled">(cancelled)</span>
      )}

      {message.toolCalls && message.toolCalls.map((tool) => (
        <ToolCallBlock key={tool.id} tool={tool} />
      ))}
    </div>
  );
};
