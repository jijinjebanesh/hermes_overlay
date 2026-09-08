import { StreamingTokenizer, type Token } from '../semantic/tokenizer';
import { IncrementalParser } from './IncrementalParser';
import type { StreamEvent, ResponseAST } from '../semantic/types';

export class StreamEngine {
  private tokenizer: StreamingTokenizer;
  private parser: IncrementalParser;
  private messageId: string;
  private listeners: Set<(event: StreamEvent) => void> = new Set();
  private raw: string = '';
  private paused: boolean = false;
  private buffer: string = '';

  constructor(messageId: string) {
    this.messageId = messageId;
    this.tokenizer = new StreamingTokenizer();
    this.parser = new IncrementalParser(messageId);
  }

  subscribe(listener: (event: StreamEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: StreamEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in StreamEngine listener', err);
      }
    }
  }

  feed(chunk: string) {
    if (this.paused) {
      this.buffer += chunk;
      return;
    }
    
    this.raw += chunk;
    const tokens = this.tokenizer.feed(chunk);
    
    for (const token of tokens) {
      this.emit({ type: 'token', value: token.value });
    }
    
    // We pass the new raw string to parser so it can run pattern matchers
    const events = this.parser.feed(this.raw);
    for (const event of events) {
      this.emit(event);
    }
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    if (this.buffer.length > 0) {
      const chunk = this.buffer;
      this.buffer = '';
      this.feed(chunk);
    }
  }

  flush() {
    if (this.buffer.length > 0) {
      this.raw += this.buffer;
      this.tokenizer.feed(this.buffer);
      this.buffer = '';
    }
    
    const tokens = this.tokenizer.flush();
    for (const token of tokens) {
      this.emit({ type: 'token', value: token.value });
    }
    
    const events = this.parser.feed(this.raw);
    for (const event of events) {
      this.emit(event);
    }
    
    const flushEvents = this.parser.flush();
    for (const event of flushEvents) {
      this.emit(event);
    }
    this.emit({ type: 'done' });
  }

  cancel() {
    this.emit({ type: 'cancel' });
    this.flush();
  }

  getAST(): ResponseAST {
    return this.parser.getAST();
  }

  getRaw(): string {
    return this.raw;
  }
}
