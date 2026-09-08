import React from 'react';
import type { BlockRenderer, RendererContext, PatchBlock } from '../../semantic/types';
import { animateBlock } from './StandardRenderers';
import { Check, X, FileCode2 } from 'lucide-react';

const PatchComponent: React.FC<RendererContext> = ({ block, streaming, onAction }) => {
  const patchBlock = block as PatchBlock;
  const diffString = cleanDiffText(patchBlock.raw || '');
  const isStreaming = streaming && block.state !== 'complete';
  const lines = diffString.split('\n');

  let additions = 0;
  let deletions = 0;
  lines.forEach((line) => {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  });

  const node = (
    <div className="semantic-patch">
      <div className="semantic-patch__header">
        <div className="semantic-patch__info">
          <FileCode2 size={14} />
          <span className="semantic-patch__title">
            {patchBlock.filename || 'Edited file'}
          </span>
          <div className="diff-block-stats">
            {additions > 0 && <span className="diff-stat-add">+{additions}</span>}
            {deletions > 0 && <span className="diff-stat-del">-{deletions}</span>}
          </div>
        </div>
        <div className="semantic-patch__actions">
          <button
            type="button"
            className="semantic-patch__btn semantic-patch__btn--reject"
            onClick={() => onAction?.('reject_patch', { blockId: block.id })}
          >
            <X size={13} /> Reject
          </button>
          <button
            type="button"
            className="semantic-patch__btn semantic-patch__btn--apply"
            onClick={() => onAction?.('apply_patch', { blockId: block.id, patch: diffString })}
          >
            <Check size={13} /> Apply
          </button>
        </div>
      </div>
      <div className="semantic-patch__body">
        {lines.map((line, idx) => {
          let cls = 'diff-line';
          if (line.startsWith('+') && !line.startsWith('+++')) {
            cls += ' diff-line--add';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            cls += ' diff-line--del';
          } else if (line.startsWith('@@')) {
            cls += ' diff-line--hunk';
          } else {
            cls += ' diff-line--ctx';
          }
          return (
            <div key={idx} className={cls}>
              <span className="diff-line-number">{idx + 1}</span>
              <span className="diff-line-sign">{line.startsWith('+') ? '+' : line.startsWith('-') ? '−' : line.startsWith('@@') ? '·' : ' '}</span>
              <span className="diff-line-text">{line || ' '}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return isStreaming ? animateBlock(node, block.id) : node;
};

function cleanDiffText(value: string): string {
  return value
    .replace(/\*{2}class\*{2}\s*=\s*"[^"]*"\s*>/gi, '')
    .replace(/\*{2}\/?(?:span|div|code|pre)\*{2}\s*>/gi, '')
    .replace(/class\s*=\s*"[^"]*"\s*>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\*{2}/g, '');
}

export const PatchRenderer: BlockRenderer = {
  canRender: (block) => block.type === 'patch',
  render: (ctx) => <PatchComponent {...ctx} />,
};
