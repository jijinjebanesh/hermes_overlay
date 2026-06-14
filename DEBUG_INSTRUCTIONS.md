# Debug Plan: Tool Call Rendering Bug

## Problem Statement
When resuming saved sessions in the Hermes overlay, tool call blocks (e.g., `write_file`) render as **raw JSON with literal `\\n` escape sequences** instead of formatted tool-execution cards.

## Current Status
✅ Debug logging added to `server.py` at line 3052
✅ Capture script created: `capture_resume_bug.py`
⏳ Waiting for actual bug reproduction

## How Debug Logging Works

When `session.resume` is called (by opening a saved session in the overlay), the following is logged to `~/.hermes/logs/resume_debug.log`:

```
================================================================================
SESSION RESUME: <session_id>
================================================================================

=== RAW DB CONTENT (display_history) ===

[0] role=assistant, content_type=str
    content: I'll create the file...
    tool_calls: [{"id":"call_1","function":{"name":"write_file","arguments":"{\"path\":\"test.txt\",\"content\":\"line1\\nline2\"}"}}]

=== TRANSFORMED OUTPUT (messages) ===

[0] {"role":"assistant","text":"I'll create the file..."}
```

This gives us side-by-side comparison of:
1. **What's in the DB** (raw, before transformation)
2. **What gets sent to the overlay** (after `_history_to_messages()` processing)

## Next Steps for User

### Option A: Use the Capture Script (Recommended)

1. **Run the capture script** (keeps terminal open):
   ```bash
   cd C:\Users\jijin\hermes-overlay
   python capture_resume_bug.py "Your Session Title"
   ```
   Or with session ID:
   ```bash
   python capture_resume_bug.py sess_abc123
   ```

2. **While script is running**, open your Hermes overlay and resume the problematic session

3. **The script will show** the last 100 lines of the log when you press Ctrl+C

### Option B: Manual Resume + Log Inspection

1. **Open Hermes overlay** normally

2. **Resume the broken session** (the one showing raw JSON in screenshots)

3. **Inspect the log**:
   ```bash
   notepad C:\Users\jijin\AppData\Local\hermes\logs\resume_debug.log
   ```
   Or in bash:
   ```bash
   tail -100 ~/.hermes/logs/resume_debug.log
   ```

4. **Look for** the session with `write_file` or other tool calls

## What to Look For in the Log

### Scenario 1: Bug is Upstream (DB Storage)
If you see `\\n` (double backslash) in the **RAW DB CONTENT** section:
```
tool_calls: ... "content": "line1\\nline2" ...
```
→ **Bug is in how tool calls are STORED** (during live execution)
→ Fix location: Where `append_message` is called with tool_calls

### Scenario 2: Bug is in Transformation
If RAW DB looks clean but TRANSFORMED OUTPUT has doubles:
```
RAW: "content": "line1\nline2"
TRANSFORMED: "text": "line1\\nline2"
```
→ **Bug is in `_history_to_messages()` or `_coerce_message_text()`**
→ Fix location: server.py lines 2683-2728

### Scenario 3: Bug is Downstream (Client-Side)
If both RAW and TRANSFORMED look clean:
```
TRANSFORMED: "text": "line1\nline2"  (correct)
```
But overlay still shows broken rendering:
→ **Bug is in TUI/overlay JavaScript** (`toTranscriptMessages()` or renderer)
→ Fix location: ui-tui/src/domain/messages.ts or related

## Expected Log Format

The log shows first 5 messages only (to avoid flooding). Each message shows:
- Message index `[0]`, `[1]`, etc.
- Role: `user`, `assistant`, or `tool`
- Content type: `str`, `list`, `dict`
- Content preview (escaped for visibility)
- Tool calls if present (JSON string)

## After Diagnosis

Once you've identified which scenario applies:

1. **Share the relevant log excerpt** (the session with the bug)
2. **Note which scenario** matches your observation
3. **Remove debug logging** (I'll provide the revert patch)
4. **Apply targeted fix** at the confirmed location

## Cleanup (After Diagnosis)

Remove debug logging:
```bash
# I'll provide a patch to revert the logging changes
```

This restores `server.py` to production state with no performance impact.

## Questions?

If the log format is unclear or you need help interpreting it, share the raw log file content and I'll analyze it.