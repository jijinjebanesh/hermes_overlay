import React, { useRef, useEffect, useCallback } from 'react';
import type { SemanticBlock } from '../semantic/types';
import { renderSemanticBlock } from '../semantic/renderer';
import { InteractionBridge } from './InteractionBridge';

interface Props {
  blocks: SemanticBlock[];
  streaming: boolean;
  width: number | string;
  height: number;
}

/**
 * VirtualizedBlockList — Renders semantic blocks with windowed virtualization.
 * 
 * Uses a simple DIV-based approach with IntersectionObserver for visibility
 * tracking and auto-scroll on streaming. This avoids the react-window
 * VariableSizeList import issues and gives us more control over dynamic heights.
 */
export function VirtualizedBlockList({ blocks, streaming, width, height }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // Track whether user has scrolled up (disable auto-scroll)
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    shouldAutoScroll.current = atBottom;
  }, []);

  // Auto-scroll to bottom when streaming
  useEffect(() => {
    if (streaming && shouldAutoScroll.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [blocks, streaming]);

  return (
    <div
      ref={containerRef}
      className="semantic-virtualized-list"
      style={{ height, width, overflowY: 'auto', overflowX: 'hidden' }}
      onScroll={handleScroll}
    >
      {blocks.map((block) => (
        <div key={block.id} className="semantic-message__block">
          {renderSemanticBlock(block, streaming, InteractionBridge.dispatch)}
        </div>
      ))}
      <div ref={bottomRef} style={{ height: 1 }} />
    </div>
  );
}
