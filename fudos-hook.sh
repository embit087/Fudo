#!/bin/bash
# Claude Code hook: injects multi-frame screenshots when prompt starts with "fudos"
# Requires: fudo app running (localhost:17321) + fudos.fish in ~/.config/fish/functions/

INPUT=$(cat)

# Check if the user's prompt starts with "fudos"
if ! echo "$INPUT" | grep -qi '"fudos '; then
  exit 0
fi

# Run fudos via fish
FUDOS_OUT=$(/opt/homebrew/bin/fish -c 'fudos' 2>&1)
if [ $? -ne 0 ]; then
  exit 0
fi

# Output JSON with additionalContext so the agent gets the multi-frame screenshot info
python3 -c "
import json, sys
out = sys.stdin.read()
result = {
    'hookSpecificOutput': {
        'hookEventName': 'UserPromptSubmit',
        'additionalContext': '<fudos-screenshots>\n' + out + '\n</fudos-screenshots>\nUse the Read tool to view each screenshot image file at the paths shown above, then answer the user question based on what you see across all frames and the listed source files.'
    }
}
print(json.dumps(result))
" <<< "$FUDOS_OUT"
