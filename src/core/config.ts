import { readJson, writeJsonAtomic } from 'termcore/app/storage';
import type { Paths } from './paths.js';

/**
 * termdrop's own settings (config.json in ~/.termdrop). Name, notifications and the look are
 * shared by all apps and live in ~/.termhub.
 */
export interface Config {
  port?: number;
  /** Where received files are saved (default ~/Downloads, /folder changes it). */
  downloadDir?: string;
}

export function readConfig(paths: Paths): Config {
  const c = readJson<Record<string, unknown> | null>(paths.config, null) ?? {};
  return {
    ...(Number.isInteger(c.port) ? { port: c.port as number } : {}),
    ...(typeof c.downloadDir === 'string' && c.downloadDir ? { downloadDir: c.downloadDir } : {}),
  };
}

/** Changes some settings, keeps the rest (also fields older versions wrote, like `name`). */
export function writeConfig(paths: Paths, patch: Config): void {
  const raw = readJson<Record<string, unknown> | null>(paths.config, null) ?? {};
  writeJsonAtomic(paths.config, { ...raw, ...patch });
}
