import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { SemanticBlock } from '../semantic/types';
import { StreamEngine } from '../engine/StreamEngine';
import { useOverlayStore } from '../store/overlayStore';

export interface UseSemanticStreamOptions {
  /** Raw text from the live response stream. */
  raw: string;
  /** Stable assistant message id. */
  messageId: string;
  /** Rebuild on every chunk when true; when false only rebuilds when new completed blocks appear. */
  aggressive?: boolean;
}

export interface UseSemanticStreamResult {
  /** Current block tree for this message. */
  blocks: SemanticBlock[];
  /** Parse and return updated blocks from new raw text. */
  feed: (chunk: string) => SemanticBlock[];
  /** Finalize any in-progress partial blocks when stream ends. */
  flush: () => SemanticBlock[];
  /** Reset parser state for a new message. */
  reset: (messageId?: string) => void;
  /** Number of completed blocks in the latest parse. */
  completedCount: number;
}

/**
 * Primary hook for streaming semantic parsing.
 * 
 * Wraps the StreamEngine and integrates with the Zustand store
 * for AST persistence. When a conversation is reloaded, blocks
 * stored on the message are used directly, bypassing re-parsing.
 */
export function useSemanticStream({
  raw,
  messageId,
  aggressive = false,
}: UseSemanticStreamOptions): UseSemanticStreamResult {
  const engineRef = useRef<StreamEngine | null>(null);
  const [blocks, setBlocks] = useState<SemanticBlock[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const lastRawLenRef = useRef(0);
  const hydrateBlocks = useOverlayStore((s) => s.hydrateBlocks);

  // Try to hydrate from persisted blocks on the message
  const persistedBlocks = useOverlayStore(
    (s) => s.messages.find((m) => m.id === messageId)?.blocks
  );

  // Initialize engine
  if (!engineRef.current) {
    engineRef.current = new StreamEngine(messageId);
    // If we have persisted blocks, use them directly (conversation reload)
    if (persistedBlocks && persistedBlocks.length > 0 && !raw) {
      setBlocks(persistedBlocks);
      setCompletedCount(persistedBlocks.filter((b) => b.state === 'complete').length);
      lastRawLenRef.current = -1; // signal that we're hydrated
    }
  }

  // Feed new raw text into the engine
  useEffect(() => {
    const engine = engineRef.current!;
    const currentRawLen = raw.length;

    if (lastRawLenRef.current === -1) {
      // Hydrated from persisted blocks — start tracking from current raw length
      lastRawLenRef.current = currentRawLen;
      return;
    }

    if (currentRawLen > lastRawLenRef.current) {
      const newChunk = raw.slice(lastRawLenRef.current);
      engine.feed(newChunk);
      lastRawLenRef.current = currentRawLen;

      const ast = engine.getAST();
      const newCompleted = ast.blocks.filter((b) => b.state === 'complete').length;

      if (aggressive || newCompleted !== completedCount) {
        setBlocks(ast.blocks);
        setCompletedCount(newCompleted);
      }
    }
  }, [raw, aggressive, completedCount]);

  const feed = useCallback((chunk: string): SemanticBlock[] => {
    const engine = engineRef.current!;
    engine.feed(chunk);
    lastRawLenRef.current += chunk.length;
    const ast = engine.getAST();
    setBlocks(ast.blocks);
    setCompletedCount(ast.blocks.filter((b) => b.state === 'complete').length);
    return ast.blocks;
  }, []);

  const flush = useCallback((): SemanticBlock[] => {
    const engine = engineRef.current!;
    engine.flush();
    const ast = engine.getAST();
    const finalBlocks = ast.blocks;
    setBlocks(finalBlocks);
    setCompletedCount(finalBlocks.filter((b) => b.state === 'complete').length);

    // Persist finalized blocks to the store for conversation reload
    hydrateBlocks(messageId, finalBlocks);

    return finalBlocks;
  }, [messageId, hydrateBlocks]);

  const reset = useCallback((nextMessageId = messageId): void => {
    engineRef.current = new StreamEngine(nextMessageId);
    lastRawLenRef.current = 0;
    setBlocks([]);
    setCompletedCount(0);
  }, [messageId]);

  return { blocks, feed, flush, reset, completedCount };
}
