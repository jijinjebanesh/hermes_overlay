// src/core/intentEngine.ts

/**
 * Very small intent detection engine.
 * Uses a list of regex patterns keyed by BlockType.
 * Returns the first matching BlockType or null.
 */
import { BlockType } from "../types";

type IntentPattern = {
  type: BlockType;
  regex: RegExp;
};

// Basic patterns – extendable via plugin registration later if needed.
const patterns: IntentPattern[] = [
  { type: BlockType.Question, regex: /\?$|\bchoose\b|\bselect\b/i },
  { type: BlockType.Code, regex: /```[a-z]*\n[\s\S]*?\n```/i },
  { type: BlockType.Todo, regex: /(?:\- \[ \]|\* \[ \])\s+/i },
  { type: BlockType.Progress, regex: /\b(step|stage)\s*\d+\s*of\s*\d+/i },
  { type: BlockType.Table, regex: /\|.*\|/ },
  { type: BlockType.Image, regex: /!\[.*\]\(.*\)/ },
  // … add more fuzzy patterns as needed
];

export function detectIntent(text: string): BlockType | null {
  for (const p of patterns) {
    if (p.regex.test(text)) return p.type;
  }
  return null;
}
