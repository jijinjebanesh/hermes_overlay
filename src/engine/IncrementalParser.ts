import type { StreamEvent, SemanticBlock } from '../semantic/types';
import { buildSemanticBlocks } from '../semantic/block-builder';
import { ResponseAST } from './ResponseAST';

export class IncrementalParser {
  private messageId: string;
  private currentBlocks: SemanticBlock[] = [];

  constructor(messageId: string) {
    this.messageId = messageId;
  }

  feed(raw: string): StreamEvent[] {
    // We delegate the heavy lifting to block-builder, but we pass currentBlocks
    // to preserve block IDs and compute the diff.
    const { blocks } = buildSemanticBlocks(raw, this.messageId);
    
    const events: StreamEvent[] = [];
    
    const oldById = new Map(this.currentBlocks.map(b => [b.id, b]));
    const newById = new Map(blocks.map(b => [b.id, b]));
    
    for (const b of blocks) {
      if (!oldById.has(b.id)) {
        events.push({ type: 'block_start', blockType: b.type, id: b.id });
        events.push({ type: 'block_update', id: b.id, patch: b });
      } else {
        const old = oldById.get(b.id)!;
        if (JSON.stringify(old) !== JSON.stringify(b)) {
          events.push({ type: 'block_update', id: b.id, patch: b });
        }
        if (old.state !== 'complete' && b.state === 'complete') {
          events.push({ type: 'block_end', id: b.id });
        }
      }
    }
    
    this.currentBlocks = blocks;
    return events;
  }

  flush(): StreamEvent[] {
    const events: StreamEvent[] = [];
    for (const b of this.currentBlocks) {
      if (b.state !== 'complete') {
        b.state = 'complete';
        events.push({ type: 'block_update', id: b.id, patch: { state: 'complete' } });
        events.push({ type: 'block_end', id: b.id });
      }
    }
    return events;
  }

  getAST(): ResponseAST {
    return new ResponseAST(this.messageId, JSON.parse(JSON.stringify(this.currentBlocks)));
  }
}
