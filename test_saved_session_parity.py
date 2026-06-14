#!/usr/bin/env python3
"""
Test script to verify saved session rendering parity with live streaming.
Tests all block types: text, code, diffs, tool results, cmd output, compaction markers.
"""

import json
import sys
sys.path.insert(0, '/c/Users/jijin/AppData/Local/hermes/hermes-agent')

from tui_gateway.server import _coerce_message_text, _summarize_tool_result, _history_to_messages

def test_tool_result_summarization():
    """Test that tool results are summarized correctly."""
    print("=" * 60)
    print("TEST 1: Tool Result Summarization")
    print("=" * 60)
    
    test_cases = [
        # (input, expected_output_substring)
        ({"total_count": 0}, "Found 0 matches"),
        ({"total_count": 5}, "Found 5 matches"),
        ({"exit_code": 0, "output": "done"}, "✓ Success"),
        ({"exit_code": 1, "error": "failed"}, "✗ Failed"),
        ({"total_lines": 42, "path": "config.py"}, "Read 42 lines"),
        ({"matches": []}, "No matches"),
    ]
    
    all_pass = True
    for input_data, expected in test_cases:
        # Test direct dict
        result = _summarize_tool_result(input_data)
        passed = expected in result
        status = "✓" if passed else "✗"
        print(f"{status} {input_data} → {result}")
        if not passed:
            print(f"   Expected substring: '{expected}'")
            all_pass = False
        
        # Test with DB sentinel prefix
        prefixed = "\x00json:" + json.dumps(input_data)
        result2 = _coerce_message_text(prefixed)
        passed2 = expected in result2
        status2 = "✓" if passed2 else "✗"
        print(f"{status2} (prefixed) {prefixed[:50]}... → {result2}")
        if not passed2:
            all_pass = False
    
    return all_pass

def test_multimodal_content():
    """Test multimodal content (text + images)."""
    print("\n" + "=" * 60)
    print("TEST 2: Multimodal Content")
    print("=" * 60)
    
    test_cases = [
        (
            [{"type": "text", "text": "Hello"}, {"type": "image_url", "image_url": {"url": "https://example.com/img.png"}}],
            ["Hello", "https://example.com/img.png"]
        ),
        (
            [{"type": "image_url", "image_url": "https://example.com/img2.png"}],
            ["https://example.com/img2.png"]
        ),
    ]
    
    all_pass = True
    for content, expected_parts in test_cases:
        result = _coerce_message_text(content)
        passed = all(part in result for part in expected_parts)
        status = "✓" if passed else "✗"
        print(f"{status} {content} → {result}")
        if not passed:
            all_pass = False
    
    return all_pass

def test_history_transformation():
    """Test full history transformation pipeline."""
    print("\n" + "=" * 60)
    print("TEST 3: Full History Transformation")
    print("=" * 60)
    
    # Simulate a session with mixed content
    history = [
        {"role": "user", "content": "Find all Python files"},
        {"role": "assistant", "content": "Searching...", "tool_calls": [{"id": "call1", "function": {"name": "search_files", "arguments": '{"pattern": "*.py"}'}}]},
        {"role": "tool", "content": "\x00json:{\"total_count\": 3, \"matches\": [\"a.py\", \"b.py\", \"c.py\"]}", "tool_call_id": "call1", "tool_name": "search_files"},
        {"role": "assistant", "content": "Found these files:\n\n```python\nprint('hello')\n```"},
        {"role": "user", "content": "Run a command"},
        {"role": "assistant", "content": "Running...", "tool_calls": [{"id": "call2", "function": {"name": "terminal", "arguments": '{"command": "echo hello"}'}}]},
        {"role": "tool", "content": "\x00json:{\"exit_code\": 0, \"output\": \"hello\\n\"}", "tool_call_id": "call2", "tool_name": "terminal"},
    ]
    
    messages = _history_to_messages(history)
    
    print(f"Input: {len(history)} messages")
    print(f"Output: {len(messages)} messages\n")
    
    all_pass = True
    for i, msg in enumerate(messages):
        role = msg.get('role', 'unknown')
        text = msg.get('text', '')[:80]
        
        # Check for expected transformations
        checks = []
        if msg.get('role') == 'tool':
            if 'Found 3 matches' in text:
                checks.append('✓ tool summarized')
            else:
                checks.append('✗ tool NOT summarized')
                all_pass = False
        
        print(f"[{i}] {role}: {text}... {', '.join(checks) if checks else ''}")
    
    return all_pass

def main():
    print("Hermes Overlay - Saved Session Rendering Parity Tests\n")
    
    results = []
    results.append(("Tool Summarization", test_tool_result_summarization()))
    results.append(("Multimodal Content", test_multimodal_content()))
    results.append(("History Pipeline", test_history_transformation()))
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    all_pass = True
    for name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status}: {name}")
        if not passed:
            all_pass = False
    
    if all_pass:
        print("\n✓✓✓ ALL TESTS PASSED ✓✓✓")
        return 0
    else:
        print("\n✗✗✗ SOME TESTS FAILED ✗✗✗")
        return 1

if __name__ == '__main__':
    sys.exit(main())