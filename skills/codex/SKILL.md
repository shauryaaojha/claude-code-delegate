---
name: codex
description: Delegate coding work to the OpenAI Codex CLI (`codex exec`, non-interactive). Use this whenever the user says "codex", "codex se karwa", "spawn codex", "delegate to codex", asks you to "make codex build/fix/scaffold X", wants to change the codex model or reasoning effort, or wants a large build/scaffold/refactor task offloaded to another coding agent while you orchestrate. Also use it for a second opinion on a diff via `codex exec review`, and when the user has previously said coding should go through codex and a new implementation task comes up.
---

# codex — delegating coding tasks to the Codex CLI

`codex exec` runs one autonomous coding turn in a workspace and exits. You stay the
orchestrator: you write the spec, spawn codex, verify its output (build/tests/diff), and
fix or re-prompt. Codex does the bulk of the typing.

## The command

```bash
codex exec "$(cat "<task-file>")" \
  --cd "<absolute-project-dir>" \
  --sandbox workspace-write \
  --dangerously-bypass-approvals-and-sandbox \
  --model gpt-5.6-terra \
  -o "<last-message-file>"
```

Or use the bundled runner, which does the same thing with less quoting risk:

```bash
bash ~/.claude/skills/codex/scripts/run_codex.sh <task-file> <project-dir> [model] [effort]
```

Why each flag matters:
- `exec` — non-interactive. Plain `codex` opens a TUI and hangs your shell.
- `"$(cat task-file)"` — put the prompt in a file, never inline. Multi-line prompts with
  backticks, `$`, quotes or heredocs break bash quoting (`unexpected EOF`) and PowerShell
  mangles them worse. Write the file with the Write tool, then `cat` it. (`codex exec -`
  reads the prompt from stdin, which also works: `codex exec - < task.md`.)
- `--cd` — the working root. Codex creates files relative to this dir, so point it at the
  exact repo you want changed.
- `--sandbox workspace-write` — lets it edit files in the workspace but not the wider
  machine. `read-only` for review/analysis tasks; `danger-full-access` only when it must
  touch things outside the repo.
- `--dangerously-bypass-approvals-and-sandbox` — no approval prompts (nobody can answer
  them in a background run). Confirm with the user the first time in a session; after that
  it is implied. Prefer `--approve-for-me` when you want the sandbox kept on.
- `--model` / `-c model_reasoning_effort=…` — pick explicitly (see below). Ask the user
  only if they have not stated a preference; otherwise reuse the last one they named.
- `-o <file>` — writes the agent's final message to a file. Handy when stdout is long:
  read that file instead of scrolling the log.
- `--json` — JSONL event stream, if you need to parse progress programmatically.
- `--skip-git-repo-check` — only when the target is not a git repo.
- Long runs: launch with the Bash tool's `run_in_background: true` (or `nohup … &`) and
  poll the log, so you are not blocked. There is no built-in timeout flag — use the Bash
  tool's `timeout` or wrap in `timeout 50m`.

## Models

`~/.codex/config.toml` holds the default (currently `gpt-5.6-terra`, effort `medium`).
Override per run:

| what | how |
|---|---|
| different model | `--model <id>` |
| more/less thinking | `-c model_reasoning_effort=high` (`minimal`/`low`/`medium`/`high`) |
| local/OSS model | `--oss --local-provider ollama` |

Raise effort for design-heavy or algorithmic work; leave it at medium for mechanical
edits. If a run dies on quota or rate limits, switch model rather than retrying the same
one, and tell the user what you switched to.

## Writing the task file

Codex starts cold — it has none of your conversation context. The task file is its entire
brief, so write it like a handoff to a competent contractor who has never seen the repo:

1. **Where** — absolute working dir on the first line (`You are working in C:/…/project`).
2. **Read first** — exact paths of spec, existing code and conventions it must match.
3. **Deliver** — numbered list of files/features with concrete acceptance criteria
   (`npm run build` and `npm test` must pass; function signatures stay identical; etc.).
4. **Don't** — what is *not* its job (e.g. "do not connect to any database"; "do not
   install X"; "do not touch app/api/**").
5. **Finish** — "End with a concise summary: files written, build/test results, anything
   you were unsure about." That summary is what lands in `-o` and on stdout; it is your
   only view into the run besides the diff.

Keep decisions *made*, not open — codex cannot ask you questions in exec mode, it will
guess. See `references/task-template.md` for a fill-in template.

## Reviewing instead of building

```bash
codex exec review --cd "<project-dir>" --sandbox read-only "Review the uncommitted diff for correctness bugs."
```
Useful as a second opinion on a diff you or another agent wrote. Read-only: it reports,
it does not edit.

## After the run — always verify

Codex reports success optimistically. Before telling the user it is done:

```bash
git status --short          # what it actually touched
npm run build && npm test   # or the project's equivalent
```

Typical leftovers to fix yourself (faster than a re-prompt): unused imports, stubbed
helpers left as TODO, a file written to the wrong folder, tests it "fixed" by weakening.
Re-prompt codex (new task file, or `codex exec resume --last "…"` to continue with its
context) only for substantial gaps.

If codex stops early or its quota dies mid-task, finish the remaining items yourself —
don't leave the user with a half-built tree.

## Other modes

- `codex exec resume --last "<follow-up>"` — continue the previous session with context.
- `codex exec fork --last "…"` — branch off a session without disturbing it.
- `codex exec --worktree …` — run in a managed git worktree, so the main tree stays clean.
- `codex apply` — apply the last agent-produced diff to the working tree.
- `codex -i <image> …` — attach screenshots (e.g. a broken UI) to the prompt.
