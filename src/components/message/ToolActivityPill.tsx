import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, FolderOpen, Globe2, PenLine, Search, Terminal, Wrench } from 'lucide-react';
import { StreamSegment } from '../../store/overlayStore';
import { CodeBlock } from './CodeBlock';

interface ToolActivityPillProps {
  segment: StreamSegment;
}

const getToolVisual = (content: string) => {
  const value = content.toLowerCase();
  if (value.includes('terminal') || value.includes('bash') || value.includes('shell')) return { Icon: Terminal, verb: 'Ran a command' };
  if (value.includes('write') || value.includes('edit') || value.includes('patch')) return { Icon: PenLine, verb: 'Updated a file' };
  if (value.includes('search') || value.includes('find') || value.includes('grep')) return { Icon: Search, verb: 'Searched project files' };
  if (value.includes('web') || value.includes('browse') || value.includes('url') || value.includes('http')) return { Icon: Globe2, verb: 'Looked something up' };
  if (value.includes('read') || value.includes('file') || value.includes('dir')) return { Icon: FolderOpen, verb: 'Read a file' };
  return { Icon: Wrench, verb: 'Used a tool' };
};

const formatLabel = (content: string) => {
  const label = content
    .replace(/^[│┊]\s*/gm, '')
    .replace(/(?:💻|✍️|🔍|📁|🌐|⚡|🔧|📝|🛠️|⚙️|🔒)\s*/g, '')
    .replace(/\s+·\s+\{[\s\S]*$/, '')
    .replace(/…$/, '')
    .replace(/^preparing\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return label.length > 112 ? `${label.slice(0, 109)}…` : label || 'Tool activity';
};

export const ToolActivityPill: React.FC<ToolActivityPillProps> = ({ segment }) => {
  const [expanded, setExpanded] = useState(false);
  const { Icon, verb } = getToolVisual(segment.content);
  const label = formatLabel(segment.content);
  const hasDetail = segment.content.trim().length > label.length || segment.content.includes('\n');

  return (
    <div className="tool-call-card">
      <button
        type="button"
        className="tool-call-pill tool-call-pill--pending"
        onClick={() => hasDetail && setExpanded((value) => !value)}
        aria-expanded={hasDetail ? expanded : undefined}
        aria-label={`${expanded ? 'Hide' : 'Show'} details for ${verb}`}
      >
        <span className="tool-call-icon"><Icon size={14} strokeWidth={2.1} /></span>
        <span className="tool-call-copy">
          <span className="tool-call-verb">{verb}</span>
          <span className="tool-call-summary">{label}</span>
        </span>
        {hasDetail && <ChevronDown className={`tool-call-chevron${expanded ? ' is-expanded' : ''}`} size={14} />}
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
            <CodeBlock code={segment.content} language="text" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
