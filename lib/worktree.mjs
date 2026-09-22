/**
 * A worktree per delegate.
 *
 * Two agents editing one working tree collide, and no amount of "do not touch
 * lib/**" in a task file reliably prevents it. A worktree makes the separation
 * structural instead of advisory, and the branch is what makes the result
 * reviewable: you diff it, then merge it, rather than discovering two agents'
 * edits already interleaved.
 */
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const WORKTREES = '.ccd/worktrees';

async function git(args, cwd) {
  try {
    const { stdout } = await run('git', args, { cwd, timeout: 120_000, windowsHide: true });
    return { ok: true, output: stdout.trim() };
  } catch (err) {
    return { ok: false, output: (err?.stderr || err?.message || '').trim() };
  }
}

export const worktreePath = (cwd, name) => join(cwd, '.ccd', 'worktrees', name);

/**
 * Keep `.ccd/` out of the parent repo's `git status`.
 *
 * This goes in `.git/info/exclude` rather than `.gitignore`: it is local to the
 * clone, so it never shows up as a change in someone's repo or needs a commit
 * to take effect.
 */
async function excludeCcd(cwd) {
  const dirRes = await git(['rev-parse', '--git-common-dir'], cwd);
  if (!dirRes.ok) return;
  const gitDir = dirRes.output === '.git' ? join(cwd, '.git') : dirRes.output;
  const infoDir = join(gitDir, 'info');
  const excludeFile = join(infoDir, 'exclude');
  try {
    let current = '';
    try {
      current = await readFile(excludeFile, 'utf8');
    } catch {
      await mkdir(infoDir, { recursive: true });
    }
    if (/^\.ccd\/?$/m.test(current)) return;
    const prefix = current && !current.endsWith('\n') ? '\n' : '';
    await appendFile(excludeFile, `${prefix}# claude-code-delegate worktrees\n.ccd/\n`, 'utf8');
  } catch {
    // Cosmetic only — a noisy `git status` is not worth failing the command.
  }
}

export async function addWorktree(cwd, name) {
  if (!(await git(['rev-parse', '--git-dir'], cwd)).ok) {
    return { ok: false, error: 'not a git repository — worktrees need one' };
  }
  const path = worktreePath(cwd, name);
  if (existsSync(path)) return { ok: false, error: `already exists: ${path}` };
  await excludeCcd(cwd);

  // Reuse the branch if it is already there, so removing and re-adding a
  // worktree does not lose the commits on it.
  const branch = `ccd/${name}`;
  const exists = await git(['rev-parse', '--verify', branch], cwd);
  const r = await git(
    exists.ok ? ['worktree', 'add', path, branch] : ['worktree', 'add', '-b', branch, path],
    cwd,
  );
  if (!r.ok) return { ok: false, error: r.output };
  return { ok: true, path, branch, reusedBranch: exists.ok };
}

export async function listWorktrees(cwd) {
  const r = await git(['worktree', 'list', '--porcelain'], cwd);
  if (!r.ok) return [];
  const out = [];
  let current = {};
  for (const line of r.output.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) out.push(current);
      current = { path: line.slice(9) };
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7).replace('refs/heads/', '');
    } else if (line === 'detached') {
      current.branch = '(detached)';
    }
  }
  if (current.path) out.push(current);
  // Only ours — the user's own worktrees are none of this command's business.
  return out.filter((w) => w.branch?.startsWith('ccd/'));
}

/** Uncommitted work is the one thing removal must not silently discard. */
export async function worktreeDirty(path) {
  const r = await git(['status', '--porcelain'], path);
  return r.ok && r.output.length > 0;
}

export async function removeWorktree(cwd, name, { force = false } = {}) {
  const path = worktreePath(cwd, name);
  if (!existsSync(path)) return { ok: false, error: `no worktree at ${path}` };
  if (!force && (await worktreeDirty(path))) {
    return { ok: false, error: 'worktree has uncommitted changes — commit them, or pass --force' };
  }
  const args = ['worktree', 'remove', path];
  if (force) args.push('--force');
  const r = await git(args, cwd);
  return r.ok ? { ok: true, path } : { ok: false, error: r.output };
}
