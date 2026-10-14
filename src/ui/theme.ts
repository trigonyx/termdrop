import chalk from 'chalk';

/** Central color palette – muted grays, one warm accent like Claude Code (same as termchat). */
export const theme = {
  accent: '#D97757',
  peer: '#7AA2F7',
  dim: '#8C8C8C',
  faint: '#5A5A5A',
  border: '#4E4E4E',
  success: '#8CC08A',
  error: '#E5737B',
  warning: '#E5C07B',
  code: '#C3A6E8',
};

export const c = {
  accent: chalk.hex(theme.accent),
  peer: chalk.hex(theme.peer),
  dim: chalk.hex(theme.dim),
  faint: chalk.hex(theme.faint),
  success: chalk.hex(theme.success),
  error: chalk.hex(theme.error),
  warning: chalk.hex(theme.warning),
  code: chalk.hex(theme.code),
  bold: chalk.bold,
  italic: chalk.italic,
};

export const icons = {
  pointer: '❯',
  online: '●',
  offline: '○',
  away: '◐',
  send: '▶',
  request: '◆',
  pending: '◷',
  joined: '✓',
  done: '✓',
  error: '✗',
  info: '·',
  star: '★',
  up: '↑',
  down: '↓',
  file: '▪',
};

/** Distinct, muted colors for people (picked by hashing the peer id). */
export const SENDER_COLORS = ['#7AA2F7', '#9ECE6A', '#E0AF68', '#BB9AF7', '#7DCFFF', '#F7768E', '#73DACA', '#FF9E64'];

export function senderHex(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SENDER_COLORS[h % SENDER_COLORS.length]!;
}

export function senderColor(id: string) {
  return chalk.hex(senderHex(id));
}
