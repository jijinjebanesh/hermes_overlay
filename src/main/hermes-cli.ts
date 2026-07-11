/**
 * Hermes CLI — Spawning hermes.exe, parsing streaming output,
 * and managing the active child process.
 */

import { spawn, ChildProcess } from 'child_process';
import { BrowserWindow } from 'electron';
import { loadOverlayConfig, saveOverlayConfig } from './config';
import path from 'path';
import fs from 'fs';
import os from 'os';

let activeChild: ChildProcess | null = null;
const sessionMap = new Map<string, string>();

const sessionMapPath = path.join(os.homedir(), '.hermes', 'overlay_session_map.json');

function loadSessionMap() {
  try {
    if (fs.existsSync(sessionMapPath)) {
      const data = JSON.parse(fs.readFileSync(sessionMapPath, 'utf-8'));
      for (const [key, value] of Object.entries(data)) {
        sessionMap.set(key, value as string);
      }
    }
  } catch (e) {
    // Ignore — fresh start is fine
  }
}

function saveSessionMap() {
  try {
    const obj: Record<string, string> = {};
    for (const [key, value] of sessionMap.entries()) {
      obj[key] = value;
    }
    // Keep at most 100 entries to avoid unbounded growth
    const entries = Object.entries(obj);
    if (entries.length > 100) {
      entries.slice(0, 100).forEach(([k, v]) => { obj[k] = v; });
      // Remove excess keys from obj
      entries.slice(100).forEach(([k]) => { delete obj[k]; });
    }
    fs.writeFileSync(sessionMapPath, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    // Ignore — persistence is best-effort
  }
}

// Load persisted session map on module init
loadSessionMap();

export function getActiveChild(): ChildProcess | null {
  return activeChild;
}

export function killActiveChild() {
  if (activeChild && !activeChild.killed) {
    activeChild.kill('SIGTERM');
    activeChild = null;
  }
}

export function sendInputToChild(input: string) {
  if (activeChild && !activeChild.killed && activeChild.stdin) {
    activeChild.stdin.write(input);
  }
}

/**
 * Send a message via hermes CLI with streaming output parsing.
 * Parses structured segments (tool activity, diffs, thinking, text)
 * and sends them to the renderer in real time.
 */
export function sendMessage(
  mainWindow: BrowserWindow,
  data: {
    text: string;
    file?: string;
    sessionId: string;
    toolMode: string;
    provider?: string;
    model?: string;
  }
) {
  const args: string[] = [];
  const hermesSessionId = sessionMap.get(data.sessionId);

  if (hermesSessionId) {
    args.push('--resume', hermesSessionId);
  }

  args.push('chat');

  // Get model/provider from saved config or from data
  const config = loadOverlayConfig();
  const provider = data.provider || config.activeProvider;
  const model = data.model || config.activeModel;
  if (provider) args.push('--provider', provider);
  if (model) args.push('--model', model);

  // Tool mode
  if (data.toolMode === 'none') args.push('-t', '');
  else if (data.toolMode === 'terminal') args.push('-t', 'terminal');

  let queryText = data.text;
    if (data.file) {
      const ext = data.file.split('.').pop()?.toLowerCase() || '';
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
      const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'rtf'];

      if (imageExts.includes(ext)) {
        args.push('--image', data.file);
      } else if (docExts.includes(ext)) {
        // Pass document path inline so hermes can read it
        queryText = `[User attached a file: ${data.file}]\n\n` + queryText;
      } else {
        queryText = `[User attached a file at: ${data.file}]\n\n` + queryText;
      }
    }

  args.push('-q', queryText);
  args.push('--accept-hooks');

  let fullOutput = '';
  let parsedIndex = 0;
  let inBox = false;
  let inDiff = false;

  let diffBuffer = '';
  let isThinkingBox = false;
  let toolBuffer = '';
  let toolBufferToolName = '';

  try {
    const isWindows = process.platform === 'win32';
    activeChild = spawn(isWindows ? 'hermes.exe' : 'hermes', args, {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        TERM: 'dumb',
      },
    });

    const handleChunk = (chunk: Buffer) => {
      const text = chunk.toString();
      const cleanText = text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
      fullOutput += cleanText;

      // Capture session ID
      if (!sessionMap.has(data.sessionId)) {
        const match = fullOutput.match(/Session:\s+([a-zA-Z0-9_]+)/);
        if (match) {
          sessionMap.set(data.sessionId, match[1]);
          saveSessionMap();
        }
      }

      let unparsed = fullOutput.substring(parsedIndex);
      let lineEnd = unparsed.indexOf('\n');

      while (lineEnd !== -1 || inBox) {
        if (inBox) {
          const endBoxIndex = unparsed.indexOf('╰─');
          if (endBoxIndex !== -1) {
            const content = unparsed.substring(0, endBoxIndex);
            if (content) {
              mainWindow?.webContents.send('stream-segment', {
                type: isThinkingBox ? 'thinking' : 'text',
                content: content.replace(/^    /gm, ''),
              });
            }
            inBox = false;
            const lineEndAfterBox = unparsed.indexOf('\n', endBoxIndex);
            parsedIndex += (lineEndAfterBox !== -1 ? lineEndAfterBox + 1 : unparsed.length);
            unparsed = fullOutput.substring(parsedIndex);
            lineEnd = unparsed.indexOf('\n');
          } else {
            if (unparsed) {
              mainWindow?.webContents.send('stream-segment', {
                type: isThinkingBox ? 'thinking' : 'text',
                content: unparsed.replace(/^    /gm, ''),
              });
              parsedIndex += unparsed.length;
              unparsed = '';
            }
            break;
          }
        } else {
          if (lineEnd === -1) break;
          const line = unparsed.substring(0, lineEnd);
          const trimmed = line.trim();
          parsedIndex += lineEnd + 1;

          // Skip metadata lines
          if (
            trimmed.startsWith('Query:') ||
            trimmed.startsWith('Initializing agent') ||
            trimmed.match(/^─+$/) ||
            trimmed.startsWith('Resume this session with:') ||
            trimmed.startsWith('hermes --resume') ||
            trimmed.startsWith('Session:') ||
            trimmed.startsWith('Duration:') ||
            trimmed.startsWith('Messages:') ||
            trimmed.startsWith('Exit code:') ||
            trimmed.startsWith('↻') ||
            trimmed.match(/Resumed session/)
          ) {
            unparsed = fullOutput.substring(parsedIndex);
            lineEnd = unparsed.indexOf('\n');
            continue;
          }

          if (inDiff) {
            if (trimmed.startsWith('╭─') || (trimmed === '' && diffBuffer.length > 0)) {
              mainWindow?.webContents.send('stream-segment', { type: 'diff', content: diffBuffer.trim() });
              inDiff = false;
              diffBuffer = '';
            } else {
              diffBuffer += line + '\n';
              unparsed = fullOutput.substring(parsedIndex);
              lineEnd = unparsed.indexOf('\n');
              continue;
            }
          }

          if (trimmed.startsWith('╭─')) {
            inBox = true;
            const title = trimmed.toLowerCase();
            isThinkingBox = title.includes('thinking') || title.includes('reasoning');
          } else if (trimmed.match(/^─+\s+⚕ Hermes/)) {
            inBox = true;
            isThinkingBox = false;
          } else if (trimmed.startsWith('┊') || trimmed.match(/^[│┊]\s/)) {
            const toolMatch = trimmed.match(/[│┊]\s*(?:💻|✍️|🔍|📁|🌐|⚡|🔧|📝|🛠️|⚙️|🔒)\s*(?:preparing\s+)?(.+?)…?$/);
            if (toolMatch) {
              // Start of a new tool activity — flush previous buffer if any
              if (toolBuffer) {
                const contentText = toolBuffer.replace(/[│┊]\s*/gm, '').replace(/\s+·\s+\{[\s\S]*$/g, '').trim();
                mainWindow?.webContents.send('stream-segment', {
                  type: 'tool_activity',
                  content: contentText,
                  toolName: toolBufferToolName || undefined,
                });
              }
              let contentText = trimmed.replace(/^[│┊]\s*/, '');
              contentText = contentText.replace(/\s+·\s+\{[\s\S]*$/, '').trim();
              toolBuffer = trimmed;
              toolBufferToolName = toolMatch[1].trim().replace(/…$/, '');
            } else if (trimmed.includes('review diff')) {
              // Flush tool buffer before switching to diff
              if (toolBuffer) {
                const contentText = toolBuffer.replace(/[│┊]\s*/gm, '').replace(/\s+·\s+\{[\s\S]*$/g, '').trim();
                mainWindow?.webContents.send('stream-segment', {
                  type: 'tool_activity',
                  content: contentText,
                  toolName: toolBufferToolName || undefined,
                });
                toolBuffer = '';
                toolBufferToolName = '';
              }
              inDiff = true;
              diffBuffer = '';
            } else {
              // Continuation of tool output — add to buffer
              if (toolBuffer) {
                toolBuffer += '\n' + trimmed;
              } else {
                let contentText = trimmed.replace(/^[│┊]\s*/, '');
                contentText = contentText.replace(/\s+·\s+\{[\s\S]*$/, '').trim();
                toolBuffer = trimmed;
                toolBufferToolName = '';
              }
            }
          } else if (trimmed) {
            // Non-tool, non-box line — flush tool buffer
            if (toolBuffer) {
              const contentText = toolBuffer.replace(/[│┊]\s*/gm, '').replace(/\s+·\s+\{[\s\S]*$/g, '').trim();
              mainWindow?.webContents.send('stream-segment', {
                type: 'tool_activity',
                content: contentText,
                toolName: toolBufferToolName || undefined,
              });
              toolBuffer = '';
              toolBufferToolName = '';
            }
            mainWindow?.webContents.send('stream-segment', {
              type: 'text',
              content: line.replace(/^    /gm, ''),
            });
          } else {
            // Empty line — flush tool buffer
            if (toolBuffer) {
              const contentText = toolBuffer.replace(/[│┊]\s*/gm, '').replace(/\s+·\s+\{[\s\S]*$/g, '').trim();
              mainWindow?.webContents.send('stream-segment', {
                type: 'tool_activity',
                content: contentText,
                toolName: toolBufferToolName || undefined,
              });
              toolBuffer = '';
              toolBufferToolName = '';
            }
          }

          unparsed = fullOutput.substring(parsedIndex);
          lineEnd = unparsed.indexOf('\n');
        }
      }
    };

    activeChild.stdout?.on('data', handleChunk);
    activeChild.stderr?.on('data', handleChunk);

    activeChild.on('close', (code) => {
      if (inDiff && diffBuffer.trim()) {
        mainWindow?.webContents.send('stream-segment', { type: 'diff', content: diffBuffer.trim() });
      }
      // Flush any remaining tool buffer
      if (toolBuffer) {
        const contentText = toolBuffer.replace(/[│┊]\s*/gm, '').replace(/\s+·\s+\{[\s\S]*$/g, '').trim();
        mainWindow?.webContents.send('stream-segment', {
          type: 'tool_activity',
          content: contentText,
          toolName: toolBufferToolName || undefined,
        });
      }
      mainWindow?.webContents.send('stream-end', { code });
      activeChild = null;
    });

    activeChild.on('error', (err) => {
      mainWindow?.webContents.send('stream-error', err.message);
      activeChild = null;
    });
  } catch (err: any) {
    mainWindow?.webContents.send('stream-error', err.message || 'Failed to spawn hermes');
  }
}
