# File Attachment System - Implementation Progress

## ✅ COMPLETED FIXES

### A1 - IPC read-dropped-file handler ✅
- **File**: `src/main/main.ts`
- **Status**: Complete
- **What was done**: Added `ipcMain.handle('read-dropped-file', ...)` that:
  - Checks file size with `fs.statSync`
  - Enforces 500KB cap
  - Returns `{ name, path, content, tooBig, size, ext, isImage }`
  - Reads text files with `fs.readFileSync`
  - Returns appropriate error structure on failure

### A2 - Preload readDroppedFile exposed ✅
- **File**: `src/preload/preload.ts`
- **Status**: Complete
- **What was done**:
  - Added `readDroppedFile` to `ElectronAPI` interface with full type signature
  - Implemented in contextBridge: `readDroppedFile: (filePath) => ipcRenderer.invoke('read-dropped-file', filePath)`
  - Lint passes ✅

### A3 - Zustand attachment state ✅
- **File**: `src/store/overlayStore.ts`
- **Status**: Complete
- **What was done**:
  - Updated `AttachedFile` type with 8 fields: `id`, `name`, `path`, `content`, `tooBig`, `size`, `ext`, `isImage`
  - Changed `Message.attachments` from `attachedFile?: AttachedFile` to `attachments?: AttachedFile[]`
  - Changed state from `fileAttached: AttachedFile | null` to `pendingAttachments: AttachedFile[]`
  - Added 3 new actions:
    - `addPendingAttachments(files: AttachedFile[])`
    - `removePendingAttachment(fileId: string)`
    - `clearPendingAttachments()`
  - Removed old `setFileAttached` action

### A5 - AttachmentChip component ✅
- **File**: `src/components/AttachmentChip.tsx`
- **Status**: Complete
- **What was done**: Created new component with:
  - Props: `{ file: AttachedFile, onRemove?: () => void, variant: 'pending' | 'sent' }`
  - Different rendering for pending (with ✕ remove button) vs sent (no remove)
  - Shows file name and formatted size
  - Shows "Path only — too large to read" when `tooBig === true`
  - Inline SVG icons for: file, code, text, image, sheet
  - `formatSize` function: bytes → KB → MB

### A4 - App.tsx drag handlers ✅
- **File**: `src/renderer/App.tsx`
- **Status**: Complete
- **What was done**:
  - Added check for `e.dataTransfer.types.includes('Files')` in handleDragEnter
  - Added `e.currentTarget === e.target` check in handleDragLeave
  - Converted handleDrop to async function
  - Calls `window.electronAPI.readDroppedFile(filePath)` for each file
  - Calls `addPendingAttachments(results)` after reading
  - Supports multiple file drops (arrays)

## ⏳ IN PROGRESS

### A6 - InputBar: Attachment Tray + Send Handler
- **File**: `src/components/InputBar.tsx`
- **Status**: TODO
- **What needs to be done**:
  1. Read `pendingAttachments` from Zustand store
  2. Render attachment tray between conversation and textarea
  3. Conditional rendering when `pendingAttachments.length > 0`
  4. Map over files with `<AttachmentChip variant="pending" onRemove={...} />`
  5. Update send handler to:
     - Build `attachmentContext` by wrapping file.content in `<file name="...">...</file>` XML tags
     - Only include files where `content !== null` (skip tooBig)
     - Prepend `attachmentContext` to user text before calling `sendMessage`
     - Stamp `attachments: [...pendingAttachments]` onto ChatMessage
     - Call `clearPendingAttachments()` after send

### A7 - MessageBubble: Chips in Conversation History
- **File**: `src/components/MessageBubble.tsx`
- **Status**: TODO
- **What needs to be done**:
  1. Change check from `message.attachedFile` to `message.attachments?.length > 0`
  2. Render chips above message text (not below)
  3. Use `<AttachmentChip variant="sent" />` (no remove button)
  4. Import `AttachmentChip` component

### A8 - Resume Banner Fix
- **Status**: TODO (lower priority)
- **What needs to be done**: Store banner as separate state variable, not in messages array

### A9 - CSS Classes
- **File**: `src/renderer/styles/globals.css`
- **Status**: TODO
- **Classes to add**:
  - `.attachment-tray`
  - `.attachment-chip`
  - `.attachment-chip--pending`
  - `.attachment-chip--sent`
  - `.attachment-chip__info`
  - `.attachment-chip__name`
  - `.attachment-chip__size`
  - `.attachment-chip__icon`
  - `.attachment-chip__remove`
  - `.message-attachments`

## NEXT STEPS

1. **Update InputBar.tsx** - Add attachment tray and modify send handler
2. **Update MessageBubble.tsx** - Render chips in conversation history
3. **Add CSS** - Style for attachment components
4. **Test full flow** - Drop file → see chip → send → see in history

## BLOCKERS

None. The IPC pipeline is complete and ready for integration.