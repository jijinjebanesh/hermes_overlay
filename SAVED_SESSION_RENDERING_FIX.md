# Saved Session Rendering Audit & Fix Plan

## Executive Summary

**Problem**: Saved sessions render differently (often unformatted) compared to live streaming sessions.

**Root Cause**: The data transformation pipeline differs between live and saved paths, particularly for:
1. Tool execution results (JSON stored → needs summarization)
2. Code blocks (may store language metadata differently)
3. Diffs (structured data may not match Msg.text format)
4. Context compaction markers (missing from stored format)

**Solution**: Unify at the gateway layer (`_history_to_messages`) to produce identical `Msg[]` shape for both paths.

---

## Pipeline Comparison

### Live Streaming Path
```
Agent → TurnController.streamSegments[] → StreamingAssistant → MessageLine
  ↓
Msg shape: {
  kind: 'trail' | 'diff' | 'slash' | 'panel' | 'intro',
  role: 'assistant' | 'user' | 'tool' | 'system',
  text: string (already formatted),
  tools?: string[],
  thinking?: string,
  ...
}
```

### Saved Session Path
```
SQLite DB → get_messages_as_conversation() → _history_to_messages() → MessageLine
  ↓
Stored shape: {
  role: 'assistant' | 'user' | 'tool' | 'system',
  content: string | list | dict (raw, may be JSON),
  tool_calls?: array,
  tool_call_id?: string,
  tool_name?: string,
  reasoning?: string,
  ...
}
```

**Gap**: The saved path's `_history_to_messages()` must transform ALL stored shapes into the exact `Msg` format the live path produces.

---

## Block-Type Audit Table

| Block Type | Live Schema (Msg) | Stored Schema (DB) | Gap Found | Fix Required |
|------------|------------------|-------------------|-----------|--------------|
| **Plain text / markdown** | `{role, text: string}` | `{role, content: string}` | ✅ None | Already works |
| **Code blocks** | `{role, text: "```lang\n...\n```"}` | `{role, content: "```lang\n...\n```"}` | ⚠️ May store as escaped JSON | Add JSON unescape in `_coerce_message_text` |
| **Code diffs** | `{kind: 'diff', text: unified diff}` | `{role: 'assistant', content: {diff: {...}}}` | ❌ Structured diff not converted | Transform diff objects → unified diff text |
| **Tool execution (all types)** | `{kind: 'trail', tools: ['search_files'], text: ''}` + tool result as `{role: 'tool', text: 'Found 0 matches'}` | `{role: 'tool', content: '{"total_count": 0}', tool_name: 'search_files'}` | ❌ Raw JSON not summarized | ✅ Already fixed with `_summarize_tool_result` |
| **Command/shell output** | `{role: 'tool', text: '✓ Success: output...'}` | `{role: 'tool', content: '{"exit_code": 0, "output": "..."}'}` | ❌ JSON not summarized | ✅ Already fixed |
| **Citations / images** | `{role: 'assistant', text: '...\n![img](url)...', imageUrls?: [...]}` | `{role: 'assistant', content: [{type: 'text', ...}, {type: 'image_url', ...}]}` | ⚠️ Multimodal lists need text conversion | Handle in `_coerce_message_text` (partially done) |
| **Context compaction markers** | `{kind: 'intro', info: {...}, text: 'Session resumed...'}` | Not stored (derived from session metadata) | ⚠️ Need to synthesize on load | Add session metadata → intro message |
| **Reasoning/thinking** | `{role: 'assistant', text: '...', thinking: '...'}` | `{role: 'assistant', content: '...', reasoning: '...'}` | ✅ None | Already mapped in `_history_to_messages` |

---

## Critical Findings

### 1. Tool Results (FIXED ✅)

My earlier fix added `_summarize_tool_result()` which transforms:
```json
{"total_count": 0} → "Found 0 matches"
{"exit_code": 0, "output": "done"} → "✓ Success: done"
```

**Status**: Already applied in `tui_gateway/server.py`.

