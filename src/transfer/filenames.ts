import fs from 'node:fs';
import path from 'node:path';
import { sanitizeText } from '../core/sanitize.js';

/** Suffix of files still being received. They're renamed only once their hash matched. */
export const PART_SUFFIX = '.termdrop-part';

/**
 * Longest name we save, in UTF-8 bytes. File systems allow 255; this leaves room for
 * " (9999)" and PART_SUFFIX.
 */
export const MAX_NAME_BYTES = 200;

/** Names Windows reserves for devices – even with an extension ("con.txt"). */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(\..*)?$/i;
// characters Windows (and Finder, for ':') can't have in a name
const INVALID = /[<>:"|?*]/g;
// C0/C1 control characters, DEL – sanitizeText keeps tabs and newlines, a file name doesn't
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
// invisible characters that can disguise a name (zero-width, bidi marks, BOM)
const INVISIBLE = /[\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

function truncateBytes(text: string, max: number): string {
  if (Buffer.byteLength(text) <= max) return text;
  let out = '';
  let bytes = 0;
  for (const ch of text) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > max) break;
    out += ch;
    bytes += b;
  }
  return out;
}

/** "archive.tar.gz" → ["archive", ".tar.gz"], ".bashrc" → [".bashrc", ""] */
export function splitExt(name: string): [string, string] {
  const double = /(\.tar\.(?:gz|bz2|xz|zst))$/i.exec(name);
  if (double && double.index > 0) return [name.slice(0, double.index), double[1]!];
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return [name, ''];
  return [name.slice(0, dot), name.slice(dot)];
}

/**
 * Turns a file name from the network into one that is safe to save and to show: only the
 * last path component, no separators, `..`, control characters, escape sequences or leading
 * dashes, no device names, at most MAX_NAME_BYTES – and never empty (falls back to "file").
 * Whatever comes out stays inside the folder it's joined to.
 */
export function safeFileName(raw: unknown): string {
  if (typeof raw !== 'string') return 'file';
  let name = sanitizeText(raw.normalize('NFC'))
    .replace(CONTROL, '')
    .replace(INVISIBLE, '');
  // only the base name – whichever separator the sender's system uses
  const parts = name.split(/[/\\]+/).filter((p) => p.trim() !== '');
  name = parts[parts.length - 1] ?? '';
  name = name
    .replace(INVALID, '_')
    .replace(/\s+/g, ' ')
    .trim()
    // leading dashes look like options to command-line tools
    .replace(/^[-\s]+/, '')
    // Windows drops trailing dots and spaces, which would change the name behind our back
    .replace(/[.\s]+$/, '');
  if (!name || /^\.+$/.test(name)) return 'file';
  if (WINDOWS_RESERVED.test(name)) name = `_${name}`;

  if (Buffer.byteLength(name) > MAX_NAME_BYTES) {
    const [stem, ext] = splitExt(name);
    const keepExt = Buffer.byteLength(ext) <= 24 ? ext : '';
    name = truncateBytes(stem, MAX_NAME_BYTES - Buffer.byteLength(keepExt)).trimEnd() + keepExt;
    if (!splitExt(name)[0].replace(/^\.+/, '')) name = `file${keepExt}`;
  }
  return name;
}

/** "foto.jpg", 2 → "foto (2).jpg"; 0 is the name itself. */
export function numberedName(name: string, n: number): string {
  if (n === 0) return name;
  const [stem, ext] = splitExt(name);
  return `${stem} (${n})${ext}`;
}

/** Joins a cleaned name to the folder and makes sure it really stays in there. */
export function inside(dir: string, name: string): string {
  const full = path.join(dir, name);
  if (path.dirname(full) !== path.resolve(dir) || path.basename(full) !== name) {
    throw new Error(`Refusing to write outside the download folder: ${name}`);
  }
  return full;
}

const exists = (p: string) => {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
};

export interface Reserved {
  /** the open part file (created exclusively – never follows a symlink, never clobbers) */
  handle: fs.promises.FileHandle;
  partPath: string;
  /** the number the name got so far ("foto (2).jpg" → 2) */
  n: number;
}

/**
 * Creates `<name>.termdrop-part` in `dir` for an incoming file. Picks the first number at
 * which neither the final name nor its part file exists, and opens the part file with `wx`
 * (O_CREAT | O_EXCL): if anything – a file, a symlink – appears there meanwhile, the next
 * number is tried.
 */
export async function reservePart(dir: string, name: string, mode = 0o644): Promise<Reserved> {
  for (let n = 0; n < 10_000; n++) {
    const final = inside(dir, numberedName(name, n));
    if (exists(final)) continue;
    const partPath = final + PART_SUFFIX;
    try {
      const handle = await fs.promises.open(partPath, 'wx', mode);
      return { handle, partPath, n };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw err;
    }
  }
  throw new Error(`No free name for ${name}`);
}

/** File systems without hard links (FAT, exFAT, some network shares). */
const NO_LINKS = new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EINVAL', 'EMLINK']);

/**
 * Gives a verified part file its final name without ever overwriting anything: a hard link
 * fails if the name exists (atomically), and then the next number is tried. Returns the path.
 */
export async function finalizePart(dir: string, partPath: string, name: string, startN = 0): Promise<string> {
  for (let n = startN; n < 10_000; n++) {
    const final = inside(dir, numberedName(name, n));
    try {
      await fs.promises.link(partPath, final);
      await fs.promises.unlink(partPath);
      return final;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (code === 'EEXIST') continue;
      if (!NO_LINKS.has(code)) throw err;
      // no hard links here: check, then rename (the tiny gap between both is the best we can do)
      if (exists(final)) continue;
      await fs.promises.rename(partPath, final);
      return final;
    }
  }
  throw new Error(`No free name for ${name}`);
}

/** Removes a part file; it may already be gone. */
export async function removePart(partPath: string): Promise<void> {
  try {
    await fs.promises.unlink(partPath);
  } catch {
    // already gone
  }
}
