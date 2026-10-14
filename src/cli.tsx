import path from 'node:path';
import { render } from 'ink';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { resolvePaths } from './core/paths.js';
import {
  fetchLatestVersion,
  compareVersions,
  installedVersion,
  installHint,
  installKind,
  newerLocalInstall,
  restartRequested,
  runInstall,
  SOURCE_HINT,
  staleInstallHint,
} from './core/update.js';
import { REPO_CONFIGURED, VERSION } from './core/version.js';
import { acquireLock, handOff, Inbox, startHandoffServer, type Lock } from './transfer/handoff.js';
import { inspectPaths } from './transfer/local.js';
import { plural } from './transfer/units.js';
import { Root } from './ui/App.js';
import { MOUSE_OFF, MOUSE_ON, MouseFilterStdin } from './ui/mouse.js';

const HELP = `termdrop – end-to-end encrypted file sharing with friends on your local network

Usage: termdrop [files…] [--to <name>] [options]
       termdrop update   Install the latest version from GitHub

  files…            Send these files (if termdrop is already open, they go to that window)
  --to <name>       Preselect this friend as the recipient
  --home <dir>      Data directory (default: ~/.termdrop, or $TERMDROP_HOME)
  --port <port>     TCP port (default: 5054, falls back if taken)
  --no-discovery    Don't search the network automatically
  --debug           Write a connection log to <home>/termdrop.log
  -h, --help        Show this help
  -v, --version     Show the version
`;

const ALT_SCREEN_ON = '\u001b[?1049h\u001b[H';
const ALT_SCREEN_OFF = '\u001b[?1049l';
const SHOW_CURSOR = '\u001b[?25h';

/** `termdrop update`: same as running INSTALL_CMD, with a version check first. */
async function update(): Promise<number> {
  if (installKind() === 'source') {
    process.stdout.write(`${SOURCE_HINT.replace(/`/g, '')}\n`);
    return 1;
  }
  if (!REPO_CONFIGURED) {
    process.stderr.write("This build doesn't know its GitHub repo yet (package.json → repository).\n");
    return 1;
  }
  process.stdout.write('Checking for updates …\n');
  const latest = await fetchLatestVersion();
  if (latest && compareVersions(latest, VERSION) <= 0) {
    process.stdout.write(`termdrop ${VERSION} is up to date.\n`);
    return 0;
  }
  process.stdout.write(latest ? `Updating termdrop ${VERSION} → ${latest} …\n` : `Couldn't check the latest version – installing anyway …\n`);
  const res = await runInstall({ inherit: true, version: latest });
  if (res.ok) {
    const installed = await installedVersion();
    if (installed && latest && compareVersions(installed, latest) < 0) {
      process.stderr.write(`\n${staleInstallHint(installed).replace(/`/g, '')}\n`);
      return 1;
    }
    process.stdout.write(`\nDone${installed ? ` – termdrop ${installed} is installed` : ''}. Start it with: termdrop\n`);
    return 0;
  }
  process.stderr.write(`\nUpdate failed. ${installHint(res.output) ?? 'See the npm output above.'}\n`);
  return 1;
}

async function main(): Promise<void> {
  let values;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        to: { type: 'string' },
        home: { type: 'string' },
        port: { type: 'string' },
        'no-discovery': { type: 'boolean' },
        debug: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
      strict: true,
    }));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${HELP}`);
    process.exit(2);
  }

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    process.stdout.write(`termdrop ${VERSION}\n`);
    return;
  }
  if (positionals[0] === 'update' && positionals.length === 1) {
    process.exit(await update());
  }
  let port: number | undefined;
  if (values.port !== undefined) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.stderr.write(`Invalid port: ${values.port}\n`);
      process.exit(2);
    }
  }

  const paths = resolvePaths(values.home);
  const files = positionals.map((p) => path.resolve(p));
  const to = values.to?.trim() || undefined;

  // already open in another window? Then the files go there, and this one is done.
  const reply = await handOff(paths.socket, { v: 1, paths: files, ...(to ? { to } : {}) });
  if (reply) {
    for (const r of reply.rejected) process.stderr.write(`Skipped ${r.reason}\n`);
    if (!files.length) process.stdout.write('termdrop is already open in another window.\n');
    else if (reply.added) process.stdout.write(`Added ${plural(reply.added, 'file')} to the open termdrop window.\n`);
    else process.stderr.write('Nothing to send.\n');
    process.exit(files.length && !reply.added ? 1 : 0);
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('termdrop needs an interactive terminal.\n');
    process.exit(1);
  }

  let lock: Lock;
  try {
    const got = await acquireLock(paths.lock, paths.socket);
    if (!('release' in got)) {
      process.stderr.write(`termdrop is already running with this data folder (pid ${got.holder.pid}), but it doesn't answer.\n`);
      process.exit(1);
    }
    lock = got;
  } catch (err) {
    process.stderr.write(`Couldn't start termdrop: ${(err as Error).message}\n`);
    process.exit(1);
  }

  const inbox = new Inbox();
  if (files.length) inbox.push(files, to);
  try {
    await startHandoffServer(paths.socket, (req) => {
      const { files: ok, rejected } = inspectPaths(req.paths);
      if (ok.length) inbox.push(req.paths, req.to);
      return { ok: true, added: ok.length, rejected };
    });
  } catch {
    // no handoff then – the app itself works without it
  }

  // full screen like vim/less – on exit the terminal is back to how it was
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    lock.release();
    process.stdout.write(MOUSE_OFF + SHOW_CURSOR + ALT_SCREEN_OFF);
  };
  // alternate scroll + focus reports + bracketed paste (drag & drop)
  process.stdout.write(ALT_SCREEN_ON + MOUSE_ON);
  process.on('exit', restore);
  const crash = (err: unknown) => {
    restore();
    process.stderr.write(`\ntermdrop crashed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exit(1);
  };
  process.on('uncaughtException', crash);
  process.on('unhandledRejection', crash);
  for (const sig of ['SIGTERM', 'SIGHUP'] as const) process.on(sig, () => process.exit(0));

  const app = render(
    <Root paths={paths} options={{ port, discovery: !values['no-discovery'], debug: values.debug }} inbox={inbox} />,
    { exitOnCtrlC: false, patchConsole: true, stdin: new MouseFilterStdin(process.stdin) as unknown as NodeJS.ReadStream },
  );
  app.waitUntilExit().then(
    () => {
      restore();
      if (!restartRequested()) process.exit(0);
      // after /update: start the freshly installed version in this terminal – and stop
      // reading the terminal here, so every keystroke goes to the new process
      process.stdin.removeAllListeners('data');
      process.stdin.pause();
      const child = spawn(process.execPath, process.argv.slice(1), { stdio: 'inherit' });
      child.on('exit', (code) => process.exit(code ?? 0));
      child.on('error', () => process.exit(0));
    },
    crash,
  );
}

/**
 * Updates without write access to npm's global folder land in ~/.termdrop/app. If a newer
 * copy is there, it runs instead of this one (with the same arguments).
 */
async function start(): Promise<void> {
  const local = installKind() === 'npm' ? newerLocalInstall(fileURLToPath(import.meta.url)) : null;
  if (local) {
    try {
      await import(pathToFileURL(local.cli).href);
      return;
    } catch (err) {
      process.stderr.write(`Couldn't start termdrop ${local.version} (${(err as Error).message}) – starting ${VERSION} instead.\n`);
    }
  }
  await main();
}

void start();
