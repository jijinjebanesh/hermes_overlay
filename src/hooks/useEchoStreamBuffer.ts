import { useState, useEffect, useRef } from 'react';
import { StreamBuffer, type RenderMode } from '../engine/ResponseRenderer';

/**
 * useEchoStreamBuffer — streaming text buffer for Echo mode.
 *
 * Echo mode receives full accumulated text on each `raw` update from the
 * voice engine. This hook diffs against the previous length, feeds only
 * the delta through a StreamBuffer, and exposes the incremental chunks
 * plus the processed full text for display.
 *
 * The raw text is preserved separately for TTS word-boundary sync.
 */
export function useEchoStreamBuffer(raw: string, mode: RenderMode) {
  const [displayChunks, setDisplayChunks] = useState<string[]>([]);
  const [processedFullText, setProcessedFullText] = useState('');
  const bufferRef = useRef<StreamBuffer | null>(null);
  const lastLenRef = useRef(0);
  const flushedRef = useRef(false);

  useEffect(() => {
    if (!bufferRef.current) {
      bufferRef.current = new StreamBuffer(mode);
      lastLenRef.current = 0;
      flushedRef.current = false;
      setDisplayChunks([]);
      setProcessedFullText('');
    }
  }, [mode]);

  useEffect(() => {
    const buffer = bufferRef.current;
    if (!buffer) return;

    const currentLen = raw.length;
    const prevLen = lastLenRef.current;

    if (currentLen > prevLen) {
      const delta = raw.slice(prevLen);
      lastLenRef.current = currentLen;
      const emitted = buffer.feed(delta);
      if (emitted.length > 0) {
        setDisplayChunks((prev) => [...prev, ...emitted]);
      }
      // Also update the full processed text for display
      setProcessedFullText(raw);
    } else if (currentLen === 0 && prevLen > 0 && !flushedRef.current) {
      // Reset on new turn
      buffer.reset(mode);
      lastLenRef.current = 0;
      flushedRef.current = false;
      setDisplayChunks([]);
      setProcessedFullText('');
    }
  }, [raw, mode]);

  // Flush on unmount / stream end
  useEffect(() => {
    return () => {
      if (bufferRef.current && !flushedRef.current) {
        flushedRef.current = true;
        const flushed = bufferRef.current.flush();
        bufferRef.current = null;
        if (flushed.length > 0) {
          setDisplayChunks((prev) => [...prev, ...flushed]);
        }
      }
    };
  }, []);

  return {
    displayChunks,
    processedFullText,
  };
}
