import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DiffBlock } from './DiffBlock';
import {
  ToolCompleteSegment,
  ToolStartSegment,
  ToolCompleteDisplay,
  formatToolCompleteForDisplay,
  formatToolStartForDisplay,
} from './toolDisplay';

interface ToolPillProps {
  segment: ToolStartSegment | ToolCompleteSegment;
  isStart?: boolean;
}

const ToolPill: React.FC<ToolPillProps> = ({ segment, isStart = false }) => {
  const [expanded, setExpanded] = useState(false);
  const display = isStart
    ? formatToolStartForDisplay(segment as ToolStartSegment)
    : formatToolCompleteForDisplay(segment as ToolCompleteSegment);

  const diffText = (segment as ToolCompleteSegment).inlineDiff || (segment as ToolCompleteSegment).inline_diff;
  const diffLines = (segment as ToolCompleteSegment).diffLines;
  const hasDetail = !isStart && !!(diffText || (diffLines && diffLines.length > 0));

  if (isStart) {
    return (
      <div className="hermes-tool-line hermes-tool-line--start">
        <span className="hermes-tool-tree">┊</span>
        <span className="hermes-tool-emoji">{display.emoji}</span>
        <span className="hermes-tool-verb">preparing</span>
        <span className="hermes-tool-name">{display.detail || segment.name}…</span>
        <span className="hermes-tool-pulse" />
      </div>
    );
  }

  const isError = !!(segment as ToolCompleteSegment).error;
  const completeDisplay = display as ToolCompleteDisplay;

  return (
    <div className={`hermes-tool-wrapper ${isError ? 'has-error' : ''}`}>
      <div className="hermes-tool-line hermes-tool-line--complete">
        <span className="hermes-tool-tree">┊</span>
        <span className="hermes-tool-emoji">{completeDisplay.emoji}</span>
        <span className="hermes-tool-verb">{completeDisplay.verb}</span>
        <span className="hermes-tool-detail">{completeDisplay.detail}</span>
        {completeDisplay.duration != null && (
          <span className="hermes-tool-duration">{completeDisplay.duration.toFixed(1)}s</span>
        )}
        {completeDisplay.error && (
          <span className="hermes-tool-error-tag">[{completeDisplay.error}]</span>
        )}
        {hasDetail && (
          <button
            type="button"
            className="hermes-tool-diff-toggle"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Collapse diff' : 'Review diff'}
          >
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span>review diff</span>
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && hasDetail && (
          <motion.div
            className="hermes-tool-diff-container"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <DiffBlock content={diffText || ''} diffLines={diffLines} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const ToolActivityPill: React.FC<{ segment: any }> = ({ segment }) => {
  if (!segment) return null;

  if (segment.type === 'tool_start') {
    return <ToolPill segment={segment} isStart={true} />;
  }

  if (segment.type === 'tool_complete') {
    return <ToolPill segment={segment} isStart={false} />;
  }

  if (segment.type === 'diff' && (segment.content || segment.diffLines)) {
    return <DiffBlock content={segment.content || ''} diffLines={segment.diffLines} />;
  }

  if (segment.content) {
    return (
      <div className="hermes-tool-line">
        <span className="hermes-tool-tree">┊</span>
        <span className="hermes-tool-detail">{segment.content}</span>
      </div>
    );
  }

  return null;
};
