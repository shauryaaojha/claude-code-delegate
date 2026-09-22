#!/usr/bin/env bash
# Run one non-interactive Codex turn from a task file.
# usage: run_codex.sh <task-file> <project-dir> [model] [reasoning-effort] [sandbox]
set -euo pipefail
TASK="${1:?task file}"; DIR="${2:?project dir}"
MODEL="${3:-}"; EFFORT="${4:-}"; SANDBOX="${5:-workspace-write}"
[ -f "$TASK" ] || { echo "task file not found: $TASK" >&2; exit 1; }
[ -d "$DIR" ]  || { echo "project dir not found: $DIR" >&2; exit 1; }
DIR="$(cd "$DIR" && pwd)"

# The agent's final message, next to the task file, so a long stdout does not
# have to be scrolled to find the summary.
OUT="${TASK%.md}.summary.md"

args=(exec --cd "$DIR" --sandbox "$SANDBOX" --dangerously-bypass-approvals-and-sandbox -o "$OUT")
[ -n "$MODEL" ]  && args+=(--model "$MODEL")
[ -n "$EFFORT" ] && args+=(-c "model_reasoning_effort=\"$EFFORT\"")

echo ">> codex model=${MODEL:-<config default>} effort=${EFFORT:-<config default>} sandbox=$SANDBOX dir=$DIR task=$TASK" >&2
echo ">> summary will be written to $OUT" >&2
exec codex "${args[@]}" "$(cat "$TASK")"
