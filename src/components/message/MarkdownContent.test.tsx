import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownContent } from './MarkdownContent';

describe('MarkdownContent', () => {
  it('renders GitHub-flavored tables instead of showing table syntax as plain text', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent content={'| Feature | Status |\n| --- | --- |\n| History | Fixed |'} />
    );

    expect(html).toContain('<table>');
    expect(html).toContain('<th>Feature</th>');
    expect(html).toContain('<td>Fixed</td>');
  });

  it('uses the application CodeBlock for fenced code', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent content={'```ts\nconst ready = true;\n```'} />
    );

    expect(html).toContain('code-block');
    expect(html).toContain('ready = true;');
  });
});
