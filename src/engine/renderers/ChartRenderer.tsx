import React from 'react';
import type { BlockRenderer, RendererContext, ChartBlock } from '../../semantic/types';
import { animateBlock } from './StandardRenderers';

const ChartComponent: React.FC<RendererContext> = ({ block, streaming }) => {
  const chartBlock = block as ChartBlock;
  const isStreaming = streaming && block.state !== 'complete';

  const node = (
    <div className="semantic-chart">
      <div className="semantic-chart__header">
        <span>Data Visualization ({chartBlock.chartType})</span>
      </div>
      <div className="semantic-chart__body">
        <div className="semantic-chart__container">
          {[40, 70, 20, 90, 50, 60, 30].map((val, i) => (
            <div key={i} className="semantic-chart__bar" style={{ height: `${val}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
  return isStreaming ? animateBlock(node, block.id) : node;
};

export const ChartRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'chart',
  render: (ctx) => <ChartComponent {...ctx} />,
};
