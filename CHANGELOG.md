# Changelog

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
