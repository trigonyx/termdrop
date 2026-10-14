import os from 'node:os';
import path from 'node:path';
import { basePaths, type BasePaths } from 'termcore/app/paths';

export { tildify } from 'termcore/app/paths';

/** termdrop's own files, next to the shared ones in `hub` (~/.termhub). */
export interface Paths extends BasePaths {
  /** transfers.jsonl: one line per finished transfer */
  transfers: string;
}

/**
 * `home` (--home) moves everything: the shared data into `<home>`, termdrop's own into
 * `<home>/termdrop`. Default: ~/.termhub and ~/.termdrop.
 */
export function resolvePaths(home?: string, env: NodeJS.ProcessEnv = process.env): Paths {
  const base = basePaths('termdrop', home, env);
  return { ...base, transfers: path.join(base.home, 'transfers.jsonl') };
}

/** Where received files go unless /folder says otherwise. */
export function defaultDownloadDir(): string {
  return path.join(os.homedir(), 'Downloads');
}
