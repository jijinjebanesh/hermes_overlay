# Hermes Overlay

**Apple-inspired tactical AI terminal for your desktop.**

Hermes Overlay is a sleek, highly customizable desktop assistant overlay built with Electron and React. Designed to be unobtrusive yet powerful, it provides a persistent, easily accessible interface for interacting with local or cloud AI models, seamlessly blending into your workflow with its transparent, glassmorphic aesthetics.

## 🚀 Key Features

- **Global Hotkey Access**: Instantly summon or hide the overlay from anywhere using customizable hotkeys (default: `Ctrl+Space`).
- **Echo Mode (Voice Interface)**: A full-screen, immersive voice conversation surface. Features real-time Speech-to-Text (STT), Text-to-Speech (TTS), and a fluid, audio-reactive visualizer orb (Triggered via `Ctrl+Shift+E`).
- **Drag-and-Drop Attachments**: Drop files (images, documents, code, etc.) directly onto the overlay to add them as context to your AI prompts.
- **Dynamic Theming**: Support for automatic system Dark/Light mode switching, custom font families, and customizable accent colors.
- **Floating & Resizable**: Smart window management that remembers your preferred position and size.
- **Deep System Integration**: Built-in AutoHotkey (AHK) integration for robust global shortcut overrides on Windows.

## 🛠 Technology Stack

- **Framework**: [Electron 30](https://www.electronjs.org/) for the desktop environment.
- **Frontend**: [React 18](https://react.dev/) powered by [Vite](https://vitejs.dev/) for lightning-fast HMR and building.
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) for utility-first, responsive design tokens.
- **Animations**: [Framer Motion](https://www.framer.com/motion/) for fluid UI transitions and the Echo Mode orb physics.
- **State Management**: [Zustand](https://github.com/pmndrs/zustand) for lightweight, predictable global state.
- **Persistence**: `electron-store` for saving user preferences across sessions.

## 📂 Project Structure

```text
hermes-overlay/
├── src/
│   ├── main/          # Electron Main Process (Window management, IPC routing, AHK bridging)
│   ├── preload/       # Context Bridge for secure IPC communication
│   ├── renderer/      # React Application Entry (App.tsx, main.tsx)
│   ├── components/    # UI Components (InputBar, EchoMode, Conversation, SettingsModal, etc.)
│   ├── store/         # Zustand State Management (overlayStore.ts)
│   └── audio/         # Audio processing engine for Echo Mode visualization
├── scripts/           # Python/Node scripts for backend bridging (optional)
├── hotkey.ahk         # AutoHotkey daemon script for advanced shortcut listening
├── package.json       # Project dependencies and scripts
└── vite.config.ts     # Vite configuration for Electron renderer build
```

## 💻 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [AutoHotkey v2](https://www.autohotkey.com/) (Optional, but recommended for robust global shortcut capturing on Windows)

### Installation

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Start the development server (Vite + Electron):
   ```bash
   npm run dev
   ```

3. Build the application for production:
   ```bash
   npm run build
   ```

## ⌨️ Default Shortcuts

- `Ctrl + Space`: Toggle Hermes Overlay visibility.
- `Ctrl + Shift + E`: Enter **Echo Mode** for voice interactions.
- `Escape`: Close settings or exit current mode.

*(Note: Global shortcuts can be reconfigured within the application settings, which will automatically update the underlying AHK daemon).*

## 🎨 Customization

Hermes Overlay is built to be customized:
- **UI Tweaks**: Update `tailwind.config.cjs` or `src/renderer/styles/index.css` to modify core design tokens.
- **Behavior**: Adjust window bounds, frameless behavior, and IPC handling inside `src/main/main.ts`.

---
*Hermes Overlay — Designed for power users who demand intelligence at their fingertips.*