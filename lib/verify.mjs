/**
 * Check what a delegate actually did, rather than what it said it did.
 *
 * Every skill in this package ends with the same instruction — run the build
 * and the tests yourself, because agents report success optimistically. This
 * is that instruction as one command.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Commands are run through a shell so `npm run x` works on every platform. */
async function sh(command, cwd, timeout = 900_000) {
  try {
    const { stdout, stderr } = await run(command, {
      cwd, timeout, shell: true, windowsHide: true, maxBuffer: 32 * 1024 * 1024,
    });
    return { ok: true, output: (stdout || stderr || '').trim() };
  } catch (err) {
    // The command's own output is what diagnoses the failure; Node's "Command
    // failed: …" wrapper only repeats what the card already says.
    const streams = [err?.stderr, err?.stdout].filter(Boolean).join('\n').trim();
    const output = streams || (err?.message ?? '').trim();
    return { ok: false, output, timedOut: err?.killed === true };
  }
}

/**
 * Which checks does this project actually have?
 *
 * `.ccd/config.json` wins when it lists them, because no amount of sniffing
 * beats being told. Otherwise the npm scripts that exist are used, in the
 * order that fails fastest and cheapest.
 */
export async function detectChecks(cwd) {
  const configPath = join(cwd, '.ccd', 'config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(await readFile(configPath, 'utf8'));
      if (Array.isArray(config.verify) && config.verify.length) {
        return config.verify.map((v) =>
          typeof v === 'string' ? { name: v, command: v } : { name: v.name, command: v.command },
        );
      }
    } catch {
      // A broken config should not silently disable verification.
      return [{ name: 'config', command: null, error: 'unreadable .ccd/config.json' }];
    }
  }

  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return [];

  let scripts = {};
  try {
    scripts = JSON.parse(await readFile(pkgPath, 'utf8')).scripts ?? {};
  } catch {
    return [];
  }

  const wanted = [
    ['typecheck', ['typecheck', 'type-check', 'tsc']],
    ['lint', ['lint']],
    ['build', ['build']],
    ['tests', ['test', 'tests']],
  ];

  const checks = [];
  for (const [name, candidates] of wanted) {
    const script = candidates.find((s) => typeof scripts[s] === 'string');
    if (script) checks.push({ name, command: `npm run ${script} --silent` });
  }
  return checks;
}

/* Conservative on purpose: a false positive here trains people to ignore it. */
const SECRET_PATTERNS = [
  [/-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, 'private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
  [/\bghp_[A-Za-z0-9]{36}\b/, 'GitHub personal access token'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/\bsk-[A-Za-z0-9]{32,}\b/, 'API secret key'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key'],
];

/**
 * Scan only *added* lines, so a pre-existing value in the repo is not reported
 * as something this run introduced.
 */
export async function scanDiff(cwd) {
  const diff = await sh('git diff HEAD --unified=0', cwd, 60_000);
  if (!diff.ok) return { available: false, findings: [], files: 0 };

  const findings = [];
  const check = (file, text) => {
    for (const [pattern, label] of SECRET_PATTERNS) {
      if (pattern.test(text)) findings.push({ file, label });
    }
  };

  let file = null;
  for (const line of diff.output.split('\n')) {
    if (line.startsWith('+++ b/')) { file = line.slice(6); continue; }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    check(file, line);
  }

  // A brand-new file is invisible to `git diff HEAD`, and a new file is exactly
  // how an agent introduces a key — so untracked files are scanned whole.
  const untracked = await sh('git ls-files --others --exclude-standard', cwd, 60_000);
  const newFiles = untracked.ok && untracked.output
    ? untracked.output.split('\n').map((f) => f.trim()).filter(Boolean)
    : [];
  for (const f of newFiles) {
    try {
      const body = await readFile(join(cwd, f), 'utf8');
      check(f, body);
    } catch {
      // Binary or unreadable: nothing to scan, and not worth failing over.
    }
  }

  const stat = await sh('git diff HEAD --name-only', cwd, 60_000);
  const changed = stat.ok && stat.output ? stat.output.split('\n').filter(Boolean) : [];
  const files = new Set([...changed, ...newFiles]).size;
  // One line per file is enough; the same key repeated is still one problem.
  const seen = new Set();
  const unique = findings.filter((f) => {
    const k = `${f.file}:${f.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { available: true, findings: unique, files };
}

/**
 * Runs every detected check and stops at the first failure.
 *
 * Stopping early is deliberate: once typecheck is broken, the build and test
 * output is noise, and the delegate needs the first real error, not the tenth.
 */
export async function verify(cwd, { onStep } = {}) {
  const checks = await detectChecks(cwd);
  const diff = await scanDiff(cwd);
  const results = [];

  for (const check of checks) {
    if (!check.command) {
      results.push({ name: check.name, status: 'error', detail: check.error ?? 'no command' });
      break;
    }
    onStep?.(check.name);
    const r = await sh(check.command, cwd);
    results.push({
      name: check.name,
      status: r.ok ? 'passed' : r.timedOut ? 'timed out' : 'failed',
      command: check.command,
      output: r.ok ? '' : r.output.slice(-4000),
    });
    if (!r.ok) break;
  }

  const failed = results.find((r) => r.status !== 'passed');
  return {
    cwd,
    checks: results,
    skipped: checks.slice(results.length).map((c) => c.name),
    diff: { files: diff.files, available: diff.available },
    secrets: diff.findings,
    ok: !failed && diff.findings.length === 0,
    ranAnyCheck: results.length > 0,
  };
}
