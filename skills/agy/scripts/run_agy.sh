#!/usr/bin/env bash
# Run one non-interactive Antigravity (agy) turn from a task file.
# usage: run_agy.sh <task-file> <project-dir> [model] [timeout]
set -euo pipefail
TASK="${1:?task file}"; DIR="${2:?project dir}"
MODEL="${3:-gemini-3.8-flash-high}"; TIMEOUT="${4:-50m}"
[ -f "$TASK" ] || { echo "task file not found: $TASK" >&2; exit 1; }
[ -d "$DIR" ]  || { echo "project dir not found: $DIR" >&2; exit 1; }
DIR="$(cd "$DIR" && pwd)"
echo ">> agy model=$MODEL dir=$DIR task=$TASK" >&2
exec agy -p "$(cat "$TASK")" --model "$MODEL" --dangerously-skip-permissions \
  --print-timeout "$TIMEOUT" --add-dir "$DIR"