### 2. Escaped JSON Strings (NEEDS FIX)

Stored content may be double-escaped:
```python
# In DB
content = '{\\"exit_code\\": 0}'  # Escaped JSON string
```

Current `_coerce_message_text` handles this, but let me verify it works for all cases.

### 3. Diff Blocks (MAJOR GAP ❌)

Diffs are stored as structured objects but rendered as unified diff text:

**Stored**:
```json
{
  "role": "assistant",
  "content": {
    "diff": {
      "file": "config.py",
      "hunks": [
        {"header": "@@ -1,5 +1,6 @@", "lines": [...]}
      ]
    }
  }
}
```

**Expected Msg**:
```typescript
{
  kind: 'diff',
  text: '--- a/config.py\n+++ b/config.py\n@@ -1,5 +1,6 @@\n...'
}
```

**Fix needed**: Add diff object → unified diff transformer in `_history_to_messages`.

### 4. Context Compaction Markers (GAP ⚠️)

When resuming a compressed session, no "conversation summarized" marker is shown.

**Live path**: Agent emits intro message with session info
**Saved path**: Just shows old messages, no context hint

**Fix**: Synthesize intro message when `include_ancestors=true` indicates compression happened.

---

## Implementation Plan

### Step 1: Enhance `_history_to_messages()` in `tui_gateway/server.py`

Add transformations for:
1. **Diff blocks**: Detect `content.diff` objects → convert to unified diff text + set `kind: 'diff'`
2. **Compaction markers**: Detect `parent_session_id` → prepend intro message
3. **Multimodal content**: Ensure image URLs are extracted and formatted as markdown

### Step 2: Verify `_coerce_message_text()` handles all edge cases

Already handles:
- Plain strings
- Multimodal lists (images, audio)
- Tool result dicts (via `_summarize_tool_result`)
- Escaped JSON strings

### Step 3: Test each block type

For each type:
1. Live stream a message with that block
2. Save session
3. Resume session
4. Compare rendered output visually

---

## Unified Renderer Strategy

**Key Insight**: Both paths already use `MessageLine` component! The gap is purely in data transformation.

```
Live:  Agent → streamSegments (Msg[]) → MessageLine
Saved: DB → _history_to_messages() → Msg[] → MessageLine
                          ↑
                   FIX GOES HERE
```

No changes needed to frontend components (`MessageLine`, `StreamingAssistant`, `appLayout`).

---

## Test Coverage Matrix

After fixes, verify:

| # | Scenario | Block Type | Expected |
|---|----------|-----------|----------|
| 1 | Stream python code block → save → reload | Code | ```python syntax preserved |
| 2 | Stream search_files tool → save → reload | Tool result | "Found N matches" (not JSON) |
| 3 | Stream terminal command → save → reload | Tool result | "✓ Success: ..." (not JSON) |
| 4 | Write file with patch → save → reload | Diff | Unified diff with + / - highlighting |
| 5 | Compression event → save → reload | Compaction | "Session resumed from parent XYZ" marker |
| 6 | Image attachment → save → reload | Multimodal | Image renders (or URL preserved) |
| 7 | Reasoning/thinking → save → reload | Thinking | Collapsed by default, expandable |

---

## Files to Modify

1. **`tui_gateway/server.py`** (PRIMARY FIX)
   - `_history_to_messages()`: Add diff transformation, compaction markers
   - `_coerce_message_text()`: Verify all edge cases handled
   - `session.resume`: Add intro message synthesis

2. **`hermes_state.py`** (if needed)
   - `get_messages_as_conversation()`: Ensure all metadata fields preserved

3. **Test script** (new)
   - `test_saved_session_parity.py`: Automated parity checks

---

## Timeline

- **Phase 1** (Audit): ✅ Complete
- **Phase 2** (Implement fixes): 1-2 hours
- **Phase 3** (Test coverage): 30 min
- **Phase 4** (Regression validation): 30 min

**Total**: ~3 hours to production-ready fix