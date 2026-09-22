---
name: delegate
description: Route a coding task to whichever delegate agent fits — Antigravity (`agy`) or OpenAI Codex (`codex`) — and run several of them at once. Use this whenever the user says "delegate this", "offload this", "give this to another agent", "kisi aur agent se karwa", "use both", "run them in parallel", "burn the quota", asks which agent should do a job, or wants a large build split across the agent CLIs they pay for. Also use it when one delegate dies on quota and the work has to move to another.
---

# delegate — one entry point for every agent you pay for

You are the parent process. `agy` and `codex` are child processes. You read the repo,
make the decisions, write the brief, and check the result; they do the typing.

This skill is the router. For the full flag reference of a single agent, read the
[agy](../agy/SKILL.md) or [codex](../codex/SKILL.md) skill — this one decides *which*,
*how many*, and *what to do when one dies*.

## First: who is actually available

```bash
npx claude-code-delegate doctor
```

Never assume a CLI is installed. A missing one is not an error — it just narrows the
choice. If none are available, say so and do the work yourself rather than stalling.

## Picking one

| the task | send it to | why |
|---|---|---|
| bulk scaffolding, many similar files, content authoring | `agy` (flash model) | cheapest per token, and the work is mechanical |
| algorithmic logic, tricky refactor, anything with a subtle invariant | `codex` (raise reasoning effort) | thinks harder before it types |
| a second opinion on a diff | `codex exec review --sandbox read-only` | reports, does not edit |
| anything touching auth, payments, migrations or deletes | nobody — do it yourself | the review cost exceeds the typing saved |

Two rules that override the table:
- If the user named an agent, use that agent. Do not re-litigate it.
- If they have said before that coding goes through one of these, keep using it until
  they say otherwise.

## Running several at once

This is the point of paying for more than one subscription. Independent work goes out in
parallel; each delegate gets its own task file, its own log, and its own working tree.

**Give each agent a worktree.** Two agents in one tree collide, and "do not touch `lib/**`"
in a task file is advisory — a worktree makes it structural, and the branch is what makes
the result reviewable.

```bash
npx claude-code-delegate worktree add backend    # → .ccd/worktrees/backend on ccd/backend
npx claude-code-delegate worktree add frontend
```

Then point each agent at its own tree:

```bash
# one Bash call per agent, each with run_in_background: true
bash ~/.claude/skills/codex/scripts/run_codex.sh task-backend.md  .ccd/worktrees/backend "" high
bash ~/.claude/skills/agy/scripts/run_agy.sh     task-frontend.md .ccd/worktrees/frontend
```

Review and merge one branch at a time:

```bash
git diff main..ccd/backend          # read it before it touches your tree
git merge ccd/backend
npx claude-code-delegate worktree remove backend
```

`worktree remove` refuses while there are uncommitted changes, so an unmerged agent's work
is not thrown away by a tidy-up. `worktree list` marks a dirty tree with `●`.

Still split the *work* sensibly, because a worktree stops collisions, not confusion:
- **By directory.** One agent owns `data/`, the other owns `lib/`.
- **By dependency.** If B needs A's function signature, put the signature in both task
  files, or run them in sequence.
- Shared files — a barrel `index.ts`, a router table, a global stylesheet — are yours.
  Each agent writes its own file; you wire them together.

See `references/parallel-split.md` for the full shape.

## When a delegate dies on quota

Expect it. It is the normal end state of a long run, not a crash.

1. Read the log to see how far it got, and `git status --short` to see what landed.
2. Write a **fresh** task file covering only the remainder. Do not re-send the original —
   the new agent will redo finished work and may undo it.
3. Send it to the other agent.
4. Tell the user you switched, and why.

If every delegate is exhausted, finish the remaining items yourself. Never hand back a
half-built tree because a subscription ran out.

## The rules that do not change with the agent

These hold for every delegate; the per-agent skills repeat them because they are the
difference between a useful run and a wasted hour.

- **Prompt in a file, never inline.** Backticks, `$`, quotes and heredocs in a multi-line
  prompt destroy shell quoting. Write the file, then `cat` it into the command.
  `npx claude-code-delegate task <slug>` scaffolds one.
- **The task file is the entire brief.** The delegate starts cold with none of your
  conversation. Absolute working dir, exact files to read first, numbered deliverables
  with acceptance criteria, an explicit "not your job", and a closing "summarise what you
  wrote and what you were unsure about".
- **Every decision made, none open.** A non-interactive agent cannot ask a question. It
  guesses, and you find out at review time.
- **Verify before you report.** `npx claude-code-delegate verify` runs the project's own
  typecheck, lint, build and tests, stops at the first failure, counts the changed files
  and scans added lines for committed secrets. Run it in the agent's worktree, not just
  your own tree. Agents report success optimistically; unused imports, stubbed helpers,
  files in the wrong folder and tests "fixed" by weakening them are all faster to repair
  yourself than to re-prompt. It exits non-zero when something fails, so it also works as
  a gate in a script.
- **Never let a delegate commit.** You read the diff first. It writes files; you decide
  what enters history.

## Reporting back

Say which agent did what, what you verified, and what you fixed by hand. The user is
paying for these subscriptions — they should be able to see where their quota went.
