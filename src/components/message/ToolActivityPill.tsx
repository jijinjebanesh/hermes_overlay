import React from 'react';
import { Terminal, PenLine, Search, Globe, Zap } from 'lucide-react';
import { StreamSegment } from '../../store/overlayStore';

interface ToolActivityPillProps {
  segment: StreamSegment;
}

const getToolIcon = (content: string) => {
  if (content.includes('terminal')) return <Terminal size={12} />;
  if (content.includes('write_file') || content.includes('edit_file')) return <PenLine size={12} />;
  if (content.includes('search') || content.includes('find')) return <Search size={12} />;
  if (content.includes('web') || content.includes('browse')) return <Globe size={12} />;
  return <Zap size={12} />;
};

export const ToolActivityPill: React.FC<ToolActivityPillProps> = ({ segment }) => {
  return (
    <div className="tool-activity-pill">
      <span className="tool-activity-icon">{getToolIcon(segment.content)}</span>
      <span className="tool-activity-text">{segment.content}</span>
    </div>
  );
};
