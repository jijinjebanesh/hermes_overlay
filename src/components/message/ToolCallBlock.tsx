import React, { useState } from 'react';
import { ToolCall } from '../../store/overlayStore';

interface ToolCallBlockProps {
  tool: ToolCall;
}

export const ToolCallBlock: React.FC<ToolCallBlockProps> = ({ tool }) => {
  const [expanded, setExpanded] = useState(false);

  // Parse tool.command if it's a JSON string (from older Hermes versions)
  let displayCommand = tool.command || '';
  try {
    if (displayCommand.startsWith('{') && displayCommand.endsWith('}')) {
      const parsed = JSON.parse(displayCommand);
      // For terminal: extract the actual command
      if (tool.name === 'terminal' && parsed.command) {
        displayCommand = parsed.command;
      }
      // For write_file: show filename or summary
      else if (tool.name === 'write_file') {
        if (parsed.path) {
          displayCommand = `📁 ${parsed.path}`;
        } else if (parsed.content) {
          const lines = parsed.content.split('\n');
          displayCommand = `📝 ${lines[0]?.slice(0, 50) || 'file content'}${lines.length > 1 ? '...' : ''}`;
        }
      }
      // For other tools: show first key or JSON summary
      else {
        const keys = Object.keys(parsed);
        displayCommand = keys.length > 0 ? `${keys[0]}: ${JSON.stringify(parsed[keys[0]]).slice(0, 50)}` : displayCommand;
      }
    }
  } catch (e) {
    // If parsing fails, show original
  }

  const statusClass = tool.status === 'error'
    ? 'status-error'
    : tool.status === 'success'
      ? 'status-success'
      : 'status-pending';

  return (
    <div>
      <button
        className={`tool-pill ${statusClass}`}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="tool-pill-chevron">{expanded ? '▼' : '▶'}</span>
        {tool.name} · {displayCommand}
      </button>

      <div className={`tool-output ${expanded ? 'expanded' : 'collapsed'}`}>
        <div className="tool-output-content selectable">
          {tool.output || 'Running…'}
        </div>
      </div>
    </div>
  );
};
