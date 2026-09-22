<div align="center">

# claude-code-delegate

**Hand the typing to another agent. Stay the one who decides.**

Two [Claude Code](https://claude.com/claude-code) skills that turn a second coding CLI —
[Antigravity](https://antigravity.google) or [OpenAI Codex](https://github.com/openai/codex) —
into a worker you can spawn, brief, and check.

[![npm](https://img.shields.io/npm/v/claude-code-delegate?color=%23d97757&label=npm)](https://www.npmjs.com/package/claude-code-delegate)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)

</div>

---

## Install

```bash
npx claude-code-delegate install
```

That copies the skills into `~/.claude/skills/`. Restart Claude Code and type `/agy` or
`/codex` — or just say *"get codex to scaffold the admin console"* and Claude will reach
for the skill on its own.

```bash
npx claude-code-delegate doctor      # are the agent CLIs actually on PATH?
npx claude-code-delegate list        # what ships here, what is installed
npx claude-code-delegate uninstall   # take them back out
```

`ccd` works as a short alias for every command.

## Why

A large scaffold is thousands of lines of mechanical typing. Claude is good at deciding
*what* those lines should be and bad at being the cheapest way to produce them. These
skills split the job:

| Claude does | The delegate does |
|---|---|
| reads the repo, picks the design | writes the files |
| writes the spec as a task file | runs the build |
| verifies the diff, the build, the tests | reports back |
| fixes the leftovers, re-prompts | |

You keep the context and the judgement. The other agent keeps the keyboard.

## What each skill knows

Both skills are the accumulated result of getting this wrong a few times. They are not
just a command reference.

### `/agy` — Antigravity

Runs `agy -p` in print mode: one autonomous turn in a workspace, then exit. Covers model
selection (`--model`), `--print-timeout` for long builds, `--add-dir` scoping, and what to
do when a run dies on quota.

### `/codex` — OpenAI Codex

Runs `codex exec`. Covers sandbox levels (`workspace-write` vs `read-only` vs
`danger-full-access`), reasoning effort, `-o` for capturing the final message, resume and
fork, and `codex exec review` for a second opinion on a diff you already have.

### What both insist on

- **Prompts go in a file, never inline.** A multi-line prompt containing backticks, `$`,
  quotes or a heredoc will break bash quoting, and PowerShell mangles it worse. Write the
  task to a file, then `cat` it into the command.
- **The task file is the entire brief.** The delegate starts cold with none of your
  conversation. Each skill ships a `references/task-template.md` with the five sections
  that make the difference: where, read first, deliver, don't, finish.
- **Decisions are made, not open.** A non-interactive agent cannot ask you a question. It
  will guess, and you will find out at review time.
- **Verify before you report.** Both skills end with the same rule: run `git status`, the
  build and the tests yourself. Agents report success optimistically. Unused imports,
  stubbed helpers, files in the wrong folder, and tests "fixed" by weakening them are all
  faster to repair yourself than to re-prompt.
- **Finish what the delegate abandons.** If it stops early or its quota dies mid-task,
  complete the remaining items rather than handing back a half-built tree.

## Requirements

- Node 18+
- Claude Code
- At least one delegate CLI. A missing one only disables that skill; the other still works.
  - `agy` — [Google Antigravity](https://antigravity.google)
  - `codex` — `npm i -g @openai/codex`

## Notes

- Installing never overwrites silently. If a skill of the same name already exists you are
  asked first, because a skill is prose you are meant to tune. `--force` skips the prompt,
  `--yes` answers everything yes.
- `CLAUDE_CONFIG_DIR` is respected if you set it; otherwise `~/.claude`.
- The skills are plain Markdown. Open them, edit the model defaults, keep the parts you
  like.

## License

MIT © Shaurya Ojha
