import { useMemo } from 'react';
import type { SemanticBlock, BlockRenderer } from '../semantic/types';
import { PluginRegistry } from '../engine/PluginRegistry';
import { InteractionBridge } from '../engine/InteractionBridge';

export interface UseBlockRendererResult {
  /** Get the renderer for a specific block */
  getRenderer: (block: SemanticBlock) => BlockRenderer | undefined;
  /** Render a block using the plugin registry */
  renderBlock: (block: SemanticBlock, streaming: boolean) => React.ReactNode;
  /** Dispatch an action from a block interaction */
  dispatch: (action: string, payload: any) => void;
}

/**
 * Hook that provides access to the plugin-based rendering system.
 * Components use this to render semantic blocks without knowing
 * which renderer handles which block type.
 */
export function useBlockRenderer(): UseBlockRendererResult {
  return useMemo(() => ({
    getRenderer: (block: SemanticBlock) => PluginRegistry.getRenderer(block.type),

    renderBlock: (block: SemanticBlock, streaming: boolean) => {
      const renderer = PluginRegistry.getRenderer(block.type);
      if (!renderer) {
        return null;
      }
      return renderer.render({
        block,
        streaming,
        onAction: InteractionBridge.dispatch,
      });
    },

    dispatch: InteractionBridge.dispatch,
  }), []);
}
