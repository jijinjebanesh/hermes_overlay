import React from 'react';
import { AnimatePresence } from 'framer-motion';
import type { SemanticBlock } from './types';
import { PluginRegistry } from '../engine/PluginRegistry';
import { registerAllPlugins } from '../engine/renderers';

let _registered = false;

function ensurePlugins() {
  if (_registered) return;
  _registered = true;
  registerAllPlugins();
}

// Register synchronously at module load time
ensurePlugins();

export function renderSemanticBlock(block: SemanticBlock, streaming: boolean, onAction?: (action: string, payload: any) => void): React.ReactNode {
  ensurePlugins(); // Safety net in case module init order varies
  const renderer = PluginRegistry.getRenderer(block.type);
  if (!renderer) {
    return <div className="semantic-unknown">Unknown block type: {block.type}</div>;
  }
  return renderer.render({ block, streaming, onAction });
}

export function SemanticMessage({
  blocks,
  streaming,
  onAction
}: {
  blocks: SemanticBlock[];
  streaming: boolean;
  onAction?: (action: string, payload: any) => void;
}): React.ReactNode {
  return (
    <div className="semantic-message">
      <AnimatePresence initial={false}>
        {blocks.map((block) => (
          <div key={block.id} className="semantic-message__block">
            {renderSemanticBlock(block, streaming, onAction)}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
