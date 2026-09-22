#!/usr/bin/env node
/**
 * claude-code-delegate — install the delegation skills into Claude Code.
 *
 * A skill is just a folder of Markdown and scripts under ~/.claude/skills.
 * This copies them there, so the only thing the CLI has to get right is
 * never clobbering something the user wrote themselves.
 */
import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline/promises';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SKILLS_SRC = join(HERE, '..', 'skills');
const pkg = JSON.parse(await readFile(join(HERE, '..', 'package.json'), 'utf8'));

const c = {
  reset: '\u001b[0m', dim: '\u001b[2m', bold: '\u001b[1m',
  orange: '\u001b[38;5;173m', green: '\u001b[32m', red: '\u001b[31m', yellow: '\u001b[33m',
};
const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (supportsColor ? code + s + c.reset : s);
const ok = (s) => paint(c.green, s);
const bad = (s) => paint(c.red, s);
const dim = (s) => paint(c.dim, s);

const BANNER = `
 ${paint(c.orange, '╭───────────────────────────────────────────╮')}
 ${paint(c.orange, '│')}  ${paint(c.bold, 'claude-code-delegate')}                     ${paint(c.orange, '│')}
 ${paint(c.orange, '│')}  ${dim('hand the typing to another agent')}         ${paint(c.orange, '│')}
 ${paint(c.orange, '╰───────────────────────────────────────────╯')}`;

/** Where Claude Code looks for skills. CLAUDE_CONFIG_DIR wins if it is set. */
function skillsDir() {
  const base = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  return join(base, 'skills');
}

async function availableSkills() {
  const entries = await readdir(SKILLS_SRC, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
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
  return { positional, force: flags.has('--force') || flags.has('-f'), yes: flags.has('--yes') || flags.has('-y') };
}

async function confirm(question, assumeYes) {
  if (assumeYes || !process.stdin.isTTY) return assumeYes;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} ${dim('[y/N]')} `)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

async function install(args) {
  const { positional, force, yes } = parseArgs(args);
  const all = await availableSkills();
  const wanted = positional.length ? positional : all;
  const unknown = wanted.filter((w) => !all.includes(w));
  if (unknown.length) {
    console.error(bad(`unknown skill: ${unknown.join(', ')}`), dim(`(available: ${all.join(', ')})`));
    process.exitCode = 1;
    return;
  }

  const dest = skillsDir();
  await mkdir(dest, { recursive: true });
  console.log(BANNER);
  console.log(`\n installing into ${dim(dest)}\n`);

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

  console.log(`\n ${dim('Restart Claude Code (or run /skills) to pick them up, then type')} ${paint(c.bold, '/agy')} ${dim('or')} ${paint(c.bold, '/codex')}.`);
  console.log(` ${dim('Check the agent CLIs are ready with')} ${paint(c.bold, 'npx claude-code-delegate doctor')}\n`);
}

async function uninstall(args) {
  const { positional } = parseArgs(args);
  const all = await availableSkills();
  const wanted = positional.length ? positional : all;
  const dest = skillsDir();
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

async function list() {
  const dest = skillsDir();
  console.log(BANNER, '\n');
  for (const name of await availableSkills()) {
    const installed = existsSync(join(dest, name));
    const mark = installed ? ok('installed') : dim('not installed');
    console.log(` ${paint(c.bold, name.padEnd(8))} ${mark}`);
    const d = await describe(name);
    if (d) console.log(`   ${dim(d.slice(0, 150) + (d.length > 150 ? '…' : ''))}`);
  }
  console.log();
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

async function doctor() {
  console.log(BANNER, '\n');
  const dest = skillsDir();
  console.log(` skills directory  ${existsSync(dest) ? ok(dest) : dim(dest + ' (will be created)')}`);
  for (const name of await availableSkills()) {
    console.log(` skill ${name.padEnd(12)} ${existsSync(join(dest, name)) ? ok('installed') : dim('not installed')}`);
  }
  console.log();

  const checks = [
    ['agy', 'agy', ['--version'], 'https://antigravity.google'],
    ['codex', 'codex', ['--version'], 'npm i -g @openai/codex'],
  ];
  for (const [label, cmd, args, hint] of checks) {
    const r = await probe(cmd, args);
    if (r.found) console.log(` ${ok('✓')} ${label.padEnd(6)} ${dim(r.version)}`);
    else console.log(` ${bad('✗')} ${label.padEnd(6)} ${dim(r.reason)} — ${dim(hint)}`);
  }
  console.log(`\n ${dim('A missing CLI only disables that one skill; the other still works.')}\n`);
}

function help() {
  console.log(BANNER);
  console.log(`
 ${paint(c.bold, 'Usage')}
   npx claude-code-delegate <command> [skills…]

 ${paint(c.bold, 'Commands')}
   install [skill…]    copy the skills into ~/.claude/skills   ${dim('(default: all)')}
   uninstall [skill…]  remove them again
   list                what this package ships, and what is installed
   doctor              check the agent CLIs the skills drive
   help                this

 ${paint(c.bold, 'Flags')}
   -f, --force         replace an existing skill without asking
   -y, --yes           answer yes to every prompt

 ${paint(c.bold, 'Examples')}
   npx claude-code-delegate install
   npx claude-code-delegate install codex
   npx claude-code-delegate doctor

 ${dim('v' + pkg.version + ' · MIT · https://github.com/shauryaaojha/claude-code-delegate')}
`);
}

const [command = 'help', ...rest] = process.argv.slice(2);
const commands = { install, uninstall, list, doctor, help, '--help': help, '-h': help, '--version': () => console.log(pkg.version), '-v': () => console.log(pkg.version) };
const fn = commands[command];
if (!fn) {
  console.error(bad(`unknown command: ${command}`));
  help();
  process.exitCode = 1;
} else {
  await fn(rest);
}
