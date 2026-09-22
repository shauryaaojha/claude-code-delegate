/** Shared terminal styling. Colour is dropped when stdout is not a TTY. */
export const c = {
  reset: '\u001b[0m', dim: '\u001b[2m', bold: '\u001b[1m',
  orange: '\u001b[38;5;173m', green: '\u001b[32m', red: '\u001b[31m', yellow: '\u001b[33m',
};

const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;
export const paint = (code, s) => (supportsColor ? code + s + c.reset : s);
export const ok = (s) => paint(c.green, s);
export const bad = (s) => paint(c.red, s);
export const warn = (s) => paint(c.yellow, s);
export const dim = (s) => paint(c.dim, s);

export const BANNER = `
 ${paint(c.orange, '╭───────────────────────────────────────────╮')}
 ${paint(c.orange, '│')}  ${paint(c.bold, 'claude-code-delegate')}                     ${paint(c.orange, '│')}
 ${paint(c.orange, '│')}  ${dim('hand the typing to another agent')}         ${paint(c.orange, '│')}
 ${paint(c.orange, '╰───────────────────────────────────────────╯')}`;

/**
 * A boxed summary, sized to its widest row.
 *
 * Box drawing counts characters, not display width, so rows stay plain ASCII
 * plus the status glyph — a CJK or emoji label would misalign the border.
 */
export function card(title, rows) {
  const plain = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');
  const body = rows.map(([k, v]) => [k, v]);
  const width = Math.max(
    title.length,
    ...body.map(([k, v]) => k.length + plain(v).length + 3),
  );
  const line = (l, m, r) => l + '─'.repeat(width + 2) + r;

  const out = [line('╭', '', '╮')];
  out.push(`│ ${title.padEnd(width)} │`);
  out.push(line('├', '', '┤'));
  for (const [k, v] of body) {
    const pad = width - k.length - plain(v).length;
    out.push(`│ ${k}${' '.repeat(Math.max(1, pad))}${v} │`);
  }
  out.push(line('╰', '', '╯'));
  return out.map((l) => ' ' + l).join('\n');
}
