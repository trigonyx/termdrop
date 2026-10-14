import pkg from '../../package.json';

export const VERSION: string = pkg.version;

/** "owner/repo", taken from package.json → repository (the single place that names the repo). */
export const REPO: string = /github\.com[/:]([^/]+\/[^/.]+)/.exec(pkg.repository.url)?.[1] ?? 'OWNER/termdrop';

/** False until package.json names the real GitHub repo – no update checks or installs before that. */
export const REPO_CONFIGURED = !REPO.startsWith('OWNER/');

/**
 * What npm installs: GitHub's tarball of main (contains the committed dist/, needs no git).
 * Not `github:owner/repo` – npm 11 leaves a dangling symlink for global installs from git.
 */
export const INSTALL_SPEC = `https://github.com/${REPO}/tarball/main`;

export const INSTALL_CMD = `npm i -g ${INSTALL_SPEC}`;
