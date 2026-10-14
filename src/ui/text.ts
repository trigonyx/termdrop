import chalk from 'chalk';
import wrapAnsi from 'wrap-ansi';
import { theme } from './theme.js';

/**
 * Tiny renderer for panels (/help, /stats, /whois): `### heading`, `- list`, `**bold**`,
 * `` `code` `` and `_dim_`. termdrop has no Markdown messages, so this is all it needs.
 */
function inline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, (_m, s: string) => chalk.hex(theme.accent)(s))
    .replace(/\*\*([^*]+)\*\*/g, (_m, s: string) => chalk.bold(s))
    .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:])/g, (_m, pre: string, s: string) => pre + chalk.hex(theme.dim)(s));
}

export function renderText(text: string, width: number): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const h = /^#{1,6}\s+(.*)$/.exec(raw);
    if (h) {
      out.push(chalk.bold(inline(h[1]!)));
      continue;
    }
    const li = /^(\s*)[-*]\s+(.*)$/.exec(raw);
    if (li) {
      const indent = li[1]!.length;
      const body = wrapAnsi(inline(li[2]!), Math.max(10, width - indent - 2), { hard: true }).split('\n');
      body.forEach((l, i) => out.push(' '.repeat(indent) + (i === 0 ? chalk.hex(theme.dim)('• ') : '  ') + l));
      continue;
    }
    if (!raw.trim()) {
      out.push('');
      continue;
    }
    out.push(...wrapAnsi(inline(raw), Math.max(10, width), { hard: true }).split('\n'));
  }
  return out;
}
