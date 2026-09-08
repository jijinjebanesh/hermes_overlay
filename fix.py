import os

tsx_path = "src/components/Conversation.tsx"
with open(tsx_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace('{userPrompts.length > 5 && (\n                  <span className="stream-tokens">', '{streamState.tokens > 0 && (\n                  <span className="stream-tokens">')
content = content.replace('{userPrompts.length >= 5 && (', '{userPrompts.length > 5 && (')

with open(tsx_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Conversation.tsx fixed.")
