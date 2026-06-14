"""Hermes Overlay — Get session bridge.

Invoked by the Electron main process to fetch messages for a specific session 
from the Hermes backend SQLite store (state.db).

Outputs a JSON array of messages formatted for the overlay frontend.
Applies the SAME formatting as the live streaming parser in main.ts.
"""
import json
import sqlite3
import os
import sys
import re

# Enable debug logging to a file the overlay can access
LOG_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'get_session_debug.log')

def log(msg):
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(f"{msg}\n")
    except:
        pass

log(f"=== get_session.py invoked ===")
log(f"Args: {sys.argv}")

def strip_tool_calls_from_assistant_text(content: str) -> str:
    """Strip tool-call JSON blobs that were incorrectly stored in assistant content.
    
    Older Hermes versions serialized tool calls as JSON strings inside the assistant's
    text content (e.g., 'terminal · {"command": "..."}"). This function detects and
    removes these patterns, leaving only the actual assistant response text.
    
    Returns the cleaned text, or the original if no tool-call patterns found.
    """
    if not isinstance(content, str):
        return content
    
    # Pattern: toolname · {"..."} where the JSON may span multiple lines
    lines = content.split('\n')
    cleaned_lines = []
    skip_until_close = False
    brace_depth = 0
    
    for line in lines:
        # Detect start of tool-call JSON: "toolname · {"
        match = re.match(r'^(\w+)\s+·\s+\{', line)
        if match:
            # Count braces to find where the JSON ends
            brace_depth = line.count('{') - line.count('}')
            if brace_depth <= 0:
                # Single-line JSON, skip this line entirely
                continue
            else:
                # Multi-line JSON, start skipping
                skip_until_close = True
                continue
        
        if skip_until_close:
            brace_depth += line.count('{') - line.count('}')
            if brace_depth <= 0:
                # JSON block ended
                skip_until_close = False
            # Skip this line (it's part of the JSON blob)
            continue
        
        # Not a tool-call line, keep it
        cleaned_lines.append(line)
    
    result = '\n'.join(cleaned_lines)
    
    # If we stripped everything or the result is mostly whitespace, 
    # return a placeholder instead of empty
    if not result.strip() and content.strip():
        return "[Tool execution completed]"
    
    return result


