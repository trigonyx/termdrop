export interface ParsedCommand {
  name: string;
  args: string[];
  /** Everything after the command name, unchanged (for free text like /name Max Power). */
  rest: string;
}

/**
 * Splits "/command arg1 "arg with spaces"". Never throws – not even on broken
 * quotes; those are simply taken literally.
 */
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  const match = /^\/(\S*)\s*([\s\S]*)$/.exec(trimmed);
  if (!match) return null;
  const name = (match[1] ?? '').toLowerCase();
  const rest = (match[2] ?? '').trim();
  return { name, args: tokenize(rest), rest };
}

export function tokenize(text: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let inToken = false;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inToken = true;
    } else if (/\s/.test(ch)) {
      if (inToken) args.push(current);
      current = '';
      inToken = false;
    } else {
      current += ch;
      inToken = true;
    }
  }
  if (inToken) args.push(current);
  return args;
}
