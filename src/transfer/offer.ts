import { safeFileName } from './filenames.js';

/** A file as offered on the wire. */
export interface OfferFile {
  name: string;
  size: number;
}

/** Most files in one offer. */
export const MAX_FILES = 500;
/** Longest name accepted on the wire, in characters (it's cleaned and shortened afterwards). */
export const MAX_WIRE_NAME = 1024;
/** Largest offer in bytes (8 PiB – far beyond any disk, but exact as a JS number). */
export const MAX_TOTAL = Number.MAX_SAFE_INTEGER;

const isSize = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

/**
 * Validates the file list of an incoming offer: 1…MAX_FILES entries, sizes that are whole,
 * non-negative numbers adding up to `total`. Names are returned cleaned (see safeFileName),
 * so nothing after this ever sees a hostile one.
 */
export function parseOfferFiles(files: unknown, total: unknown): OfferFile[] | null {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) return null;
  if (!isSize(total) || total > MAX_TOTAL) return null;
  const out: OfferFile[] = [];
  let sum = 0;
  for (const f of files) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) return null;
    const { name, size } = f as Record<string, unknown>;
    if (typeof name !== 'string' || name.length > MAX_WIRE_NAME || !isSize(size)) return null;
    sum += size;
    if (sum > MAX_TOTAL) return null;
    out.push({ name: safeFileName(name), size });
  }
  return sum === total ? out : null;
}

export const totalSize = (files: { size: number }[]) => files.reduce((n, f) => n + f.size, 0);