def format_content_like_streaming(content):
    """
    Apply the exact same formatting as the live streaming parser in main.ts.
    This ensures loaded history matches live responses.
    """
    if not content:
        return content
    
    # 1. Remove ANSI escape sequences (matches main.ts line 1005)
    clean_content = re.sub(r'[\u001b\u009b][\[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]', '', content)
    
    # 2. Process line by line like the streaming parser
    lines = clean_content.split('\n')
    output_lines = []
    
    in_box = False
    in_diff = False
    diff_buffer = []
    is_thinking_box = False
    
    for line in lines:
        trimmed = line.strip()
        
        # Skip metadata lines (matches main.ts lines 1055-1067)
        if (trimmed.startswith('Query:') or
            trimmed.startswith('Initializing agent') or
            re.match(r'^─+$', trimmed) or
            trimmed.startswith('Resume this session with:') or
            trimmed.startswith('hermes --resume') or
            trimmed.startswith('Session:') or
            trimmed.startswith('Duration:') or
            trimmed.startswith('Messages:') or
            trimmed.startswith('Exit code:') or
            trimmed.startswith('↻') or
            re.match(r'Resumed session', trimmed)):
            continue
        
        # Handle diff blocks (matches main.ts lines 1073-1084)
        if in_diff:
            if trimmed.startswith('\u256d\u2500') or (trimmed == '' and len(diff_buffer) > 0):
                # End of diff block
                output_lines.append('\n'.join(diff_buffer).strip())
                in_diff = False
                diff_buffer = []
            else:
                diff_buffer.append(line)
            continue
        
        # Detect box start (matches main.ts lines 1087-1093)
        if trimmed.startswith('\u256d\u2500'):
            in_box = True
            is_thinking_box = 'thinking' in trimmed.lower() or 'reasoning' in trimmed.lower()
            continue
        
        if re.match(r'^\u2500+\s+\u2695 Hermes', trimmed):
            in_box = True
            is_thinking_box = False
            continue
        
        # Detect box end (matches main.ts lines 1021-1036)
        if in_box and trimmed.startswith('\u2570\u2500'):
            in_box = False
            continue
        
        # Handle box content - strip indentation (matches main.ts lines 1028, 1042, 1115)
        if in_box:
            # Strip 4-space indentation from box content
            output_lines.append(re.sub(r'^    ', '', line))
            continue
        
        # Handle tool activity lines (matches main.ts lines 1094-1110)
        # Using unicode escapes for box-drawing characters
        if trimmed.startswith('\u250a') or re.match(r'^[\u2502\u250a]\s', trimmed):
            tool_match = re.match(r'[\u2502\u250a]\s*(?:\U0001f4bb|\u270d\ufe0f|\U0001f50d|\U0001f4c1|\U0001f310|\u26a1|\U0001f527|\U0001f4dd|\U0001f6e0\ufe0f|\u2699\ufe0f|\U0001f512)\s*(?:preparing\s+)?(.+?)\u2026?$', trimmed)
            if tool_match:
                content_text = re.sub(r'^[\u2502\u250a]\s*', '', trimmed)
                output_lines.append(content_text)
            elif 'review diff' in trimmed:
                in_diff = True
                diff_buffer = []
            else:
                content_text = re.sub(r'^[\u2502\u250a]\s*', '', trimmed)
                output_lines.append(content_text)
            continue
        
        # Regular content - strip 4-space indentation (matches main.ts line 1115)
        if trimmed:
            output_lines.append(re.sub(r'^    ', '', line))
    
    # Flush any remaining diff buffer
    if in_diff and diff_buffer:
        output_lines.append('\n'.join(diff_buffer).strip())
    
    # Rejoin and clean up excessive blank lines
    result = '\n'.join(output_lines)
    result = re.sub(r'\n{4,}', '\n\n\n', result)  # Max 3 consecutive newlines
    
    return result.strip()


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No session ID provided"}))
        return
        
    session_id = sys.argv[1]
    
    try:
        # Resolve hermes state.db path
        local_app_data = os.environ.get("LOCALAPPDATA", os.path.join(os.path.expanduser("~"), "AppData", "Local"))
        db_path = os.path.join(local_app_data, "hermes", "state.db")
        
        if not os.path.exists(db_path):
            print(json.dumps([]))
            return

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get messages for session
        cursor.execute('''
            SELECT id, role, content, timestamp, tool_call_id, tool_calls, tool_name, reasoning, reasoning_content 
            FROM messages 
            WHERE session_id = ? 
            ORDER BY timestamp ASC
        ''', (session_id,))
        
        messages = []
        tool_calls_by_id = {}
        
        for row in cursor.fetchall():
            role = row['role']
            content = row['content'] or ''
            
            if role == 'tool':
                tc_id = row['tool_call_id']
                output_str = content
                
                # Decode \x00json: sentinel and raw JSON
                if isinstance(content, str):
                    if content.startswith('\x00json:'):
                        try:
                            parsed = json.loads(content[6:])
                            output_str = json.dumps(parsed, indent=2) if isinstance(parsed, dict) else str(parsed)
                        except:
                            pass
                    elif content.startswith('{') or content.startswith('['):
                        try:
                            parsed = json.loads(content)
                            output_str = json.dumps(parsed, indent=2) if isinstance(parsed, dict) else str(parsed)
                        except:
                            pass
                    elif '\\"' in content or '\\n' in content:
                        try:
                            unescaped = content.encode().decode('unicode_escape')
                            if unescaped.startswith('{') or unescaped.startswith('['):
                                parsed = json.loads(unescaped)
                                output_str = json.dumps(parsed, indent=2) if isinstance(parsed, dict) else str(parsed)
                            else:
                                output_str = unescaped
                        except:
                            pass
                
                if tc_id and tc_id in tool_calls_by_id:
                    tool_calls_by_id[tc_id]["output"] = output_str
                    tool_calls_by_id[tc_id]["status"] = "success"
                
                # Do not emit a separate message bubble for the tool result
                continue

            # Basic parsing of tool calls if any
            tool_calls = []
            if row['tool_calls']:
                try:
                    tool_calls_data = json.loads(row['tool_calls'])
                    for tc in tool_calls_data:
                        tc_id = tc.get("id", "")
                        
                        # Extract command/args properly - don't JSON stringify
                        fn_args = tc.get("function", {}).get("arguments", "{}")
                        try:
                            args_dict = json.loads(fn_args) if isinstance(fn_args, str) else fn_args
                            # For terminal: extract the command string
                            if tc.get("function", {}).get("name") == "terminal":
                                command_str = args_dict.get("command", json.dumps(args_dict))
                            # For write_file: show path or content preview
                            elif tc.get("function", {}).get("name") == "write_file":
                                if args_dict.get("path"):
                                    command_str = f"📁 {args_dict['path']}"
                                elif args_dict.get("content"):
                                    first_line = args_dict["content"].split('\n')[0][:50]
                                    command_str = f"📝 {first_line}..." if '\n' in args_dict["content"] else f"📝 {first_line}"
                                else:
                                    command_str = json.dumps(args_dict)
                            else:
                                # For other tools, show a summary
                                first_key = next(iter(args_dict.keys()), None)
                                if first_key:
                                    val = args_dict[first_key]
                                    command_str = f"{first_key}: {str(val)[:50]}"
                                else:
                                    command_str = json.dumps(args_dict)
                        except:
                            command_str = fn_args

                        tc_obj = {
                            "id": tc_id,
                            "name": tc.get("function", {}).get("name", ""),
                            "command": command_str,
                            "status": "success"  # Assume success for historical tool calls
                        }
                        tool_calls.append(tc_obj)
                        if tc_id:
                            tool_calls_by_id[tc_id] = tc_obj
                except:
                    pass
            
            # Apply streaming parser formatting
            log(f"Before formatting - role={role}, content_preview={content[:200] if content else 'empty'}")
            content = format_content_like_streaming(content)
            
            # Strip corrupted tool-call JSON blobs (from older Hermes versions)
            if role == 'assistant':
                log(f"Stripping tool calls from assistant message...")
                old_content = content
                content = strip_tool_calls_from_assistant_text(content)
                if old_content != content:
                    log(f"Content was modified! Removed tool-call JSON blobs")
                    log(f"New content preview: {content[:200] if content else 'empty'}")
            
            log(f"After formatting - content_preview={content[:200] if content else 'empty'}")
            
            reasoning = row['reasoning'] or row['reasoning_content']
            
            # Create segments for structured rendering
            segments = []
            
            # Add reasoning segment if present
            if reasoning and reasoning.strip():
                segments.append({
                    "type": "thinking",
                    "content": reasoning.strip()
                })
            
            # Add text content segment if present
            if content and content.strip():
                segments.append({
                    "type": "text",
                    "content": content
                })
            
            messages.append({
                "id": f"{row['id']}_{row['timestamp']}" if row['timestamp'] else str(row['id']),
                "role": role,
                "content": content,
                "timestamp": int(row['timestamp'] * 1000) if row['timestamp'] else 0,
                "toolCalls": tool_calls,
                "segments": segments,
                "attachments": []
            })
        
        conn.close()
        
        output = json.dumps(messages if messages else [])
        print(output)
        
    except Exception as e:
        print(json.dumps([]))
        print(f"Error in get_session.py: {e}", file=sys.stderr)

if __name__ == "__main__":
    main()