/**
 * Config — Overlay configuration persistence.
 * Reads/writes overlay.json in the .hermes directory.
 */

import path from 'path';
import fs from 'fs';
import os from 'os';

export const hermesDir = path.join(os.homedir(), '.hermes');
export const overlayConfigPath = path.join(hermesDir, 'overlay.json');
export const sessionsDir = path.join(hermesDir, 'sessions');

// Ensure directories exist
if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

export function loadOverlayConfig(): Record<string, any> {
  try {
    if (fs.existsSync(overlayConfigPath)) {
      return JSON.parse(fs.readFileSync(overlayConfigPath, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load overlay config', e);
  }
  return {};
}

export function saveOverlayConfig(data: Record<string, any>) {
  try {
    const existing = loadOverlayConfig();
    fs.writeFileSync(
      overlayConfigPath,
      JSON.stringify({ ...existing, ...data }, null, 2)
    );
  } catch (e) {
    console.error('Failed to save overlay config', e);
  }
}
