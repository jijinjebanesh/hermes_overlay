import { useState, useEffect, useRef } from 'react';
import { StreamBuffer, type RenderMode } from '../engine/ResponseRenderer';

/**
 * useStreamBuffer — incremental streaming renderer for assistant messages.
 *
 * Feeds deltas from `raw` into a StreamBuffer and exposes the emitted chunks
 * so the UI can paint them token-by-token, matching Hermes CLI's streaming
 * behaviour: paragraphs stream progressively, tables are buffered and only
 * appear once complete, long partial lines wrap at terminal width, and
 * markdown stripping happens during streaming in strip mode.
 */
export function useStreamBuffer(raw: string, isStreaming: boolean, mode: RenderMode) {
  const [chunks, setChunks] = useState<string[]>([]);
  const [pendingText, setPendingText] = useState('');
  const bufferRef = useRef<StreamBuffer | null>(null);
  const lastLenRef = useRef(0);
  const flushedRef = useRef(false);

  // Reset buffer when a new stream starts
  useEffect(() => {
    if (isStreaming) {
      bufferRef.current = new StreamBuffer(mode);
      lastLenRef.current = 0;
      flushedRef.current = false;
      setChunks([]);
      setPendingText('');
    }
  }, [isStreaming, mode]);

  // Feed deltas as raw text grows
  useEffect(() => {
    if (!isStreaming || !bufferRef.current) return;

    const buffer = bufferRef.current;
    const currentLen = raw.length;
    const prevLen = lastLenRef.current;

    if (currentLen > prevLen) {
      const delta = raw.slice(prevLen);
      lastLenRef.current = currentLen;
      const emitted = buffer.feed(delta);
      if (emitted.length > 0) {
        setChunks((prev) => [...prev, ...emitted]);
      }
      setPendingText(buffer.getPendingText());
    }
  }, [raw, isStreaming]);

  // Flush remaining buffer when stream ends
  useEffect(() => {
    if (isStreaming || flushedRef.current) return;
    if (!bufferRef.current) return;

    flushedRef.current = true;
    const flushed = bufferRef.current.flush();
    bufferRef.current = null;
    if (flushed.length > 0) {
      setChunks((prev) => [...prev, ...flushed]);
    }
    setPendingText('');
  }, [isStreaming]);

  const committed = chunks.filter((chunk) => chunk !== '__BOX_HEADER__');
  const displayText = committed.length > 0
    ? committed.join('\n') + '\n' + pendingText
    : pendingText;

  return { chunks, pendingText, displayText };
}
