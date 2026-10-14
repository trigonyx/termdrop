import os from 'node:os';
import path from 'node:path';

/**
 * Dropping files onto a terminal window "types" their paths. Terminal.app and iTerm2 escape
 * spaces and special characters with backslashes (`/Users/me/My\ File.pdf`), other terminals
 * quote them (`'/home/me/My File.pdf'`) or send `file://` URLs; several files are separated
 * by spaces. This turns such a paste back into paths – and tells it apart from ordinary text.
 */

const BRACKETS = /\u001b\[20[01]~/g;

/** Shell-like split: backslash escapes, '…' and "…" quotes, whitespace between words. */
export function splitShellWords(text: string): string[] | null {
  const words: string[] = [];
  let cur = '';
  let inWord = false;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote === "'") {
      if (ch === "'") quote = null;
      else cur += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === '\\' && i + 1 < text.length && '"\\$`'.includes(text[i + 1]!)) cur += text[++i];
      else cur += ch;
      continue;
    }
    if (ch === '\\' && i + 1 < text.length) {
      const next = text[++i]!;
      // backslash-newline is a line continuation, not part of a name
      if (next !== '\n') cur += next;
      inWord = true;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      inWord = true;
    } else if (/\s/.test(ch)) {
      if (inWord) words.push(cur);
      cur = '';
      inWord = false;
    } else {
      cur += ch;
      inWord = true;
    }
  }
  if (quote) return null; // an unclosed quote isn't something a terminal pastes
  if (inWord) words.push(cur);
  return words;
}

function fromFileUrl(word: string): string | null {
  if (!/^file:\/\//i.test(word)) return word;
  try {
    const url = new URL(word);
    if (url.host && url.host !== 'localhost') return null;
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}

const isAbsolute = (p: string, platform: string) =>
  platform === 'win32' ? /^(?:[a-zA-Z]:[\\/]|\\\\[^\\]+\\)/.test(p) : p.startsWith('/');

/** `~` and `~/…` → the home folder; everything else unchanged. */
export function expandHome(p: string, home = os.homedir()): string {
  if (p === '~') return home;
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(home, p.slice(2));
  return p;
}

/**
 * The paths in a paste, or `null` if it doesn't look like dropped files: every word has to be
 * an absolute path (after `~` and `file://` are resolved). "hello world" or "q" are not paths.
 */
export function parsePastedPaths(text: string, home = os.homedir(), platform = process.platform): string[] | null {
  const clean = text.replace(BRACKETS, '').replace(/\r\n?/g, '\n').trim();
  if (!clean) return null;
  // Windows paths are full of backslashes – there, only quotes group words
  const words = platform === 'win32' ? splitWindowsWords(clean) : splitShellWords(clean);
  if (!words?.length) return null;
  const out: string[] = [];
  for (const w of words) {
    const p = fromFileUrl(w);
    if (p === null) return null;
    const full = expandHome(p, home);
    if (!isAbsolute(full, platform)) return null;
    if (!out.includes(full)) out.push(full);
  }
  return out;
}

function splitWindowsWords(text: string): string[] | null {
  const words: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) words.push(m[1] ?? m[2]!);
  return words;
}

/**
 * Which files a paste means, checking them against the disk: the escaped/quoted reading
 * first; if that doesn't fit, the whole paste as one path (a terminal that pastes a single
 * path with plain spaces). `null` if neither names existing files.
 */
export function resolvePastedPaths(
  text: string,
  exists: (p: string) => boolean,
  home = os.homedir(),
  platform = process.platform,
): string[] | null {
  const parsed = parsePastedPaths(text, home, platform);
  if (parsed && parsed.every(exists)) return parsed;
  const whole = expandHome(text.replace(BRACKETS, '').trim(), home);
  if (whole && isAbsolute(whole, platform) && exists(whole)) return [whole];
  // some of the files exist: still a drop (the missing ones get reported)
  if (parsed && parsed.some(exists)) return parsed;
  return null;
}
