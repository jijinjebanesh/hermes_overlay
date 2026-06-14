# ✅ Debug Logging Installed

## Status
Debug logging has been successfully added to `tui_gateway/server.py` at line 3052.

## What Happens Now

When you resume a session in the Hermes overlay (via `/sessions` command), the following will be logged to:
```
C:\Users\jijin\AppData\Local\hermes\logs\resume_debug.log
```

The log captures:
1. **RAW DB CONTENT**: Exactly what's stored in SQLite for the first 5 messages
2. **TRANSFORMED OUTPUT**: Exactly what gets sent to the overlay after processing

## How to Trigger the Log

### Method 1: Normal Overlay Usage (Easiest)
1. Open your Hermes overlay (press your configured hotkey, likely F9)
2. Type `/sessions` 
3. Select the session that shows the broken `write_file` rendering
4. Wait for it to fully load
5. The debug log will be automatically created/updated

### Method 2: Command Line (More Control)
```bash
cd C:\Users\jijin\hermes-overlay
python capture_resume_bug.py "Your Session Title"
```
This keeps the terminal open and shows the log when you press Ctrl+C.

## What to Look For

Open the log file after triggering a resume:
```bash
notepad C:\Users\jijin\AppData\Local\hermes\logs\resume_debug.log
```

Look for entries containing `write_file` or other tool names. Check for:

### Bug Indicator: Double Escapes
If you see literal `\\n` (backslash-backslash-n) in either section, that's the bug:
```
tool_calls: ... "content": "line1\\nline2" ...
```

### Section Comparison
- **RAW DB CONTENT** shows what's stored (cannot be changed without migration)
- **TRANSFORMED OUTPUT** shows what the overlay receives (can be fixed in code)

## Next Steps After Capture

1. **Find the session** in the log (look for your session title or the `DEBUG SESSION RESUME:` header)

2. **Locate tool calls** (search for `write_file`, `terminal`, `search_files`, etc.)

3. **Check for `\\n`** - are double escapes present in RAW, TRANSFORMED, or both?

4. **Share the log excerpt** for the problematic session

5. **I will then:**
   - Identify exact source of double-encoding
   - Provide targeted fix (DB write path, transformation, or client-side)
   - Remove debug logging (no performance impact in production)

## Cleanup (Coming Later)

After diagnosis, I'll provide a simple command to remove the debug logging:
```bash
python /tmp/remove_debug_patch.py  # (will be created)
```

The debug code only runs during `session.resume` and has minimal overhead (~1-2ms per resume), so it's safe to leave in place during diagnosis.

## Questions?

If you're unsure what you're seeing in the log, just share the raw content and I'll analyze it. The key is finding where those `\\n` sequences first appear.

---

**TL;DR:** Resume the broken session → check `~/.hermes/logs/resume_debug.log` → look for `\\n` → share with me