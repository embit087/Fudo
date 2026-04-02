#!/bin/bash
# Claude Code hook: injects annotated screenshot when prompt starts with "fudo"
# Requires: fudo app running (localhost:17321) + fudo.fish in ~/.config/fish/functions/

INPUT=$(cat)

# Check if the user's prompt starts with "fudos" (multi-frame) or "fudo" (single)
if echo "$INPUT" | grep -qi '"fudos '; then
  FUDO_CMD="fudos"
  CONTEXT_TAG="fudo-multi-screenshots"
  CONTEXT_INSTRUCTIONS="Use the Read tool to view each screenshot image file listed above. The user captured multiple frames in sequence — analyze all of them together, along with the listed source files."
elif echo "$INPUT" | grep -qi '"fudo '; then
  FUDO_CMD="fudo"
  CONTEXT_TAG="fudo-screenshot"
  CONTEXT_INSTRUCTIONS="Use the Read tool to view the screenshot image file at the path shown above, then answer the user question based on what you see on screen and the listed source files."
else
  exit 0
fi

# Run the appropriate fudo command via fish
FUDO_OUT=$(/opt/homebrew/bin/fish -c "$FUDO_CMD" 2>&1)
if [ $? -ne 0 ]; then
  exit 0
fi

# Output JSON with additionalContext so the agent gets the screenshot info
python3 -c "
import json, sys
out = sys.stdin.read()
tag = '$CONTEXT_TAG'
instructions = '$CONTEXT_INSTRUCTIONS'
result = {
    'hookSpecificOutput': {
        'hookEventName': 'UserPromptSubmit',
        'additionalContext': '<' + tag + '>\n' + out + '\n</' + tag + '>\n' + instructions
    }
}
print(json.dumps(result))
" <<< "$FUDO_OUT"
