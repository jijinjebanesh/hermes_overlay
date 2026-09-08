import React from 'react';
import type { BlockRenderer, RendererContext, TerminalBlock } from '../../semantic/types';
import { animateBlock } from './StandardRenderers';

const TerminalComponent: React.FC<RendererContext> = ({ block, streaming }) => {
  const terminalBlock = block as TerminalBlock;
  const isStreaming = streaming && block.state !== 'complete';
  const command = terminalBlock.command?.trim();
  const output = terminalBlock.ansiOutput || terminalBlock.output || '';

  const node = (
    <div className="semantic-terminal">
      <div className="semantic-terminal__header">
        <span className="semantic-block-kicker">EXEC</span>
        <span className="semantic-terminal__title">Terminal</span>
        {terminalBlock.exitCode !== undefined && (
          <span className={`semantic-terminal__exit semantic-terminal__exit--${terminalBlock.exitCode === 0 ? 'success' : 'error'}`}>
            Exit: {terminalBlock.exitCode}
          </span>
        )}
      </div>
      {command && (
        <div className="semantic-terminal__command"><span>$</span><code>{command}</code></div>
      )}
      <div className="semantic-terminal__output-label">response</div>
      <pre className="semantic-terminal__body">{output || (isStreaming ? 'running…' : 'No output captured.')}</pre>
    </div>
  );

  return isStreaming ? animateBlock(node, block.id) : node;
};

export const TerminalRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'terminal',
  render: (ctx) => <TerminalComponent {...ctx} />,
};
