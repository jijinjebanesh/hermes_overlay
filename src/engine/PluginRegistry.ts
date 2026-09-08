import type { BlockType, SemanticBlock, BlockRenderer } from '../semantic/types';

export class PluginRegistry {
  private static renderers = new Map<string, BlockRenderer>();

  static register(blockType: BlockType, renderer: BlockRenderer): void {
    this.renderers.set(blockType, renderer);
  }

  static getRenderer(blockType: string): BlockRenderer | undefined {
    return this.renderers.get(blockType);
  }

  static hasRenderer(blockType: string): boolean {
    return this.renderers.has(blockType);
  }
}
