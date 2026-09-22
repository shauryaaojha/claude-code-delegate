#!/usr/bin/env node
/**
 * claude-code-delegate — install the delegation skills into Claude Code.
 *
 * A skill is just a folder of Markdown and scripts under ~/.claude/skills.
 * This copies them there, so the only thing the CLI has to get right is
 * never clobbering something the user wrote themselves.
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { BANNER, bad, c, card, dim, ok, paint, warn } from '../lib/ui.mjs';
import { verify as runVerify } from '../lib/verify.mjs';
import { addWorktree, listWorktrees, removeWorktree, worktreeDirty } from '../lib/worktree.mjs';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SKILLS_SRC = join(HERE, '..', 'skills');
const pkg = JSON.parse(await readFile(join(HERE, '..', 'package.json'), 'utf8'));

/**
 * Where Claude Code looks for skills.
 *
 * `--project` targets `./.claude/skills`, which travels with the repo, so a
 * team gets the skills on clone instead of each person installing them.
 * Otherwise it is the user-level directory, with CLAUDE_CONFIG_DIR winning
 * when it is set.
 */
function skillsDir(project = false) {
  if (project) return join(process.cwd(), '.claude', 'skills');
  const base = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  return join(base, 'skills');
}

async function availableSkills() {
  const entries = await readdir(SKILLS_SRC, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

/** The one-line description from a SKILL.md front-matter block. */
async function describe(name) {
  try {
    const md = await readFile(join(SKILLS_SRC, name, 'SKILL.md'), 'utf8');
    const m = md.match(/^description:\s*(.+)$/m);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('-')));
  const positional = argv.filter((a) => !a.startsWith('-'));
  return {
    positional,
    force: flags.has('--force') || flags.has('-f'),
    yes: flags.has('--yes') || flags.has('-y'),
    project: flags.has('--project') || flags.has('-p'),
    json: flags.has('--json'),
  };
}

async function confirm(question, assumeYes) {
  if (assumeYes || !process.stdin.isTTY) return assumeYes;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} ${dim('[y/N]')} `)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

function resolveNames(wanted, all) {
  const unknown = wanted.filter((w) => !all.includes(w));
  if (unknown.length) {
    console.error(bad(`unknown skill: ${unknown.join(', ')}`), dim(`(available: ${all.join(', ')})`));
    process.exitCode = 1;
    return null;
  }
  return wanted.length ? wanted : all;
}

async function install(args) {
  const { positional, force, yes, project } = parseArgs(args);
  const all = await availableSkills();
  const wanted = resolveNames(positional, all);
  if (!wanted) return;

  const dest = skillsDir(project);
  await mkdir(dest, { recursive: true });
  console.log(BANNER);
  console.log(`\n installing into ${dim(dest)}${project ? dim('  (this repo)') : ''}\n`);

  for (const name of wanted) {
    const target = join(dest, name);
    if (existsSync(target) && !force) {
      // Never overwrite silently: a user may have edited the skill, and a
      // skill is prose they are meant to tune.
      const replace = await confirm(` ${paint(c.yellow, '!')} ${name} already exists. Replace it?`, yes);
      if (!replace) {
        console.log(`   ${dim('skipped')} ${name}\n`);
        continue;
      }
      await rm(target, { recursive: true, force: true });
    } else if (existsSync(target)) {
      await rm(target, { recursive: true, force: true });
    }
    await cp(join(SKILLS_SRC, name), target, { recursive: true });
    console.log(` ${ok('✓')} ${paint(c.bold, name)}  ${dim(await describe(name))}`.slice(0, 160));
  }

  console.log(`\n ${dim('Restart Claude Code (or run /skills) to pick them up, then type')} ${paint(c.bold, '/delegate')}${dim(',')} ${paint(c.bold, '/agy')} ${dim('or')} ${paint(c.bold, '/codex')}.`);
  console.log(` ${dim('Check the agent CLIs are ready with')} ${paint(c.bold, 'npx claude-code-delegate doctor')}\n`);
}

/** Has the installed copy drifted from what this version ships? */
async function isEdited(name, target) {
  const src = join(SKILLS_SRC, name);
  const walk = async (dir, base = '') => {
    const out = new Map();
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) for (const [k, v] of await walk(join(dir, e.name), rel)) out.set(k, v);
      else out.set(rel, await readFile(join(dir, e.name), 'utf8'));
    }
    return out;
  };
  try {
    const [a, b] = await Promise.all([walk(src), walk(target)]);
    if (a.size !== b.size) return true;
    for (const [k, v] of a) if (b.get(k) !== v) return true;
    return false;
  } catch {
    return true; // Unreadable means "cannot prove it is unchanged" — ask.
  }
}

/**
 * Refresh whatever is already installed, and nothing else.
 *
 * The difference from `install --force`: update never adds a skill you chose
 * not to have. It brings the ones you use up to the packaged version.
 *
 * A skill is prose you are meant to tune, so an edited one is never replaced
 * without asking — the same promise install makes.
 */
async function update(args) {
  const { project, yes, force } = parseArgs(args);
  const all = await availableSkills();
  const dest = skillsDir(project);
  console.log(BANNER, '\n');

  const installed = all.filter((name) => existsSync(join(dest, name)));
  if (!installed.length) {
    console.log(` ${dim('nothing installed in')} ${dest}`);
    console.log(` ${dim('run')} ${paint(c.bold, 'npx claude-code-delegate install')} ${dim('first')}\n`);
    return;
  }

  let changed = 0;
  for (const name of installed) {
    const target = join(dest, name);
    if (!(await isEdited(name, target))) {
      console.log(` ${dim('=')} ${name} ${dim('already at v' + pkg.version)}`);
      continue;
    }
    if (!force) {
      const go = await confirm(
        ` ${paint(c.yellow, '!')} ${name} differs from the packaged version. Replace your copy?`,
        yes,
      );
      if (!go) {
        console.log(`   ${dim('kept your')} ${name}\n`);
        continue;
      }
    }
    await rm(target, { recursive: true, force: true });
    await cp(join(SKILLS_SRC, name), target, { recursive: true });
    console.log(` ${ok('✓')} ${paint(c.bold, name)} ${dim('updated to v' + pkg.version)}`);
    changed += 1;
  }
  if (!changed) console.log(`\n ${dim('nothing to change')}`);

  const missing = all.filter((name) => !installed.includes(name));
  if (missing.length) {
    console.log(`\n ${dim('not installed (this version also ships:')} ${missing.join(', ')}${dim('):')}`);
    console.log(` ${dim('add them with')} ${paint(c.bold, 'npx claude-code-delegate install ' + missing.join(' '))}`);
  }
  console.log();
}

async function uninstall(args) {
  const { positional, project } = parseArgs(args);
  const all = await availableSkills();
  const wanted = resolveNames(positional, all);
  if (!wanted) return;
  const dest = skillsDir(project);
  for (const name of wanted) {
    const target = join(dest, name);
    if (existsSync(target)) {
      await rm(target, { recursive: true, force: true });
      console.log(` ${ok('✓')} removed ${name}`);
    } else {
      console.log(` ${dim('not installed:')} ${name}`);
    }
  }
}

async function list(args) {
  const { project } = parseArgs(args);
  const dest = skillsDir(project);
  console.log(BANNER, '\n');
  for (const name of await availableSkills()) {
    const installed = existsSync(join(dest, name));
    const mark = installed ? ok('installed') : dim('not installed');
    console.log(` ${paint(c.bold, name.padEnd(10))} ${mark}`);
    const d = await describe(name);
    if (d) console.log(`   ${dim(d.slice(0, 150) + (d.length > 150 ? '…' : ''))}`);
  }
  console.log();
}

/**
 * Write a task file from the template.
 *
 * The single most repeated instruction in these skills is "put the prompt in a
 * file, never inline". This is that file, one command instead of a copy-paste.
 */
async function task(args) {
  const { positional } = parseArgs(args);
  const slug = (positional[0] || 'task').replace(/[^a-zA-Z0-9._-]/g, '-');
  const target = resolve(process.cwd(), slug.endsWith('.md') ? slug : `${slug}.md`);

  if (existsSync(target)) {
    console.error(bad(`refusing to overwrite ${relative(process.cwd(), target)}`));
    process.exitCode = 1;
    return;
  }

  // The delegate skill carries the fullest template (it has the shared-contract
  // block the per-agent ones leave out).
  const template = await readFile(join(SKILLS_SRC, 'delegate', 'references', 'task-template.md'), 'utf8');
  await writeFile(target, template.replace('<project / feature>', slug.replace(/\.md$/, '')), 'utf8');

  console.log(` ${ok('✓')} ${relative(process.cwd(), target)}`);
  console.log(`\n ${dim('Fill it in, then hand it over:')}`);
  console.log(`   ${dim('bash ~/.claude/skills/codex/scripts/run_codex.sh')} ${paint(c.bold, relative(process.cwd(), target))} ${dim('"' + process.cwd() + '"')}\n`);
}

/* ------------------------------------------------------------ verifying */

function renderVerify(result) {
  const glyph = (s) => (s === 'passed' ? ok('✓') : s === 'failed' ? bad('✗') : warn('!'));
  const rows = result.checks.map((r) => [r.name, `${glyph(r.status)} ${r.status}`]);
  for (const name of result.skipped) rows.push([name, dim('– skipped')]);
  if (result.diff.available) rows.push(['diff', dim(`${result.diff.files} file${result.diff.files === 1 ? '' : 's'}`)]);
  rows.push(['secrets', result.secrets.length ? bad(`✗ ${result.secrets.length}`) : ok('✓ clean')]);
  return rows;
}

async function verifyCmd(args) {
  const { json } = parseArgs(args);
  const cwd = process.cwd();

  if (!json) console.log(BANNER, '\n');
  const result = await runVerify(cwd, {
    onStep: (name) => {
      // Overwrite in place, padded so a longer previous name leaves no tail.
      if (!json && process.stdout.isTTY) process.stdout.write(` ${dim('running ' + name + '…')}`.padEnd(40) + '\r');
    },
  });
  if (!json && process.stdout.isTTY) process.stdout.write(' '.repeat(40) + '\r');

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (!result.ranAnyCheck) {
    console.log(` ${warn('!')} no checks found`);
    console.log(`\n ${dim('Add npm scripts (typecheck / lint / build / test), or list commands in')} ${paint(c.bold, '.ccd/config.json')}${dim(':')}`);
    console.log(`   ${dim('{ "verify": ["npm run build", "npm test"] }')}\n`);
  } else {
    console.log(card('VERIFY', renderVerify(result)));
    const failed = result.checks.find((r) => r.status !== 'passed');
    if (failed?.output) {
      console.log(`\n ${bad(failed.name + ' output')} ${dim('(tail)')}\n`);
      console.log(failed.output.split('\n').slice(-25).map((l) => '   ' + l).join('\n'));
    }
    for (const s of result.secrets) {
      console.log(`\n ${bad('possible ' + s.label)} in ${s.file}`);
    }
    console.log();
  }

  if (!result.ok) process.exitCode = 1;
  return result;
}

/* ----------------------------------------------------------- worktrees */

async function worktreeCmd(args) {
  const { positional, force, json } = parseArgs(args);
  const [sub = 'list', name] = positional;
  const cwd = process.cwd();

  if (sub === 'add') {
    if (!name) {
      console.error(bad('usage: ccd worktree add <name>'));
      process.exitCode = 1;
      return;
    }
    const r = await addWorktree(cwd, name);
    if (!r.ok) {
      console.error(bad(r.error));
      process.exitCode = 1;
      return;
    }
    if (json) return console.log(JSON.stringify(r, null, 2));
    console.log(` ${ok('✓')} ${relative(cwd, r.path)} ${dim('on ' + r.branch + (r.reusedBranch ? ' (existing branch)' : ''))}`);
    console.log(`\n ${dim('Point the delegate at it, then review the branch before merging:')}`);
    console.log(`   ${dim('git diff main..' + r.branch)}\n`);
    return;
  }

  if (sub === 'remove') {
    if (!name) {
      console.error(bad('usage: ccd worktree remove <name>'));
      process.exitCode = 1;
      return;
    }
    const r = await removeWorktree(cwd, name, { force });
    if (!r.ok) {
      console.error(bad(r.error));
      process.exitCode = 1;
      return;
    }
    console.log(` ${ok('✓')} removed ${relative(cwd, r.path)}`);
    return;
  }

  if (sub === 'list') {
    const trees = await listWorktrees(cwd);
    if (json) return console.log(JSON.stringify(trees, null, 2));
    console.log(BANNER, '\n');
    if (!trees.length) {
      console.log(` ${dim('no delegate worktrees — create one with')} ${paint(c.bold, 'ccd worktree add <name>')}\n`);
      return;
    }
    for (const t of trees) {
      const dirty = await worktreeDirty(t.path);
      console.log(` ${dirty ? warn('●') : ok('○')} ${paint(c.bold, (t.branch ?? '?').padEnd(22))} ${dim(relative(cwd, t.path) || '.')}${dirty ? warn('  uncommitted') : ''}`);
    }
    console.log();
    return;
  }

  console.error(bad(`unknown: ccd worktree ${sub}`), dim('(add | list | remove)'));
  process.exitCode = 1;
}

/**
 * Is the agent CLI these skills drive actually usable on this machine?
 *
 * On Windows npm installs a `.cmd` shim rather than an executable. Node will
 * not spawn one directly (it refuses since the 2024 argument-injection fix),
 * so the probe goes through the command interpreter there. Every argument is
 * a literal defined in this file — nothing user-supplied reaches the shell.
 */
async function probe(cmd, versionArgs) {
  const win = process.platform === 'win32';
  const file = win ? (process.env.ComSpec || 'cmd.exe') : cmd;
  const args = win ? ['/d', '/s', '/c', cmd, ...versionArgs] : versionArgs;
  try {
    const { stdout, stderr } = await run(file, args, { timeout: 20_000, windowsHide: true });
    const line = (stdout || stderr).trim().split('\n')[0];
    return { found: true, version: line };
  } catch (err) {
    const message = (err?.stderr || err?.message || 'failed').split('\n')[0];
    const missing = err?.code === 'ENOENT' || /not recognized|not found/i.test(message);
    return { found: false, reason: missing ? 'not on PATH' : message };
  }
}

const AGENTS = [
  ['agy', 'agy', ['--version'], 'https://antigravity.google'],
  ['codex', 'codex', ['--version'], 'npm i -g @openai/codex'],
];

async function doctor(args) {
  const { project, json } = parseArgs(args);
  const dest = skillsDir(project);
  const all = await availableSkills();
  const probes = await Promise.all(AGENTS.map(([, cmd, a]) => probe(cmd, a)));

  if (json) {
    // For CI, and for an agent reading its own environment.
    console.log(JSON.stringify({
      version: pkg.version,
      skillsDir: dest,
      skills: Object.fromEntries(all.map((n) => [n, existsSync(join(dest, n))])),
      agents: Object.fromEntries(AGENTS.map(([label], i) => [label, probes[i]])),
    }, null, 2));
    return;
  }

  console.log(BANNER, '\n');
  console.log(` skills directory  ${existsSync(dest) ? ok(dest) : dim(dest + ' (will be created)')}`);
  for (const name of all) {
    console.log(` skill ${name.padEnd(12)} ${existsSync(join(dest, name)) ? ok('installed') : dim('not installed')}`);
  }
  console.log();

  AGENTS.forEach(([label, , , hint], i) => {
    const r = probes[i];
    if (r.found) console.log(` ${ok('✓')} ${label.padEnd(6)} ${dim(r.version)}`);
    else console.log(` ${bad('✗')} ${label.padEnd(6)} ${dim(r.reason)} — ${dim(hint)}`);
  });

  const live = probes.filter((r) => r.found).length;
  console.log(`\n ${dim(live === 0
    ? 'No delegate available — the skills will tell Claude to do the work itself.'
    : live === 1
      ? 'One delegate available. A missing CLI only disables that one skill.'
      : 'Both delegates available — /delegate can run them in parallel.')}\n`);
}

function help() {
  console.log(BANNER);
  console.log(`
 ${paint(c.bold, 'Usage')}
   npx claude-code-delegate <command> [skills…]

 ${paint(c.bold, 'Commands')}
   install [skill…]    copy the skills into ~/.claude/skills   ${dim('(default: all)')}
   update              refresh the skills you already have
   uninstall [skill…]  remove them again
   task [name]         scaffold a task file from the template
   verify              run this project's checks and report what really passed
   worktree <cmd>      ${dim('add | list | remove')} — an isolated tree per agent
   list                what this package ships, and what is installed
   doctor              check the agent CLIs the skills drive
   help                this

 ${paint(c.bold, 'Flags')}
   -p, --project       target ./.claude/skills instead of your home dir
   -f, --force         replace an existing skill without asking
   -y, --yes           answer yes to every prompt
       --json          machine-readable output ${dim('(doctor, verify, worktree)')}

 ${paint(c.bold, 'Examples')}
   npx claude-code-delegate install
   npx claude-code-delegate install --project      ${dim('# commit them with the repo')}
   npx claude-code-delegate task refactor-auth
   npx claude-code-delegate worktree add backend   ${dim('# then point an agent at it')}
   npx claude-code-delegate verify

 ${dim('v' + pkg.version + ' · MIT · https://github.com/shauryaaojha/claude-code-delegate')}
`);
}

const [command = 'help', ...rest] = process.argv.slice(2);
const commands = {
  install, update, uninstall, task, list, doctor, help,
  verify: verifyCmd, worktree: worktreeCmd,
  '--help': help, '-h': help,
  '--version': () => console.log(pkg.version), '-v': () => console.log(pkg.version),
};
const fn = commands[command];
if (!fn) {
  console.error(bad(`unknown command: ${command}`));
  help();
  process.exitCode = 1;
} else {
  await fn(rest);
}
