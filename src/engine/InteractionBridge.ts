import { useOverlayStore, generateId } from '../store/overlayStore';

export type ActionHandler = (action: string, payload: any) => void;

/**
 * InteractionBridge — Central dispatch for all user interactions 
 * originating from semantic blocks.
 * 
 * This bridges the gap between the renderer plugins and the store/agent.
 * Every block action (toggle_todo, select_choice, apply_patch, run_command, etc.)
 * flows through here for consistent handling, logging, and agent continuation.
 */
export class InteractionBridge {
  private static listeners: Map<string, Set<(action: string, payload: any) => void>> = new Map();

  /**
   * Submit a semantic interaction through the same transport contract as the
   * regular input bar.  Semantic blocks used to read toolMode from uiState,
   * but toolMode is a top-level store field.  That produced `chat` instead of
   * the configured mode and made choice submissions behave differently from
   * normal messages.
   */
  private static sendResponse(store: ReturnType<typeof useOverlayStore.getState>, text: string) {
    const promptTokens = Math.max(1, Math.ceil(text.trim().length / 4));
    const currentSessionTokens = store.streamState.sessionTokens ?? 0;

    store.addMessage({
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    });

    store.addMessage({
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    });

    store.setStreamState({
      isStreaming: true,
      tokens: 0,
      duration: 0,
      sessionTokens: currentSessionTokens + promptTokens,
      mode: store.toolMode,
    });

    const sendMessage = (window as any).electronAPI?.sendMessage;
    if (sendMessage) {
      sendMessage({
        text,
        sessionId: store.sessionId,
        toolMode: store.toolMode,
        provider: store.activeProvider,
        model: store.activeModel,
      });
    } else {
      // Keep the UI from being left in a permanent streaming state when the
      // renderer is opened outside Electron (for example during Vite dev).
      store.setStreamState({ isStreaming: false });
      store.updateLastMessage((message) => ({ ...message, isStreaming: false }));
    }
  }

  /**
   * Subscribe to actions on a specific block ID.
   */
  static subscribe(blockId: string, handler: (action: string, payload: any) => void): () => void {
    if (!this.listeners.has(blockId)) {
      this.listeners.set(blockId, new Set());
    }
    this.listeners.get(blockId)!.add(handler);
    return () => {
      this.listeners.get(blockId)?.delete(handler);
      if (this.listeners.get(blockId)?.size === 0) {
        this.listeners.delete(blockId);
      }
    };
  }

  /**
   * Main dispatch — called by renderers when user interacts with blocks.
   */
  // Keep the method bound when it is passed directly to React as an action
  // callback (e.g. onAction={InteractionBridge.dispatch}).
  static dispatch = (action: string, payload: any) => {
    const store = useOverlayStore.getState();

    // Notify block-specific listeners
    if (payload?.blockId) {
      this.listeners.get(payload.blockId)?.forEach(fn => fn(action, payload));
    }

    switch (action) {
      case 'toggle_todo': {
        // payload: { blockId, index }
        const currentState = store.uiState[payload.blockId] || {};
        const toggledItems = { ...(currentState.toggledItems || {}) };
        toggledItems[payload.index] = !toggledItems[payload.index];
        store.updateBlockUIState(payload.blockId, { toggledItems });
        break;
      }

      case 'select_choice': {
        // payload: { blockId, value }
        store.updateBlockUIState(payload.blockId, { selected: payload.value });
        break;
      }

      case 'submit_choice': {
        // payload: { blockId, value }
        store.updateBlockUIState(payload.blockId, { submitted: true, selected: payload.value });
        this.sendResponse(store, payload.value);
        break;
      }

      case 'submit_form': {
        // payload: { blockId, formData: Record<string, string> }
        store.updateBlockUIState(payload.blockId, { submitted: true, formData: payload.formData });
        
        const formText = `Submitted Form:\n${Object.entries(payload.formData).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`;

        this.sendResponse(store, formText);
        break;
      }

      case 'apply_patch': {
        // payload: { blockId, patch }
        store.updateBlockUIState(payload.blockId, { applied: true });
        // Send to Electron IPC for filesystem modification
        (window as any).electronAPI?.applyPatch?.(payload.patch);
        break;
      }

      case 'reject_patch': {
        // payload: { blockId }
        store.updateBlockUIState(payload.blockId, { rejected: true });
        break;
      }

      case 'run_command': {
        // payload: { blockId, command }
        store.updateBlockUIState(payload.blockId, { running: true });
        (window as any).electronAPI?.runCommand?.(payload.command);
        break;
      }

      case 'copy_code': {
        // payload: { blockId, code }
        navigator.clipboard?.writeText(payload.code).catch(() => {});
        store.updateBlockUIState(payload.blockId, { copied: true });
        setTimeout(() => {
          store.updateBlockUIState(payload.blockId, { copied: false });
        }, 1500);
        break;
      }

      case 'expand_thinking': {
        // payload: { blockId, expanded }
        store.updateBlockUIState(payload.blockId, { expanded: payload.expanded });
        break;
      }

      case 'select_suggestion': {
        // payload: { blockId, value }
        store.updateBlockUIState(payload.blockId, { selected: payload.value });
        this.sendResponse(store, payload.value);
        break;
      }

      default:
        console.warn(`[InteractionBridge] Unknown action: ${action}`, payload);
    }
  };
}
