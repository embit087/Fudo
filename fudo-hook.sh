#!/bin/bash
# Claude Code hook: injects annotated screenshot when prompt starts with "fudo"
# Requires: fudo app running (localhost:17321) + fudo.fish in ~/.config/fish/functions/

INPUT=$(cat)

# Check if the user's prompt starts with "fudo"
if ! echo "$INPUT" | grep -qi '"fudo '; then
  exit 0
fi

# Run fudo via fish
FUDO_OUT=$(/opt/homebrew/bin/fish -c 'fudo' 2>&1)
if [ $? -ne 0 ]; then
  exit 0
fi

# Output JSON with additionalContext so the agent gets the screenshot info
python3 -c "
import json, sys
out = sys.stdin.read()
result = {
    'hookSpecificOutput': {
        'hookEventName': 'UserPromptSubmit',
        'additionalContext': '<fudo-screenshot>\n' + out + '\n</fudo-screenshot>\nUse the Read tool to view the screenshot image file at the path shown above, then answer the user question based on what you see on screen and the listed source files.'
    }
}
print(json.dumps(result))
" <<< "$FUDO_OUT"
