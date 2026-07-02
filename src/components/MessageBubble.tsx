import React, { useState } from 'react';
import { Copy, RotateCw, Edit2, Check } from 'lucide-react';
import { Message } from '../store/overlayStore';
import { AttachmentChip } from './AttachmentChip';
import { CodeBlock } from './message/CodeBlock';
import { DiffBlock } from './message/DiffBlock';
import { ToolActivityPill } from './message/ToolActivityPill';
import { ThinkingBlock } from './message/ThinkingBlock';
import { ToolCallBlock } from './message/ToolCallBlock';

interface MessageBubbleProps {
  message: Message;
  onRetry?: () => void;
  onEdit?: () => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onRetry, onEdit }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyText = () => {
    let textToCopy = message.content || '';
    if (!textToCopy && message.segments) {
      const textSegments = message.segments.filter(s => s.type === 'text');
      textToCopy = textSegments.map(s => s.content).join('\n\n');
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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

  const renderMessageActions = () => (
    <div className="message-actions-toolbar">
      <button 
        className="message-action-btn" 
        onClick={handleCopyText} 
        title="Copy text"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      {onEdit && message.role === 'user' && (
        <button 
          className="message-action-btn" 
          onClick={onEdit} 
          title="Edit message"
        >
          <Edit2 size={12} />
        </button>
      )}
      {onRetry && message.role === 'assistant' && (
        <button 
          className="message-action-btn" 
          onClick={onRetry} 
          title="Retry response"
        >
          <RotateCw size={12} />
        </button>
      )}
    </div>
  );

  // ── USER MESSAGE ──
  if (message.role === 'user') {
    return (
      <div className="message-user-row message-row">
        <div className="message-user-bubble selectable">
          {message.attachments && message.attachments.length > 0 && (
            <div className="message-attachments">
              {message.attachments.map((file) => (
                <AttachmentChip key={file.id} file={file} variant="sent" />
              ))}
            </div>
          )}
          {message.content}
          
          <div className="message-actions-container">
            {renderMessageActions()}
          </div>
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
    <div className="message-row" style={{ display: 'flex', flexDirection: 'column', width: '100%', position: 'relative' }}>
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
      
      {!message.isStreaming && (
        <div className="message-actions-container-assistant">
          {renderMessageActions()}
        </div>
      )}
    </div>
  );
};
