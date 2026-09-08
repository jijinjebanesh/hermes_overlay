import re
import os

tsx_path = "src/components/Conversation.tsx"
with open(tsx_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Replace the onKeyDown handler
content = content.replace(
    '<div className="conversation" onKeyDown={handleNavigatorKeyDown} tabIndex={0}>',
    '<div className="conversation">'
)

# 2. Replace the UI block
start_marker = r'      {/\* ── Conversation navigator \(hover popup, top-right\) ── \*/}'
end_marker = r'      {/\* ── Scroll container ── \*/}'

new_nav = """      {/* ── In-Thread Navigation (Stack of horizontal bars) ── */}
      {userPrompts.length >= 5 && (
        <div className="in-thread-nav" aria-label="In-thread navigation">
          <div className="in-thread-nav-scroll-container">
            {userPrompts.map((entry) => {
              const isActive = entry.index === activePromptIndex;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`in-thread-nav-item ${isActive ? 'is-active' : ''}`}
                  onClick={() => scrollToPrompt(entry)}
                  aria-label={`Jump to: ${entry.preview}`}
                  title={entry.preview}
                >
                  <div className="in-thread-nav-tooltip">{entry.preview}</div>
                  <div className="in-thread-nav-bar" />
                </button>
              );
            })}
          </div>
        </div>
      )}

"""
pattern = re.compile(start_marker + r'.*?' + end_marker, re.DOTALL)
content = pattern.sub(new_nav + end_marker, content)

with open(tsx_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Conversation.tsx UI replaced.")
