// src/core/classifier.ts

import { BlockType } from "../types";
import { detectIntent } from "./intentEngine";

/**
 * Classifies a raw text snippet into a BlockType using the IntentEngine.
 * If no intent matches, returns BlockType.Unknown.
 */
export function classify(text: string): BlockType {
  const intent = detectIntent(text);
  return intent ?? BlockType.Unknown;
}
