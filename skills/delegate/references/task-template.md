# Task for <agent> — <project / feature>

You are working in `<absolute project dir, forward slashes>`.

<!-- Everything the agent knows is in this file. It has none of your conversation. -->

## Read first, fully
1. `<spec or plan file>` — follow its decisions exactly.
2. `<existing code to match>` — keep the same conventions, row shapes and signatures.
3. `<config / build setup>` — so it does not invent a second way to do the same thing.

## Shared contract — do not change these
<!-- Only when another agent is working in parallel. Paste the same block in both files. -->
<types, function signatures, data shapes the other agent depends on>

## Deliver
### 1. <file or feature>
<what, where, exact names, acceptance criteria>

### 2. <file or feature>
…

## Not your job
- <files another agent owns, named explicitly: "do not touch lib/**">
- <e.g. Do not connect to any database; migrations are applied separately.>
- <e.g. Do not install packages. Do not run git.>

## Done means
- `<build cmd>` and `<test cmd>` pass; fix what you break until they do.
- End with a concise summary: files written, build/test results, and anything you were
  unsure about or had to guess.
