"""Hermes Overlay — Get session bridge.

Invoked by the Electron main process to fetch messages for a specific session 
from the Hermes backend SQLite store (state.db).

Outputs a JSON array of messages formatted for the overlay frontend.
"""
import json
import sqlite3
import os
import sys

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
        for row in cursor.fetchall():
            # Basic parsing of tool calls if any
            tool_calls = []
            if row['tool_calls']:
                try:
                    tool_calls_data = json.loads(row['tool_calls'])
                    for tc in tool_calls_data:
                        tool_calls.append({
                            "id": tc.get("id", ""),
                            "name": tc.get("function", {}).get("name", ""),
                            "command": json.dumps(tc.get("function", {}).get("arguments", {})),
                            "status": "success"
                        })
                except:
                    pass
            
            # Note: We aren't reconstructing the exact stream segments (diffs, etc.)
            # since they are already resolved in the final 'content'.
            # We'll just return it as a single text content.
            
            # However, if there's reasoning, we can append it as a thinking segment
            segments = []
            reasoning = row['reasoning'] or row['reasoning_content']
            if reasoning:
                segments.append({
                    "type": "thinking",
                    "content": reasoning
                })
            
            content = row['content'] or ''
            
            if content:
                segments.append({
                    "type": "text",
                    "content": content
                })
                
            messages.append({
                "id": str(row['id']) + "_" + str(row['timestamp']),
                "role": row['role'],
                "content": content,
                "timestamp": row['timestamp'] * 1000 if row['timestamp'] else 0,
                "toolCalls": tool_calls,
                "segments": segments
            })
            
        conn.close()
        print(json.dumps(messages))
        
    except Exception as e:
        print(json.dumps([]))
        print(f"Error: {e}", file=sys.stderr)

if __name__ == "__main__":
    main()
