import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Runs an opener; arguments go as argv, never through a shell. Resolves false on failure. */
function run(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: 10_000 }, (err) => resolve(!err)).on('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

/** Opens a file with its default app (enter on a received file). */
export function openPath(p: string, platform = process.platform): Promise<boolean> {
  if (!fs.existsSync(p)) return Promise.resolve(false);
  if (platform === 'darwin') return run('open', [p]);
  if (platform === 'win32') return run('explorer', [p]);
  return run('xdg-open', [p]);
}

/** Shows a file in Finder / the file manager (o): selected on macOS and Windows, its folder on Linux. */
export function revealPath(p: string, platform = process.platform): Promise<boolean> {
  const target = fs.existsSync(p) ? p : path.dirname(p);
  if (!fs.existsSync(target)) return Promise.resolve(false);
  if (platform === 'darwin') return run('open', target === p ? ['-R', p] : [target]);
  if (platform === 'win32') return run('explorer', target === p ? [`/select,${p}`] : [target]);
  return run('xdg-open', [target === p ? path.dirname(p) : target]);
}
