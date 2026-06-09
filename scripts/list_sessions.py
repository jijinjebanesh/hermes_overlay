"""Hermes Overlay — List sessions bridge.

Invoked by the Electron main process to fetch recent sessions from the 
Hermes backend SQLite store (state.db) without needing an interactive TTY.

Outputs a JSON array of sessions.
"""
import json
import sqlite3
import os
import sys

def main():
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
        
        # Get latest 50 active sessions
        cursor.execute('''
            SELECT id, title, started_at, message_count 
            FROM sessions 
            WHERE archived = 0 
            ORDER BY started_at DESC 
            LIMIT 50
        ''')
        
        sessions = []
        for row in cursor.fetchall():
            # Create a simple preview or default title
            title = row['title']
            if not title:
                title = "New Session"
                
            sessions.append({
                "id": row['id'],
                "title": title,
                "started_at": row['started_at'] * 1000 if row['started_at'] else 0, # Convert to ms for JS Date
                "message_count": row['message_count']
            })
            
        conn.close()
        print(json.dumps(sessions))
        
    except Exception as e:
        print(json.dumps([]))
        print(f"Error: {e}", file=sys.stderr)

if __name__ == "__main__":
    main()
