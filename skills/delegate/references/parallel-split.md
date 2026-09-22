# Splitting one job across two delegates

A worked shape for fanning work out without the agents colliding. Copy it, fill it in,
write one file per agent.

## The split

| agent | owns | must not touch |
|---|---|---|
| agy | `data/**`, `content/**` | `lib/**`, `app/**`, every test file |
| codex | `lib/**`, `tests/**` | `data/**`, `content/**` |

Rules of thumb:
- Split by **directory**, never by "feature" — features overlap, directories do not.
- The shared contract (types, function signatures, row shapes) goes in **both** task
  files, written out in full. Neither agent may change it.
- If one genuinely needs the other's output, do not parallelise that pair. Run them in
  sequence instead.
- Shared files — a barrel `index.ts`, a global stylesheet, a router table — belong to
  **you**. Have each agent write its own file and wire them up yourself afterwards.

## The contract block, pasted into both files

```
## Shared contract — do not change these
export interface Lesson { id: string; title: string; body: string; }
`loadLesson(id: string): Promise<Lesson | null>` lives in lib/lessons.ts.
Your files must match this exactly. If it does not fit, stop and say so in your
summary rather than changing the shape.
```

## Launching

```bash
# each in its own Bash call with run_in_background: true
bash ~/.claude/skills/agy/scripts/run_agy.sh    <dir>/task-a.md "$PROJECT"
bash ~/.claude/skills/codex/scripts/run_codex.sh <dir>/task-b.md "$PROJECT" "" high
```

## Collecting

1. Wait for both. A partial tree does not build; do not panic at a mid-run failure.
2. `git status --short` — did each agent stay inside its own directories? A file outside
   its lane is the first thing to check, and the most common failure.
3. Build and test once, at the end.
4. Wire up the shared files yourself.
5. Report per agent: what it wrote, what you fixed.
