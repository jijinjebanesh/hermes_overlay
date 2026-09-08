// src/core/tokenizer.ts

/**
 * Incremental tokenizer for streamed LLM output.
 * Very lightweight – splits on whitespace and preserves punctuation.
 * Returns an array of tokens for the given chunk (the caller can
 * concatenate with previously emitted tokens if needed).
 */
export function tokenize(chunk: string): string[] {
  // Split on spaces, keep punctuation attached to words.
  // This is sufficient for the sliding‑window detectors.
  return chunk
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}
