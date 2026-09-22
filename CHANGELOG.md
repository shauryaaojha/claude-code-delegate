# Changelog

## 0.3.0

**`ccd worktree add|list|remove`** — an isolated git worktree per delegate, on its own
`ccd/<name>` branch. Two agents in one working tree collide, and "do not touch `lib/**`" in
a task file is advisory; a worktree makes it structural, and the branch is what makes the
result reviewable — you diff it, then merge it, instead of finding two agents' edits already
interleaved. `remove` refuses while a tree has uncommitted changes so a tidy-up cannot throw
away unmerged work, `list` marks a dirty tree, and re-adding a removed worktree reuses its
branch rather than losing the commits on it. `.ccd/` is added to `.git/info/exclude` — local
to your clone, so the repo's tracked `.gitignore` is never touched.

**`ccd verify`** — the instruction every skill in this package ends with, as one command.
Runs the project's own typecheck, lint, build and tests, stopping at the first failure
because once typecheck is broken the rest is noise. Reports changed-file count, tails the
failing command's output, and exits non-zero so it works as a gate in a script. `--json` for
CI. Checks are read from npm scripts, or from `.ccd/config.json` when you would rather say
exactly what to run:

```json
{ "verify": ["npm run build", "npm test"] }
```

It also scans for secrets in what the run *added* — including brand-new untracked files,
which is how an agent would actually introduce a key, and which `git diff` alone does not
see. Pre-existing values already in the repo are not reported, and the pattern list is
deliberately narrow, because a scanner that cries wolf gets ignored.

Considered and cut: a `.ccd/runs/` artifact store with `run new` / `run done` / `run list`.
It read well on paper, but `run new` only wrapped `ccd task` in a folder, `run done` was
`ccd verify` writing a JSON file, and nothing could record which agent had actually run
without being told — observability in name only, plus three subcommands and a state-file
format to maintain.

## 0.2.0

**`/delegate` — a third skill, and the reason for the release.** One entry point when you
do not want to name an agent. It routes by task shape (bulk scaffolding to the cheap fast
model, subtle logic to the one that thinks harder, anything touching auth, payments,
migrations or deletes to nobody), runs both delegates in parallel when the work splits
cleanly, and knows what to do when one dies on quota: write a fresh task file for the
remainder and move it, rather than re-sending the original and having finished work redone.
Ships with `references/parallel-split.md` — how to split a job by directory so two agents
cannot collide, and where the shared contract goes.

**`ccd task [name]`** scaffolds a task file from the template. The most repeated
instruction in these skills is "put the prompt in a file, never inline"; this is that file
in one command. It refuses to overwrite an existing file.

**`ccd update`** refreshes the skills you already have to the packaged version, and never
adds back one you deliberately removed — it names any new skills separately instead. If
your copy has drifted from what the package ships, it asks before replacing it, because a
skill is prose you are meant to tune. `-y` accepts, `--force` skips the question entirely,
and an unchanged skill is left alone rather than rewritten.

**`--project`** installs into `./.claude/skills` rather than your home directory, so the
skills travel with the repo and a team gets them on clone. Works with `install`, `update`,
`uninstall`, `list` and `doctor`.

**`doctor --json`** for CI and for an agent reading its own environment. The human-readable
output now also closes with what the available delegates actually let you do — nothing, one
agent, or both in parallel.

Considered and rejected: a `/gemini` skill. The Gemini CLI is installed widely, but Google
has moved individual-tier users to Antigravity, and a headless run on that tier now fails
with `IneligibleTierError`. A skill for it would have been broken on arrival, and `/agy`
already covers that account.

## 0.1.0

First release. `/agy` and `/codex`, and an installer that copies them into
`~/.claude/skills` without clobbering anything you have edited.
