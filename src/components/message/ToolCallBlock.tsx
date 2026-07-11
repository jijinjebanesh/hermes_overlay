import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  FolderOpen,
  Globe2,
  PenLine,
  Search,
  Terminal,
  Wrench,
} from 'lucide-react';
import { ToolCall } from '../../store/overlayStore';
import { CodeBlock } from './CodeBlock';

interface ToolCallBlockProps {
  tool: ToolCall;
}

const getToolVisual = (name: string) => {
  const tool = name.toLowerCase();
  if (tool.includes('terminal') || tool.includes('shell') || tool.includes('command')) return { Icon: Terminal, verb: 'Ran a command' };
  if (tool.includes('search') || tool.includes('find') || tool.includes('grep')) return { Icon: Search, verb: 'Searched project files' };
  if (tool.includes('web') || tool.includes('browser') || tool.includes('url')) return { Icon: Globe2, verb: 'Looked something up' };
  if (tool.includes('write') || tool.includes('edit') || tool.includes('patch')) return { Icon: PenLine, verb: 'Updated a file' };
  if (tool.includes('read') || tool.includes('file')) return { Icon: FolderOpen, verb: 'Read a file' };
  return { Icon: Wrench, verb: 'Used a tool' };
};

const summarizeCommand = (tool: ToolCall): string => {
  const raw = tool.command?.trim() || '';
  if (!raw) return tool.name || 'Tool activity';

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed) {
      const candidate = parsed.command || parsed.path || parsed.query || parsed.url || parsed.text;
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
  } catch {
    // The command is already a human-readable value.
  }

  return raw.replace(/\s+/g, ' ').trim();
};

export const ToolCallBlock: React.FC<ToolCallBlockProps> = ({ tool }) => {
  const [expanded, setExpanded] = useState(false);
  const { Icon, verb } = getToolVisual(tool.name);
  const summary = summarizeCommand(tool);
  const status = tool.status || 'pending';
  const detail = [
    `Tool: ${tool.name || 'unknown'}`,
    summary && `Request: ${summary}`,
    tool.output && `Output:\n${tool.output}`,
  ].filter(Boolean).join('\n\n');
  const hasDetail = Boolean(detail);

  return (
    <div className="tool-call-card">
      <button
        type="button"
        className={`tool-call-pill tool-call-pill--${status}`}
        onClick={() => hasDetail && setExpanded((value) => !value)}
        aria-expanded={hasDetail ? expanded : undefined}
        aria-label={`${expanded ? 'Hide' : 'Show'} details for ${tool.name || 'tool activity'}`}
      >
        <span className="tool-call-icon"><Icon size={14} strokeWidth={2.1} /></span>
        <span className="tool-call-copy">
          <span className="tool-call-verb">{verb}</span>
          <span className="tool-call-summary">{summary}</span>
        </span>
        {hasDetail && (
          <ChevronDown className={`tool-call-chevron${expanded ? ' is-expanded' : ''}`} size={14} />
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && hasDetail && (
          <motion.div
            className="tool-call-detail"
            initial={{ height: 0, opacity: 0, y: -4 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <CodeBlock code={detail} language="text" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
