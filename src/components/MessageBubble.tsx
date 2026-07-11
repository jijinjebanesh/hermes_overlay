import React, { useState, useRef } from 'react';
import { Copy, RotateCw, Edit2, Check, Volume2, Square } from 'lucide-react';
import { Message } from '../store/overlayStore';
import { AttachmentChip } from './AttachmentChip';
import { AttachmentGallery } from './message/AttachmentGallery';
import { MarkdownContent } from './message/MarkdownContent';
import { DiffBlock } from './message/DiffBlock';
import { ToolActivityPill } from './message/ToolActivityPill';
import { ThinkingBlock } from './message/ThinkingBlock';
import { ToolCallBlock } from './message/ToolCallBlock';
import { getElectronAPI } from '../hooks/useElectronAPI';

const api = getElectronAPI();

interface MessageBubbleProps {
  message: Message;
  onRetry?: () => void;
  onEdit?: () => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ message, onRetry, onEdit }) => {
  const [copied, setCopied] = useState(false);
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

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

  const handleReadAloud = () => {
    if (isReadingAloud && ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.currentTime = 0;
      ttsAudioRef.current = null;
      setIsReadingAloud(false);
      return;
    }

    let textToRead = message.content || '';
    if (!textToRead && message.segments) {
      const textSegments = message.segments.filter(s => s.type === 'text');
      textToRead = textSegments.map(s => s.content).join('\n\n');
    }
    if (!textToRead.trim()) return;

    api?.synthesizeSpeech?.({ text: textToRead }).then((audioArray: number[]) => {
      if (!audioArray || audioArray.length === 0) return;
      const audioBuffer = new Uint8Array(audioArray).buffer;
      const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      ttsAudioRef.current = audio;
      audio.onended = () => {
        setIsReadingAloud(false);
        URL.revokeObjectURL(audioUrl);
        ttsAudioRef.current = null;
      };
      audio.onerror = () => {
        setIsReadingAloud(false);
        URL.revokeObjectURL(audioUrl);
        ttsAudioRef.current = null;
      };
      audio.play().catch(() => {
        setIsReadingAloud(false);
        URL.revokeObjectURL(audioUrl);
        ttsAudioRef.current = null;
      });
      setIsReadingAloud(true);
    }).catch(() => {
      setIsReadingAloud(false);
    });
  };

  /**
   * Live output arrives line-by-line; history usually arrives as one text segment.
   * Buffer adjacent text segments so both paths are parsed as the same Markdown
   * document—necessary for GFM constructs such as tables and nested lists.
   */
  const renderStructuredSegments = () => {
    if (!message.segments) return null;

    const rendered: React.ReactNode[] = [];
    let textBuffer: string[] = [];
    let textGroup = 0;

    const flushText = () => {
      const content = textBuffer.join('\n').trim();
      if (content) {
        rendered.push(
          <div key={`text-${textGroup++}`} className="message-assistant selectable">
            <MarkdownContent content={content} />
          </div>
        );
      }
      textBuffer = [];
    };

    message.segments.forEach((seg, idx) => {
      if (seg.type === 'text') {
        textBuffer.push(seg.content);
        return;
      }

      flushText();
      switch (seg.type) {
        case 'tool_activity':
          rendered.push(<ToolActivityPill key={`tool-${idx}`} segment={seg} />);
          break;
        case 'diff':
          rendered.push(<DiffBlock key={`diff-${idx}`} content={seg.content} />);
          break;
        case 'thinking':
          rendered.push(<ThinkingBlock key={`thinking-${idx}`} content={seg.content} />);
          break;
        // session_info is internal metadata and deliberately remains hidden.
      }
    });

    flushText();
    return rendered;
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
      {message.role === 'assistant' && (
        <button
          className="message-action-btn"
          onClick={handleReadAloud}
          title={isReadingAloud ? 'Stop reading' : 'Read aloud'}
        >
          {isReadingAloud ? <Square size={11} fill="currentColor" /> : <Volume2 size={12} />}
        </button>
      )}
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
            <>
              {/* Gallery for images when >1 image */}
              {message.attachments.filter(f => f.isImage).length > 1 && (
                <AttachmentGallery files={message.attachments} />
              )}
              {/* Chips for single images and all non-image files */}
              {(message.attachments.filter(f => f.isImage).length <= 1 || message.attachments.some(f => !f.isImage)) && (
                <div className="message-attachments">
                  {message.attachments.map((file) => (
                    <AttachmentChip key={file.id} file={file} variant="sent" />
                  ))}
                </div>
              )}
            </>
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
      {renderStructuredSegments()}

      {/* Fallback: render plain content if no segments */}
      {!hasSegments && message.content && (
        <div className="message-assistant selectable">
          <MarkdownContent content={message.content} />
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
});
