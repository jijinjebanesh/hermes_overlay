import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';

interface MarkdownContentProps {
  content: string;
}

/**
 * Shared renderer for historical and live assistant text.
 * GFM keeps tables, task lists, strikethrough, links, and fenced code consistent
 * regardless of whether a message arrived through the stream or session history.
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content }) => (
  <div className="markdown-content">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
    components={{
      pre: ({ children }) => <>{children}</>,
      code: ({ className, children, node: _node, ...props }) => {
        const language = /language-([\w+-]+)/.exec(className || '')?.[1];
        const code = String(children).replace(/\n$/, '');

        if (language) {
          return <CodeBlock code={code} language={language} />;
        }

        return <code className={className} {...props}>{children}</code>;
      },
      table: ({ children }) => (
        <div className="markdown-table-scroll">
          <table>{children}</table>
        </div>
      ),
      a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      ),
    }}
    >
      {content}
    </ReactMarkdown>
  </div>
);
