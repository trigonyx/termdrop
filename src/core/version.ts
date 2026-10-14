import { installCmd, installSpec, repoConfigured } from 'termcore/app/version';
import { APP } from '../app.js';

export const VERSION: string = APP.version;

/** "owner/repo", taken from package.json → repository (the single place that names the repo). */
export const REPO: string = APP.repo;

/** False until package.json names the real GitHub repo – no update checks or installs before that. */
export const REPO_CONFIGURED = repoConfigured(APP);

/** What npm installs: GitHub's tarball of main (see termcore/app/version). */
export const INSTALL_SPEC = installSpec(APP);

export const INSTALL_CMD = installCmd(APP);
