import type { SemanticBlock } from '../semantic/types';

export class ResponseAST {
  public id: string;
  public blocks: SemanticBlock[];
  public meta?: Record<string, unknown>;

  constructor(id: string, blocks: SemanticBlock[] = [], meta?: Record<string, unknown>) {
    this.id = id;
    this.blocks = blocks;
    this.meta = meta;
  }

  // Returns array of blocks that changed between this and other
  diff(other: ResponseAST): { added: SemanticBlock[], updated: SemanticBlock[], removed: string[] } {
    const oldById = new Map(this.blocks.map(b => [b.id, b]));
    const newById = new Map(other.blocks.map(b => [b.id, b]));
    
    const added: SemanticBlock[] = [];
    const updated: SemanticBlock[] = [];
    const removed: string[] = [];

    for (const b of other.blocks) {
      if (!oldById.has(b.id)) {
        added.push(b);
      } else if (JSON.stringify(oldById.get(b.id)) !== JSON.stringify(b)) {
        updated.push(b);
      }
    }

    for (const b of this.blocks) {
      if (!newById.has(b.id)) {
        removed.push(b.id);
      }
    }

    return { added, updated, removed };
  }

  serialize(): string {
    return JSON.stringify({ id: this.id, blocks: this.blocks, meta: this.meta });
  }

  static deserialize(data: string): ResponseAST {
    const parsed = JSON.parse(data);
    return new ResponseAST(parsed.id, parsed.blocks, parsed.meta);
  }
}
