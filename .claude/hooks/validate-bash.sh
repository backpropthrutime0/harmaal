#!/usr/bin/env bash
# Pre-tool hook: block dangerous bash commands.
# Reads the tool-call JSON from stdin and emits a decision JSON.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)

# Block destructive patterns
BLOCKED_PATTERNS=(
  "rm -rf /"
  "rm -rf ~"
  "DROP DATABASE"
  "DROP TABLE"
  "truncate"
  "> /dev/sda"
  "mkfs"
  "dd if="
  ":(){ :|:& };:"
)

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qi "$pattern"; then
    echo '{"decision":"block","reason":"Blocked destructive command pattern: '"$pattern"'"}'
    exit 0
  fi
done

# Warn on production-adjacent commands
if echo "$COMMAND" | grep -qiE "(docker.*prod|deploy|push.*main|push.*master)"; then
  echo '{"decision":"ask","reason":"This looks like a production operation. Please confirm."}'
  exit 0
fi

echo '{"decision":"approve"}'
exit 0
