/**
 * Hotkey Server — HTTP toggle server for AHK communication.
 * Listens on localhost:34567 for /toggle and /show endpoints.
 */

import http from 'http';
import { toggleVisibility, getMainWindow, getIsVisible } from './window';

let server: http.Server | null = null;

export function startHotkeyServer() {
  server = http.createServer((req, res) => {
    if (req.url === '/toggle' && req.method === 'POST') {
      toggleVisibility();
      res.writeHead(200);
      res.end('OK');
    } else if (req.url === '/show' && req.method === 'POST') {
      if (!getIsVisible() && getMainWindow() && !getMainWindow()!.isDestroyed()) {
        toggleVisibility();
      }
      res.writeHead(200);
      res.end('OK');
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(34567, 'localhost', () => {
    console.log('✓ Toggle server listening on port 34567');
  });
}

export function stopHotkeyServer() {
  if (server) {
    server.close();
    server = null;
  }
}
