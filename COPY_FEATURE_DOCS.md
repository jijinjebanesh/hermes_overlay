# Copy to Clipboard Feature

## Overview
Enhanced clipboard functionality in Hermes TUI, similar to ChatGPT's copy features but optimized for terminal use.

## What Was Added

### 1. Enhanced `/copy` Command

**Previous behavior:**
- `/copy` - Only copied the last assistant message
- `/copy N` - Copied Nth assistant message

**New capabilities:**

```bash
# Copy text selection from composer (existing)
[no args with selection]

# Copy last assistant message (default)
/copy

# Copy specific assistant message by number
/copy 2          # 2nd assistant message
/copy 5          # 5th assistant message

# Copy user messages
/copy --user     # Last user message
/copy 2 --user   # 2nd user message
/copy -u         # Shorthand for --user

# Extract and copy code blocks only
/copy --code     # All code blocks from last assistant message
/copy 2 --code   # Code blocks from 2nd assistant message

# Combined flags
/copy 3 --user   # 3rd user message
```

### 2. Code Block Extraction

When using `--code` flag:
- Automatically extracts all ```code blocks``` from the message
- Strips the markdown backticks and language identifiers
- Joins multiple code blocks with blank lines
- Perfect for copying scripts, config files, or commands

**Example:**
If assistant response was:
```markdown
Here's how to do it:

```python
def hello():
    print("world")
```

You can run it like this:
```bash
python script.py
```
```

Then `/copy --code` copies:
```python
def hello():
    print("world")
```

```bash
python script.py
```

### 3. Hotkey Documentation

Updated `/hotkeys` display to show copy commands:
```
/copy              copy last assistant message
/copy --user       copy last user message
/copy --code       extract and copy code blocks from last message
/copy N            copy Nth message (e.g., /copy 2 for 2nd assistant message)
```

## Implementation Details

### Files Modified

1. **`ui-tui/src/app/slash/commands/core.ts`**
   - Enhanced `/copy` command with argument parsing
   - Added `--user` / `-u` flag for user messages
   - Added `--code` flag for code extraction
   - Regex-based code block extraction: `/```[\s\S]*?```/g`

2. **`ui-tui/src/content/hotkeys.ts`**
   - Added documentation for copy commands in hotkey list

### Clipboard Backends

The feature uses the existing clipboard infrastructure (`lib/clipboard.ts`):
- **Windows**: PowerShell `Set-Clipboard`
- **macOS**: `pbcopy`
- **Linux**: `wl-copy` (Wayland), `xclip` (X11)
- **Fallback**: OSC52 escape sequences for remote terminals

## Usage Examples

### Example 1: Copy Your Last Question
```bash
You: How do I implement a binary search tree?
Hermes: [long explanation with code]

/copy --user
# → Copies your question to clipboard
```

### Example 2: Copy Code from Specific Message
```bash
Hermes: [1st response with some code]
You: [follow-up question]
Hermes: [2nd response with more code]

/copy 1 --code
# → Copies code blocks from 1st response only
```

### Example 3: Copy All Code from Latest Response
```bash
Hermes: Here's the complete implementation:

```typescript
function main() {
  // ... 200 lines of code
}
```

/copy --code
# → Copies the entire code block
```

## Why Not Visual Copy Buttons?

Unlike ChatGPT's hover buttons, Hermes TUI uses a terminal interface where:
- No mouse hover states in most terminals
- No clickable buttons in pure TUI
- Keyboard-first workflow is more efficient for terminal users

The slash command approach is:
✓ Works in all terminals (local, SSH, tmux, screen)
✓ Consistent with other Hermes commands
✓ Precise control over which message to copy
✓ Can extract specific content types (code)

## Future Enhancements (Optional)

Potential additions if needed:
1. `/copy-last-diff` - Copy only the diff/patch portions
2. `/copy-tool-output` - Copy tool execution results
3. Ctrl+Shift+C hotkey → trigger `/copy` automatically
4. `/copy-reasoning` - Copy thinking/reasoning content separately

## Testing

To test the new features:

```bash
# Start Hermes
hermes

# Have a conversation with code blocks
Ask: "write a python function to reverse a string"

# Test copy commands
/copy                    # Copy full response
/copy --code            # Copy just the code
/copy --user            # Copy your question

# Verify with your OS clipboard
# (paste into editor or terminal)
```

---

**Status**: ✅ Complete
**Compatibility**: All platforms (Windows, macOS, Linux, WSL)
**Terminal Support**: Native terminal, SSH, tmux, screen (with OSC52 fallback)