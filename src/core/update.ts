import { createUpdater } from 'termcore/app/update';
import { APP } from '../app.js';

export { compareVersions, requestRestart, restartRequested } from 'termcore/app/update';

/** Update check and install for termdrop (TERMDROP_NO_UPDATE_CHECK, _UPDATE_URL, _INSTALL_SPEC, _APP_DIR). */
export const {
  latestUrl,
  fetchLatestVersion,
  checkForUpdate,
  installKind,
  SOURCE_HINT,
  releaseSpec,
  appDir,
  localInstall,
  newerLocalInstall,
  installTarget,
  runInstall,
  installedVersion,
  staleInstallHint,
  installHint,
} = createUpdater(APP);
