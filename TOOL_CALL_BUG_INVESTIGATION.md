# Investigation: Tool Call JSON Rendering Bug

## Current Understanding

The bug shows raw tool call JSON with literal `\\n` sequences rendered in the overlay when resuming saved sessions.

## What I've Verified Works

1. Tool results (`role: "tool"`) are correctly summarized
2. Sentinel prefix `\x00json:` is properly stripped and parsed  
3. Tool messages output: `{role: "tool", name, context, text}`

## What I Haven't Been Able to Reproduce

I cannot reproduce the exact bug shown in screenshots because:
- I don't have access to the actual corrupted DB entries
- The screenshots aren't available to me
- My test cases all render correctly

## Most Likely Root Causes

### Hypothesis 1: Old DB Schema with Tool Calls in Content Field

Older Hermes versions might have stored tool_calls as a JSON string in the `content` field instead of the `tool_calls` field. When this string is parsed and re-serialized, escapes get doubled.

**Test needed:** Query actual DB for assistant messages where `content` looks like tool call JSON.

### Hypothesis 2: Assistant Message with Tool Calls But No Text Gets Serialized Wrong

When an assistant message has `tool_calls` but empty `content`, line 2716-2717 skips it. But what if something else is concatenating the tool_calls into a string somewhere?

**Check:** Search for any code that does `json.dumps(tool_calls)` or similar.

### Hypothesis 3: Unicode Escape Handling Bug in `_coerce_message_text`

Lines 2571-2579 try to unescape `\\n` sequences, but this logic might be flawed for certain inputs.

## Recommended Next Steps

1. **Capture actual bug JSON**: When the bug occurs, log the exact `messages` array returned by `session.resume`

2. **Query real DB**: Find actual assistant messages with tool_calls and inspect their storage format:
   ```sql
   SELECT id, role, content, tool_calls FROM messages 
   WHERE tool_calls IS NOT NULL 
   LIMIT 10;
   ```

3. **Add debug logging** in `_history_to_messages` to trace exactly what's being processed

4. **Check TUI receipt**: Log what `toTranscriptMessages()` actually receives on the client side

## Immediate Defensive Fix

Add validation in `_coerce_message_text` to detect and properly handle strings that look like tool call definitions (have "function", "arguments" keys) vs tool results (have "exit_code", "total_count", etc.):

```python
# Detect tool call (not tool result) and handle specially
if isinstance(parsed, dict) and 'function' in parsed:
    # This is a tool call definition, not a result
    # Extract info for proper formatting
    fn = parsed.get('function', {})
    name = fn.get('name', 'tool')
    args_str = fn.get('arguments', '{}')
    # Don't return raw JSON - will be handled via tool_calls field
    return f"[Calling {name}...]"  # or skip entirely
```

But actually, tool calls shouldn't be going through `_coerce_message_text` at all - they're in the `tool_calls` field, not `content`. So if they ARE going through this function, that means they're incorrectly stored in `content`, which is a DB corruption issue.

## Conclusion

Without access to the actual failing data or screenshots, I cannot definitively fix this bug. The code I've written handles the standard cases correctly. The bug likely involves:
- Corrupted/old DB schema
- Edge case in escape sequence handling
- Client-side serialization bug

**Request to user:** Please provide the exact JSON payload from `session.resume` when the bug occurs, or a screenshot of the browser devtools showing the network response.