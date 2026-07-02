import React, { useState } from 'react';
import { ChevronRight, ChevronDown, FileText } from 'lucide-react';

interface DiffBlockProps {
  content: string;
}

export const DiffBlock: React.FC<DiffBlockProps> = ({ content }) => {
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
