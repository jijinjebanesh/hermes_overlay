/**
 * Hermes CLI — Spawning hermes.exe, parsing streaming output,
 * and managing the active child process.
 *
 * Uses tool-parser.ts for structured tool lifecycle parsing
 * (tool_start / tool_complete / thinking / reasoning / diff).
 */

import { spawn, ChildProcess } from 'child_process';
import { BrowserWindow } from 'electron';
import { loadOverlayConfig, saveOverlayConfig } from './config';
import path from 'path';
import fs from 'fs';
import os from 'os';

import {
  parseHermesOutput,
  ParseState,
  formatToolStartEvt,
  formatToolCompleteEvt,
  render_inline_diff,
  DiffLine,
  ToolStartEvent,
  ToolCompleteEvent,
} from '../tool-parser';

let activeChild: ChildProcess | null = null;
let wasAborted = false;
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
  } catch {
    // Ignore — fresh start is fine
  }
}

function saveSessionMap() {
  try {
    const obj: Record<string, string> = {};
    for (const [key, value] of sessionMap.entries()) {
      obj[key] = value;
    }
    const entries = Object.entries(obj);
    if (entries.length > 100) {
      entries.slice(0, 100).forEach(([k, v]) => { obj[k] = v; });
      entries.slice(100).forEach(([k]) => { delete obj[k]; });
    }
    fs.writeFileSync(sessionMapPath, JSON.stringify(obj, null, 2), 'utf-8');
  } catch {
    // Persistence is best-effort
  }
}

loadSessionMap();

export function getActiveChild(): ChildProcess | null {
  return activeChild;
}

export function killActiveChild() {
  wasAborted = true;
  if (activeChild && !activeChild.killed) {
    activeChild.kill('SIGTERM');
    activeChild = null;
  }
}

export function registerSessionMapping(overlaySessionId: string, hermesSessionId: string) {
  sessionMap.set(overlaySessionId, hermesSessionId);
  saveSessionMap();
}

export function sendInputToChild(input: string) {
  if (activeChild && !activeChild.killed && activeChild.stdin) {
    activeChild.stdin.write(input);
  }
}

// ── Re-typed IPC segment events (structured, TUI-style) ──

export interface StreamToolStart {
  type: 'tool_start';
  toolId: string;
  name: string;
  args: Record<string, any>;
  display: string;
}

export interface StreamToolComplete {
  type: 'tool_complete';
  toolId: string;
  name: string;
  args: Record<string, any>;
  result: any;
  durationS?: number;
  duration_s?: number;
  inlineDiff?: string;
  inline_diff?: string;
  diffLines?: DiffLine[];
  error?: string;
  display: string;
}

export interface StreamClarify {
  type: 'clarify';
  question: string;
  choices?: string[];
  multiSelect?: boolean;
  answer?: string;
}

export interface StreamFileNotice {
  type: 'file_notice';
  filename: string;
}

export interface StreamThinking {
  type: 'thinking';
  content: string;
}

export interface StreamReasoning {
  type: 'reasoning';
  content: string;
}

export interface StreamDiff {
  type: 'diff';
  content: string;
  diffLines?: DiffLine[];
}

export interface StreamText {
  type: 'text';
  content: string;
}

