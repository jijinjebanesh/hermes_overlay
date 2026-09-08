import type { SemanticBlock } from '../semantic/types';
import { StreamEngine } from '../engine/StreamEngine';

export interface StreamUpdate {
  raw: string;
  blocks: SemanticBlock[];
  completedCount: number;
}

export class StreamingSemanticParser {
  private engine: StreamEngine;
  private messageId: string;

  constructor(messageId: string) {
    this.messageId = messageId;
    this.engine = new StreamEngine(messageId);
  }

  feed(chunk: string): StreamUpdate {
    this.engine.feed(chunk);
    return this.getCurrentState();
  }

  flush(): StreamUpdate {
    this.engine.flush();
    return this.getCurrentState();
  }

  reset(messageId = this.messageId): void {
    this.messageId = messageId;
    this.engine = new StreamEngine(messageId);
  }

  getRaw(): string {
    return this.engine.getRaw();
  }

  getBlocks(): SemanticBlock[] {
    return this.engine.getAST().blocks;
  }

  private getCurrentState(): StreamUpdate {
    const blocks = this.getBlocks();
    const completedCount = blocks.filter((b) => b.state === 'complete').length;
    return { raw: this.getRaw(), blocks, completedCount };
  }
}
