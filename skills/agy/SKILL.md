---
name: agy
description: Delegate coding work to the Antigravity `agy` CLI agent (Google Antigravity, non-interactive print mode). Use this whenever the user says "agy", "antigravity", "antigravity se karwa", "spawn antigravity", "delegate to antigravity", asks you to "make antigravity build/fix/scaffold X", wants to change the antigravity model, or wants a large build/scaffold/refactor task offloaded to another coding agent while you orchestrate. Also use it when the user has previously said coding should go through antigravity and a new implementation task comes up.
---

# agy — delegating coding tasks to Antigravity

`agy` is the Antigravity CLI. In print mode (`-p`) it runs one autonomous coding turn in
a workspace and exits. You stay the orchestrator: you write the spec, spawn agy, verify
its output (build/tests/diff), and fix or re-prompt. agy does the bulk of the typing.

## The command

```bash
agy -p "$(cat "<task-file>")" \
  --model gemini-3.8-flash-high \
  --dangerously-skip-permissions \
  --print-timeout 50m \
  --add-dir "<absolute-project-dir>"
```

Or use the bundled runner, which does the same thing with less quoting risk:

```bash
bash ~/.claude/skills/agy/scripts/run_agy.sh <task-file> <project-dir> [model] [timeout]
```

Why each flag matters:
- `-p` / `--print` — non-interactive; without it agy opens a TUI and hangs your shell.
- `$(cat task-file)` — put the prompt in a file, never inline. Multi-line prompts with
  backticks, `$`, quotes or heredocs break bash quoting (`unexpected EOF`) and PowerShell
  mangles them worse. Write the file with the Write tool, then `cat` it.
- `--model` — pick explicitly (see below). Ask the user only if they haven't stated a
  preference in this session; otherwise reuse the last one they named.
- `--dangerously-skip-permissions` — agy auto-approves its own tool calls. Without it the
  run blocks on prompts nobody can answer. Confirm with the user the first time in a
  session; after that it's implied.
- `--print-timeout 50m` — default `0` waits forever; a stuck run would block you. 50m covers
  a full scaffold. Use the Bash `timeout` param (max 600000 ms) with `run_in_background: true`
  for anything over a few minutes so you aren't blocked.
- `--add-dir` — agy's workspace root. It **creates files relative to this dir**, so point it at
  the exact folder you want output in (see "Where files land").
- Do NOT pass `--effort` with Claude models — `--effort is not supported for model "claude-opus-4-6-thinking"`.
  Gemini models encode effort in the model id (`-high/-medium/-low`) instead.

## Models

`agy models` lists what's available. Known ids (Sept 2026):

| id | use for |
|---|---|
| `gemini-3.8-flash-high` | default for builds/scaffolds — fast, generous quota |
| `gemini-3.1-pro-high` | harder reasoning, slower |
| `claude-opus-4-6-thinking`, `claude-sonnet-4-6` | strongest, but quota is small and runs out mid-task; no `--effort` |
| `gpt-oss-120b-medium` | cheap small edits |

If a run dies with a quota/rate error, switch model rather than retrying the same one. If the
user says "model change karde X pe", use X for every subsequent run in the session.

## Writing the task file

agy starts cold — it has none of your conversation context. The task file is its entire
brief, so write it like a handoff to a competent contractor who has never seen the repo:

1. **Where** — absolute working dir on the first line (`You are working in C:/…/project`).
2. **Read first** — exact paths of spec, existing code and conventions it must match.
3. **Deliver** — numbered list of files/features with concrete acceptance criteria
   (`npm run build` and `npm test` must pass; function signatures stay identical; etc.).
4. **Don't** — what is *not* its job (e.g. "do not connect to any database, the orchestrator
   applies SQL via MCP"; "do not install X"). agy will otherwise wander into it.
5. **Finish** — "End with a concise summary: files written, build/test results, anything
   you were unsure about." That summary is what comes back on stdout; it's your only view
   into what happened besides the diff.

Keep decisions *made*, not open — agy can't ask you questions in print mode, it will guess.
Put the file in the project (e.g. `<area>/AGY_TASK.md`) if the user may want to see/reuse it,
otherwise in the scratchpad.

See `references/task-template.md` for a fill-in template.

## Where files land (Windows gotchas)

- agy scaffolds *inside* `--add-dir`. If you want `project/app/` and pass `--add-dir project`,
  you may get `project/app/` or agy may pick a name; check with `ls` and `mv` after.
- Moving the output folder can fail with `Device or resource busy` when your shell's cwd is
  inside it (or a dev server/agy is still running). `cd` out (or run `mv` with absolute paths
  from another dir) and retry.
- Paths in the task file: use forward slashes (`C:/Users/…`) — both agy and Git Bash accept them.

## After the run — always verify

agy reports success optimistically. Before telling the user it's done:

```bash
git status --short          # what it actually touched
npm run build && npm test   # or the project's equivalent
```

Typical leftovers to fix yourself (faster than a re-prompt): unused imports (`TS6133`),
stubbed helpers left as TODO, `.env` committed, wrong folder. Re-prompt agy (new task file,
same command, or `agy -c -p "…"` to continue the last conversation) only for substantial gaps.

If agy's quota dies mid-task, finish the remaining items yourself — don't leave the user with
a half-built tree.

## Interactive / other modes

- `agy -i "<prompt>"` starts interactive with a first prompt — only if the user wants to drive
  agy themselves; tell them to run it via `! agy -i …`.
- `agy -c -p "…"` continues the most recent agy conversation (keeps its context).
- `agy --mode plan -p "…"` for a plan-only pass when the task is fuzzy.
- `--output-format json` if you need to parse the result programmatically.
