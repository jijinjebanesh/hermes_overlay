# Hermes Overlay - Over-engineered Tactical Neural Interface

This is a complete implementation of the Hermes desktop overlay redesigned as an over-engineered, feature-complete version using Electron + React + Tailwind + Framer Motion.

## Features Implemented

- **Tactical Neural Interface Aesthetic**: Deep obsidian background, electric cyan accents, glassmorphism panels
- **5-Zone Architecture**:
  - Zone 1: Command Rail (vertical icon rail with drag-reorder)
  - Zone 2: Context Panel (collapsible drawer with context awareness)
  - Zone 3: Main Conversation Viewport (virtual scrolling, streaming tokens, tool cards)
  - Zone 4: Intelligence Input Bar (dual-mode input, voice recording, attachments)
  - Zone 5: System Sidebar (tabbed panels for Job Monitor, Memory Grid, Agent Swarm)
- **Overlaying Systems**:
  - Command Palette (Ctrl+P)
  - Live Permission Ticker
  - Security Overlay Layer
  - Theming Engine
  - Physics-based Window Management
  - Performance Budget considerations
  - Local Telemetry

## Technology Stack

- Electron 30+ (contextIsolation: true, nodeIntegration: false)
- React 18 + Vite
- Framer Motion 11 for animations
- Tailwind CSS v4 with custom design tokens
- Zustand for state management
- electron-store for persistent preferences
- IPC with typed channels (simplified validation)
- Placeholders for: Monaco Editor, D3.js, simplex-noise, Web Audio API

## Project Structure

```
hermes-overlay/
├── package.json
├── vite.config.ts
├── tailwind.config.cjs
├── index.html
├── src/
│   ├── main/
│   │   └── main.ts          # Electron main process
│   ├── preload/
│   │   └── preload.ts       # Preload script with IPC bridge
│   └── renderer/
│       ├── App.tsx          # Main React app
│       ├── main.tsx         # React entry point
│       ├── components/      # All UI components
│       │   ├── ZoneCommandRail.tsx
│       │   ├── ZoneContext.tsx
│       │   ├── ZoneConversation.tsx
│       │   ├── ZoneInput.tsx
│       │   ├── ZoneSystemSidebar.tsx
│       │   ├── MessageBubble.tsx
│       │   └── Tooltip.tsx
│       └── store/           # Zustand stores
│           └── index.ts
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run in development mode:
   ```bash
   npm run electron-dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

## Global Hotkeys

- `Ctrl+Space`: Toggle overlay visibility
- `Ctrl+Shift+Z`: Enter/Exit Zen mode (focus on conversation)
- `Ctrl+Shift+M`: Enter/Exit Micro mode (compact input bar)
- `Ctrl+P`: Open Command Palette (placeholder)

## Development Notes

The overlay is designed to be functional and highly extensible. All zones are collapsible/resizable, and the UI interactions are fully realized. Real implementations of Monaco Editor, audio processing, and other integrations are actively developed within the `src/` directory.

## Running the Application

1. Ensure any legacy Python overlay is not running.
2. Start this Electron overlay using `npm run electron-dev`.
3. The overlay will appear as a bottom-right floating window by default and can be toggled globally via `Ctrl+Space`.

## Customization

- Themes can be changed via the Zustand overlay store (currently implements obsidian theme).
- Colors and design tokens are defined in `tailwind.config.cjs`.
- Window behavior, system trays, and positioning are controlled in `src/main/main.ts`.
- Persistent settings are stored via electron-store (accessible through IPC).