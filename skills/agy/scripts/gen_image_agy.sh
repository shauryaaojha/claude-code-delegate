#!/usr/bin/env bash
# Generate one image with Antigravity's built-in generate_image tool.
# usage: gen_image_agy.sh <prompt-file> <output.png> [model] [timeout]
#
# The prompt file holds only the picture: subject, style, composition, colours.
# This script adds the part agy gets wrong on its own — which tool to use and
# exactly where the file must land — and then checks a real image arrived,
# because agy's closing line claims success either way.
set -euo pipefail
PROMPT="${1:?prompt file}"; OUT="${2:?output path (.png)}"
MODEL="${3:-gemini-3.8-flash-high}"; TIMEOUT="${4:-10m}"
[ -f "$PROMPT" ] || { echo "prompt file not found: $PROMPT" >&2; exit 1; }

OUT_DIR="$(dirname "$OUT")"; OUT_NAME="$(basename "$OUT")"
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
[ -e "$OUT_DIR/$OUT_NAME" ] && { echo "refusing to overwrite: $OUT_DIR/$OUT_NAME" >&2; exit 1; }

BRIEF="Generate one image with your built-in image generation tool (generate_image).
Do NOT draw it with code, SVG, HTML canvas, Python or any other program.

$(cat "$PROMPT")

Save the result as \`$OUT_NAME\` in the current working directory. If your image
tool saves somewhere else, copy the file here under exactly that name. Do not
create or modify any other file.

End with one line: the absolute path of the saved file."

echo ">> agy image model=$MODEL out=$OUT_DIR/$OUT_NAME" >&2
cd "$OUT_DIR"
agy -p "$BRIEF" --model "$MODEL" --dangerously-skip-permissions \
  --print-timeout "$TIMEOUT" --add-dir "$OUT_DIR"

# Trust the file, not the summary.
F="$OUT_DIR/$OUT_NAME"
[ -s "$F" ] || { echo "!! no image at $F — agy did not save it" >&2; exit 2; }
MAGIC="$(head -c 4 "$F" | od -An -tx1 | tr -d ' \n')"
case "$MAGIC" in
  89504e47) KIND=png ;;
  ffd8ff*)  KIND=jpeg ;;
  52494646) KIND=webp ;;
  *) echo "!! $F is not an image (magic $MAGIC) — probably drawn with code" >&2; exit 3 ;;
esac
echo ">> ok: $F ($KIND, $(wc -c < "$F" | tr -d ' ') bytes)" >&2
