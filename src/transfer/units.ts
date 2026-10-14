/** 48213000 → "48.2 MB" (decimal units, like Finder). */
export function formatBytes(n: number): string {
  if (n < 1000) return `${n} B`;
  const units = ['kB', 'MB', 'GB', 'TB', 'PB'];
  let v = n;
  let i = -1;
  do {
    v /= 1000;
    i++;
  } while (v >= 999.95 && i < units.length - 1);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Bytes per second → "12.4 MB/s". */
export function formatSpeed(bps: number): string {
  return `${formatBytes(Math.round(bps))}/s`;
}

/**
 * Time left, rounded so it reads calmly: "<10s", "~25s" (5 s steps), "~3 min", "~1 h 20 min".
 */
export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '';
  if (seconds < 10) return '<10s';
  if (seconds < 60) return `~${Math.ceil(seconds / 5) * 5}s`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `~${h} h ${m} min` : `~${h} h`;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "foto.jpg" for one file, "3 files" for more. */
export function filesLabel(files: { name: string }[]): string {
  return files.length === 1 ? files[0]!.name : plural(files.length, 'file');
}