export type StreamSegmentEvent =
  | StreamToolStart
  | StreamToolComplete
  | StreamClarify
  | StreamFileNotice
  | StreamThinking
  | StreamReasoning
  | StreamDiff
  | StreamText;

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
  const emitSegment = (seg: StreamSegmentEvent) => {
    mainWindow?.webContents.send('stream-segment', seg);
  };

  const args: string[] = [];
  const hermesSessionId = sessionMap.get(data.sessionId);

  if (hermesSessionId) {
    args.push('--resume', hermesSessionId);
  }

  args.push('chat');

  const config = loadOverlayConfig();
  const provider = data.provider || config.activeProvider;
  const model = data.model || config.activeModel;
  if (provider) args.push('--provider', provider);
  if (model) args.push('--model', model);

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
      queryText = `[User attached a file: ${data.file}]\n\n` + queryText;
    } else {
      queryText = `[User attached a file at: ${data.file}]\n\n` + queryText;
    }
  }

  args.push('-q', queryText);
  args.push('--accept-hooks');

  // Parser states
  const toolParseState: ParseState = {
    toolStartStack: [],
    diffBuffer: '',
    inDiff: false,
  };

  let inResponseBox = false;
  let inReasoningBox = false;
  let inThinkingBox = false;

  let fullOutput = '';
  let parsedIndex = 0;

  try {
    if (activeChild && !activeChild.killed) {
      killActiveChild();
    }
    wasAborted = false;

    const isWindows = process.platform === 'win32';
    activeChild = spawn(isWindows ? 'hermes.exe' : 'hermes', args, {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        TERM: 'dumb',
        HERMES_OVERLAY: '1',
      },
    });

    const emitToolStart = (evt: ToolStartEvent) => {
      // If a previous tool was still in flight, it completed before this one started
      while (toolParseState.toolStartStack.length > 0) {
        const prev = toolParseState.toolStartStack.pop();
        if (prev) {
          emitToolComplete({
            type: 'tool_complete',
            toolId: prev.toolId,
            name: prev.name,
            args: prev.args,
            result: '',
            error: undefined,
          });
        }
      }
      toolParseState.toolStartStack.push(evt);
      emitSegment({
        type: 'tool_start',
        toolId: evt.toolId,
        name: evt.name,
        args: evt.args,
        display: formatToolStartEvt(evt),
      });
    };

    const emitToolComplete = (evt: ToolCompleteEvent) => {
      const diffText = evt.inline_diff || evt.inlineDiff;
      const diffLines = evt.diffLines || (diffText ? render_inline_diff(diffText) : undefined);
      const dur = evt.duration_s ?? evt.durationS;
      emitSegment({
        type: 'tool_complete',
        toolId: evt.toolId,
        name: evt.name,
        args: evt.args,
        result: evt.result,
        durationS: dur,
        duration_s: dur,
        inlineDiff: diffText,
        inline_diff: diffText,
        diffLines,
        error: evt.error,
        display: formatToolCompleteEvt(evt),
      });
    };

    const flushCompletedTools = () => {
      while (toolParseState.toolStartStack.length > 0) {
        const last = toolParseState.toolStartStack.pop();
        if (last) {
          emitToolComplete({
            type: 'tool_complete',
            toolId: last.toolId,
            name: last.name,
            args: last.args,
            result: '',
            error: undefined,
          });
        }
      }
    };

    const handleChunk = (chunk: Buffer) => {
      const text = chunk.toString();
      // Strip ANSI escape codes
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

      while (lineEnd !== -1) {
        const line = unparsed.substring(0, lineEnd);
        const trimmed = line.trim();
        parsedIndex += lineEnd + 1;

        // 1. Inside assistant response box
        if (inResponseBox) {
          const isBoxEnd =
            trimmed.startsWith('╰') ||
            trimmed.startsWith('└') ||
            (trimmed.length > 5 && /^─+$/.test(trimmed.replace(/\s+/g, '')));

          if (isBoxEnd) {
            inResponseBox = false;
          } else {
            emitSegment({ type: 'text', content: line });
          }
        }
        // 2. Inside reasoning box
        else if (inReasoningBox) {
          const isBoxEnd =
            trimmed.startsWith('╰') ||
            trimmed.startsWith('└') ||
            (trimmed.length > 5 && /^─+$/.test(trimmed.replace(/\s+/g, '')));

          if (isBoxEnd) {
            inReasoningBox = false;
          } else {
            emitSegment({ type: 'reasoning', content: line });
          }
        }
        // 3. Inside thinking box
        else if (inThinkingBox) {
          const isBoxEnd =
            trimmed.startsWith('╰') ||
            trimmed.startsWith('└') ||
            (trimmed.length > 5 && /^─+$/.test(trimmed.replace(/\s+/g, '')));

          if (isBoxEnd) {
            inThinkingBox = false;
          } else {
            emitSegment({ type: 'thinking', content: line });
          }
        }
        // 4. Box start detection (supports rounded ╭─, flat ─ ☤ Hermes ─, and standard borders)
        else if (
          trimmed.includes('☤ Hermes') ||
          (trimmed.includes('Hermes') && (trimmed.startsWith('╭') || trimmed.startsWith('┌') || trimmed.startsWith('─')))
        ) {
          flushCompletedTools();
          if (trimmed.toLowerCase().includes('thinking')) {
            inThinkingBox = true;
          } else if (trimmed.toLowerCase().includes('reasoning')) {
            inReasoningBox = true;
          } else {
            inResponseBox = true;
          }
        } else if (trimmed.startsWith('┌─') && trimmed.toLowerCase().includes('reasoning')) {
          flushCompletedTools();
          inReasoningBox = true;
        } else {
          // 5. Parse tool events, diffs, clarify, notices
          const toolEvents = parseHermesOutput(line + '\n', toolParseState);
          for (const evt of toolEvents) {
            if (evt.type === 'tool_start') {
              emitToolStart(evt);
            } else if (evt.type === 'tool_complete') {
              emitToolComplete(evt);
            } else if (evt.type === 'diff') {
              emitSegment({
                type: 'diff',
                content: evt.content,
                diffLines: evt.diffLines,
              });
            } else if (evt.type === 'clarify') {
              toolParseState.toolStartStack = toolParseState.toolStartStack.filter(
                (s) => s.name !== 'clarify'
              );
              emitSegment({
                type: 'clarify',
                question: evt.question,
                choices: evt.choices,
                multiSelect: evt.multiSelect,
                answer: evt.answer,
              });
            } else if (evt.type === 'file_notice') {
              emitSegment({
                type: 'file_notice',
                filename: evt.filename,
              });
            }
          }

          // 6. Outside of boxes: do NOT emit metadata/session/CLI summary as chat text.
          // Hermes output outside boxes is CLI chrome (e.g. "Resume this session with:", "Title: ...", etc.)
        }

        unparsed = fullOutput.substring(parsedIndex);
        lineEnd = unparsed.indexOf('\n');
      }
    };

    activeChild.stdout?.on('data', handleChunk);
    activeChild.stderr?.on('data', handleChunk);

    activeChild.on('close', (code) => {
      // Flush any remaining diff
      if (toolParseState.inDiff && toolParseState.diffBuffer.trim()) {
        const diffText = toolParseState.diffBuffer.trim();
        emitSegment({
          type: 'diff',
          content: diffText,
          diffLines: render_inline_diff(diffText),
        });
      }

      // Close any open tool cleanly if normal completion, or interrupted if aborted/failed
      const isError = wasAborted || (code !== 0 && code !== null);
      while (toolParseState.toolStartStack.length > 0) {
        const last = toolParseState.toolStartStack.pop();
        if (last) {
          emitToolComplete({
            type: 'tool_complete',
            toolId: last.toolId,
            name: last.name,
            args: last.args,
            result: '',
            error: isError ? (wasAborted ? 'interrupted' : 'error') : undefined,
          });
        }
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
