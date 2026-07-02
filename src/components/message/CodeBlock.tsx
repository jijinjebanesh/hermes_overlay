import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Terminal } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);
  
  // Default collapse terminal output
  const isTerminal = language === 'bash' || language === 'shell' || language === 'sh' || language === 'terminal';
  const [expanded, setExpanded] = useState(!isTerminal);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // Minimal 3-colour syntax highlighter
  const highlight = (text: string) => {
    return text.split('\n').map((line, i) => {
      let html = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/(\/\/.*$)/gm, '<span class="token comment">$1</span>')
        .replace(/(#.*$)/gm, '<span class="token comment">$1</span>')
        .replace(/(['"`])(.*?)\1/g, '<span class="token string">$1$2$1</span>')
        .replace(
          /\b(import|from|export|const|let|var|function|return|if|else|for|while|class|switch|case|break|default|new|this|typeof|instanceof|async|await|try|catch|throw|finally|yield|void|delete|in|of|def|print|True|False|None)\b/g,
          '<span class="token keyword">$1</span>'
        );

      return <div key={i} dangerouslySetInnerHTML={{ __html: html || ' ' }} />;
    });
  };

  if (isTerminal) {
    return (
      <div className="diff-block">
        <button
          className="diff-block-header"
          onClick={() => setExpanded(!expanded)}
          style={{ justifyContent: 'flex-start' }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Terminal size={12} />
          <span className="diff-block-title" style={{ marginLeft: 6 }}>
            {expanded ? '🔧 Terminal output' : '🔧 Ran terminal command — click to expand'}
          </span>
        </button>
        {expanded && (
          <div className="code-block" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none', margin: 0 }}>
            <div className="code-block-header">
              {language && <span className="code-block-lang">{language}</span>}
              <button
                className={`code-copy-btn${copied ? ' copied' : ''}`}
                onClick={handleCopy}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="code-block-content selectable">
              {highlight(code)}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        {language && <span className="code-block-lang">{language}</span>}
        <button
          className={`code-copy-btn${copied ? ' copied' : ''}`}
          onClick={handleCopy}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="code-block-content selectable">
        {highlight(code)}
      </div>
    </div>
  );
};
