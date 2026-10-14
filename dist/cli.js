#!/usr/bin/env node

// src/cli.tsx
import fs19 from "fs";
import path21 from "path";
import { render } from "ink";
import { spawn as spawn2 } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import { parseArgs } from "util";

// src/core/paths.ts
import os3 from "os";
import path3 from "path";

// ../termcore/src/app/paths.ts
import crypto from "crypto";
import os2 from "os";
import path2 from "path";

// ../termcore/src/app/suite.ts
import os from "os";
import path from "path";
var SUITE = {
  termchat: { name: "termchat", tcpPort: 5050, udpPort: 5051, envPrefix: "TERMCHAT" },
  keyrace: { name: "keyrace", tcpPort: 5052, udpPort: 5053, envPrefix: "KEYRACE" },
  termdrop: { name: "termdrop", tcpPort: 5054, udpPort: 5055, envPrefix: "TERMDROP" },
  termhub: { name: "termhub", tcpPort: 5056, udpPort: 5057, envPrefix: "TERMHUB" }
};
var LEGACY_APPS = ["termchat", "keyrace", "termdrop"];
var isSuiteApp = (v) => typeof v === "string" && Object.hasOwn(SUITE, v);
function defineApp(name, pkg, protocol = `${name}/1`) {
  const repo = /github\.com[/:]([^/]+\/[^/.]+)/.exec(pkg.repository.url)?.[1] ?? `OWNER/${name}`;
  return { ...SUITE[name], protocol, version: pkg.version, repo };
}
function resolveHomes(app, home, env = process.env) {
  const hubOverride = home ?? env.TERMHUB_HOME;
  const hub = path.resolve(hubOverride ?? path.join(os.homedir(), ".termhub"));
  const appOverride = home ? void 0 : env[`${SUITE[app].envPrefix}_HOME`];
  const appDir2 = path.resolve(appOverride ?? (hubOverride ? path.join(hub, app) : path.join(os.homedir(), `.${app}`)));
  return { hub, app: app === "termhub" ? hub : appDir2 };
}
function legacyDirs(home, env = process.env) {
  return Object.fromEntries(LEGACY_APPS.map((a) => [a, resolveHomes(a, home, env).app]));
}

// ../termcore/src/app/paths.ts
function hubPaths(dir, legacy) {
  return {
    dir,
    identity: path2.join(dir, "identity.json"),
    profile: path2.join(dir, "profile.json"),
    friends: path2.join(dir, "friends.json"),
    peers: path2.join(dir, "peers.json"),
    settings: path2.join(dir, "settings.json"),
    links: path2.join(dir, "links.json"),
    migration: path2.join(dir, "migration.json"),
    runDir: path2.join(dir, "run"),
    legacyDir: path2.join(dir, "legacy"),
    locksDir: path2.join(dir, ".locks"),
    legacy
  };
}
var MAX_SOCKET_PATH = 100;
function socketPath(root, app, platform = process.platform) {
  const tag = crypto.createHash("sha256").update(root).digest("hex").slice(0, 12);
  if (platform === "win32") return `\\\\.\\pipe\\${app}-${tag}`;
  const inHome = path2.join(root, `${app}.sock`);
  return Buffer.byteLength(inHome) <= MAX_SOCKET_PATH ? inHome : path2.join(os2.tmpdir(), `${app}-${tag}.sock`);
}
function basePaths(app, home, env = process.env) {
  const homes = resolveHomes(app, home, env);
  return {
    home: homes.app,
    hub: hubPaths(homes.hub, legacyDirs(home, env)),
    config: path2.join(homes.app, "config.json"),
    log: path2.join(homes.app, `${app}.log`),
    lock: path2.join(homes.app, `${app}.lock`),
    socket: socketPath(homes.app, app)
  };
}
function tildify(p) {
  const home = os2.homedir();
  return p === home ? "~" : p.startsWith(home + path2.sep) ? `~${p.slice(home.length)}` : p;
}

// src/core/paths.ts
function resolvePaths(home, env = process.env) {
  const base = basePaths("termdrop", home, env);
  return { ...base, transfers: path3.join(base.home, "transfers.jsonl") };
}
function defaultDownloadDir() {
  return path3.join(os3.homedir(), "Downloads");
}

// ../termcore/src/app/update.ts
import { execFile, spawn } from "child_process";
import fs from "fs";
import os4 from "os";
import path4 from "path";

// ../termcore/src/app/version.ts
var repoConfigured = (app) => !app.repo.startsWith("OWNER/");
var installSpec = (app) => `https://github.com/${app.repo}/tarball/main`;
var installCmd = (app) => `npm i -g ${installSpec(app)}`;

// ../termcore/src/app/update.ts
var VERSION_RE = /^\d+\.\d+\.\d+$/;
var PERMISSION_RE = /EACCES|EPERM|permission denied/i;
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
var realpath = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path4.resolve(p);
  }
};
var isRoot = () => process.getuid?.() === 0;
var restart = false;
var requestRestart = () => void (restart = true);
var restartRequested = () => restart;
function createUpdater(app) {
  const { name, envPrefix: P } = app;
  const env = (key) => process.env[`${P}_${key}`];
  const VERSION2 = app.version;
  const INSTALL_SPEC2 = installSpec(app);
  const INSTALL_CMD2 = installCmd(app);
  const REPO_CONFIGURED2 = repoConfigured(app);
  const latestUrl2 = () => env("UPDATE_URL") || `https://raw.githubusercontent.com/${app.repo}/main/package.json`;
  async function fetchLatestVersion2(fetchImpl = fetch, timeoutMs = 5e3) {
    if (!REPO_CONFIGURED2 && !env("UPDATE_URL")) return null;
    try {
      const res = await fetchImpl(latestUrl2(), { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) return null;
      const version = (await res.json())?.version;
      return typeof version === "string" && VERSION_RE.test(version) ? version : null;
    } catch {
      return null;
    }
  }
  async function checkForUpdate2(fetchImpl) {
    if (env("NO_UPDATE_CHECK") === "1") return null;
    const latest = await fetchLatestVersion2(fetchImpl);
    return latest && compareVersions(latest, VERSION2) > 0 ? latest : null;
  }
  function installKind2(script = process.argv[1] ?? "") {
    let real = script;
    try {
      real = fs.realpathSync(script);
    } catch {
    }
    return real.split(path4.sep).join("/").includes(`/node_modules/${name}/`) ? "npm" : "source";
  }
  const SOURCE_HINT2 = `This ${name} runs from a source folder, so it doesn't update itself.
Update it there with \`git pull && npm install\`, or install the release with \`${INSTALL_CMD2}\`.`;
  const releaseSpec2 = (version) => `https://github.com/${app.repo}/tarball/v${version}`;
  const appDir2 = () => env("APP_DIR") || path4.join(os4.homedir(), `.${name}`, "app");
  const specFor = (version) => env("INSTALL_SPEC") || (version ? releaseSpec2(version) : INSTALL_SPEC2);
  function localInstall2(dir = appDir2()) {
    const root = path4.join(dir, "node_modules", name);
    try {
      const pkg = JSON.parse(fs.readFileSync(path4.join(root, "package.json"), "utf8"));
      const cli = path4.join(root, "dist", "cli.js");
      if (pkg?.name !== name || typeof pkg.version !== "string" || !VERSION_RE.test(pkg.version)) return null;
      return fs.existsSync(cli) ? { version: pkg.version, cli } : null;
    } catch {
      return null;
    }
  }
  function newerLocalInstall2(self, ownVersion = VERSION2) {
    const local = localInstall2();
    if (!local || compareVersions(local.version, ownVersion) <= 0) return null;
    return realpath(local.cli) === realpath(self) ? null : local;
  }
  function installedInto(script) {
    let dir = path4.dirname(realpath(script));
    while (path4.dirname(dir) !== dir) {
      if (path4.basename(dir) === name && path4.basename(path4.dirname(dir)) === "node_modules") return path4.dirname(dir);
      dir = path4.dirname(dir);
    }
    return null;
  }
  function installTarget2(script = process.argv[1] ?? "", root = isRoot()) {
    const modules = installedInto(script);
    if (!modules) return "global";
    if (realpath(modules).startsWith(realpath(appDir2()) + path4.sep)) return "local";
    if (root) return "global";
    try {
      fs.accessSync(modules, fs.constants.W_OK);
      return "global";
    } catch {
      return "local";
    }
  }
  function npmInstall(spec, inherit, target) {
    const dir = appDir2();
    const args = target === "global" ? ["install", "-g", "--prefer-online", spec] : (
      // own cache: after `sudo npm ...`, ~/.npm often contains root-owned files
      ["install", "--prefix", dir, "--cache", path4.join(dir, ".npm-cache"), "--prefer-online", "--no-audit", "--no-fund", spec]
    );
    return new Promise((resolve) => {
      const win = process.platform === "win32";
      let output = "";
      try {
        if (target === "local") fs.mkdirSync(dir, { recursive: true });
        const p = spawn(win ? "npm.cmd" : "npm", args, {
          stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
          shell: win
        });
        p.stdout?.on("data", (d) => output += d);
        p.stderr?.on("data", (d) => output += d);
        p.on("error", (err) => resolve({ ok: false, output: `${output}
${err.message}` }));
        p.on("close", (code) => resolve({ ok: code === 0, output }));
      } catch (err) {
        resolve({ ok: false, output: err.message });
      }
    });
  }
  async function runInstall2({ inherit, version }) {
    if (!REPO_CONFIGURED2 && !env("INSTALL_SPEC")) return { ok: false, output: "The GitHub repo is not set in package.json yet." };
    const attempt = async (target2) => {
      if (version && !env("INSTALL_SPEC")) {
        const res2 = await npmInstall(specFor(version), inherit, target2);
        if (res2.ok || PERMISSION_RE.test(res2.output)) return res2;
      }
      return npmInstall(specFor(), inherit, target2);
    };
    const target = installTarget2();
    const res = await attempt(target);
    if (!res.ok && target === "global" && !isRoot() && PERMISSION_RE.test(res.output)) return attempt("local");
    return res;
  }
  function installedVersion2(script = process.argv[1] ?? "") {
    return new Promise((resolve) => {
      execFile(process.execPath, [script, "--version"], { timeout: 15e3 }, (err, stdout) => {
        const version = new RegExp(`${name} (\\d+\\.\\d+\\.\\d+)`).exec(String(stdout))?.[1];
        resolve(err || !version ? null : version);
      });
    });
  }
  const staleInstallHint2 = (installed) => `npm finished, but ${name} ${installed} is still the version that starts. Try \`${name} update\` again in a few minutes \u2013 GitHub can take a moment after a release.`;
  function installHint2(output) {
    if (PERMISSION_RE.test(output)) {
      return `npm isn't allowed to write to ${appDir2()}. That folder should belong to you \u2013 fix it with \`sudo chown -R "$(whoami)" ~/.${name}\`, then run /update again.`;
    }
    return null;
  }
  return {
    VERSION: VERSION2,
    INSTALL_SPEC: INSTALL_SPEC2,
    INSTALL_CMD: INSTALL_CMD2,
    REPO_CONFIGURED: REPO_CONFIGURED2,
    SOURCE_HINT: SOURCE_HINT2,
    latestUrl: latestUrl2,
    fetchLatestVersion: fetchLatestVersion2,
    checkForUpdate: checkForUpdate2,
    installKind: installKind2,
    releaseSpec: releaseSpec2,
    appDir: appDir2,
    localInstall: localInstall2,
    newerLocalInstall: newerLocalInstall2,
    installTarget: installTarget2,
    runInstall: runInstall2,
    installedVersion: installedVersion2,
    staleInstallHint: staleInstallHint2,
    installHint: installHint2
  };
}

// package.json
var package_default = {
  name: "termdrop",
  version: "2.0.0",
  description: "End-to-end encrypted file sharing with friends on your local network, right in the terminal.",
  repository: {
    type: "git",
    url: "git+https://github.com/trigonyx/termdrop.git"
  },
  homepage: "https://github.com/trigonyx/termdrop#readme",
  bugs: {
    url: "https://github.com/trigonyx/termdrop/issues"
  },
  type: "module",
  bin: {
    termdrop: "dist/cli.js"
  },
  files: [
    "dist"
  ],
  engines: {
    node: ">=22"
  },
  scripts: {
    dev: "tsx src/cli.tsx",
    build: "tsup",
    start: "node dist/cli.js",
    test: "vitest run",
    typecheck: "tsc --noEmit",
    release: "node scripts/release.mjs"
  },
  dependencies: {
    chalk: "5.6.2",
    ink: "6.8.0",
    react: "19.2.0",
    "string-width": "8.1.0",
    "wrap-ansi": "9.0.2"
  },
  devDependencies: {
    "@types/node": "24.9.1",
    "@types/react": "19.2.2",
    "ink-testing-library": "4.0.0",
    termcore: "file:../termcore",
    tsup: "8.5.0",
    tsx: "4.20.6",
    typescript: "5.9.3",
    vitest: "4.1.11"
  }
};

// src/app.ts
var APP = defineApp("termdrop", package_default);

// src/core/update.ts
var {
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
  installHint
} = createUpdater(APP);

// src/core/version.ts
var VERSION = APP.version;
var REPO = APP.repo;
var REPO_CONFIGURED = repoConfigured(APP);
var INSTALL_SPEC = installSpec(APP);
var INSTALL_CMD = installCmd(APP);

// src/transfer/handoff.ts
import { EventEmitter } from "events";
import path8 from "path";

// ../termcore/src/app/instance.ts
import fs3 from "fs";
import net from "net";
import path6 from "path";

// ../termcore/src/app/storage.ts
import fs2 from "fs";
import path5 from "path";
function readJson(file, fallback) {
  let raw;
  try {
    raw = fs2.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch {
    try {
      fs2.renameSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {
    }
    return fallback;
  }
}
var tmpSeq = 0;
function writeJsonAtomic(file, data) {
  writeFileAtomic(file, JSON.stringify(data, null, 2));
}
function writeFileAtomic(file, content) {
  ensureDir(path5.dirname(file));
  const tmp = `${file}.${process.pid}.${++tmpSeq}.tmp`;
  try {
    fs2.writeFileSync(tmp, content, { mode: 384 });
    fs2.renameSync(tmp, file);
  } catch (err) {
    fs2.rmSync(tmp, { force: true });
    throw err;
  }
}
function appendJsonl(file, entry) {
  ensureDir(path5.dirname(file));
  fs2.appendFileSync(file, JSON.stringify(entry) + "\n", { mode: 384 });
}
function readJsonl(file) {
  let raw;
  try {
    raw = fs2.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const out = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
    }
  }
  return out;
}
function writeJsonlAtomic(file, entries) {
  writeFileAtomic(file, entries.map((e) => JSON.stringify(e) + "\n").join(""));
}
function ensureDir(dir) {
  fs2.mkdirSync(dir, { recursive: true, mode: 448 });
}

// ../termcore/src/app/instance.ts
var STARTUP_GRACE = 1e4;
var MAX_REQUEST = 1024 * 1024;
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function probeSocket(socket, timeoutMs = 1e3) {
  return new Promise((resolve) => {
    const c2 = net.connect(socket);
    const done = (ok) => {
      clearTimeout(timer);
      c2.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    c2.once("connect", () => done(true));
    c2.once("error", () => done(false));
  });
}
function readLock(file) {
  try {
    const o = JSON.parse(fs3.readFileSync(file, "utf8"));
    return Number.isInteger(o?.pid) && typeof o.startedAt === "number" && typeof o.socket === "string" ? o : null;
  } catch {
    return null;
  }
}
async function acquireLock(lockFile, socket, opts = {}) {
  const isAlive = opts.isAlive ?? pidAlive;
  const probe = opts.probe ?? probeSocket;
  const now = opts.now ?? Date.now;
  ensureDir(path6.dirname(lockFile));
  for (let attempt = 0; attempt < 5; attempt++) {
    const info = { pid: process.pid, startedAt: now(), socket };
    try {
      fs3.writeFileSync(lockFile, JSON.stringify(info), { flag: "wx", mode: 384 });
      return {
        release: () => {
          if (readLock(lockFile)?.pid === process.pid) fs3.rmSync(lockFile, { force: true });
        }
      };
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
    const holder = readLock(lockFile);
    const stale = !holder || holder.pid === process.pid || !isAlive(holder.pid) || !await probe(holder.socket) && now() - holder.startedAt > STARTUP_GRACE;
    if (!stale) return { holder };
    fs3.rmSync(lockFile, { force: true });
  }
  throw new Error(`Couldn't take the lock ${lockFile}`);
}
async function startInstanceServer(socket, onRequest) {
  if (process.platform !== "win32") {
    ensureDir(path6.dirname(socket));
    fs3.rmSync(socket, { force: true });
  }
  const server = net.createServer((conn) => {
    conn.on("error", () => {
    });
    if (!onRequest) {
      conn.end();
      return;
    }
    let buf = "";
    conn.setEncoding("utf8");
    conn.setTimeout(5e3, () => conn.destroy());
    conn.on("data", (chunk) => {
      buf += chunk;
      if (buf.length > MAX_REQUEST) return void conn.destroy();
      const nl = buf.indexOf("\n");
      if (nl === -1) return;
      let reply = "";
      try {
        reply = onRequest(buf.slice(0, nl));
      } catch {
      }
      conn.end(reply + "\n");
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socket, () => {
      server.off("error", reject);
      resolve();
    });
  });
  if (process.platform !== "win32") fs3.chmodSync(socket, 384);
  server.on("error", () => {
  });
  server.unref();
  return server;
}
function askInstance(socket, line, timeoutMs = 3e3) {
  return new Promise((resolve) => {
    const c2 = net.connect(socket);
    let buf = "";
    let settled = false;
    const done = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      c2.destroy();
      resolve(r);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    c2.setEncoding("utf8");
    c2.once("connect", () => c2.write(line + "\n"));
    c2.on("data", (chunk) => {
      buf += chunk;
      const nl = buf.indexOf("\n");
      if (nl !== -1) done(buf.slice(0, nl));
    });
    c2.on("error", () => done(null));
    c2.on("close", () => done(null));
  });
}

// src/transfer/filenames.ts
import fs4 from "fs";
import path7 from "path";

// ../termcore/src/app/sanitize.ts
var ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|[PX^_][^\u001b]*(?:\u001b\\)?|[@-Z\\-_])?/g;
var CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
var BIDI = /[\u202a-\u202e\u2066-\u2069]/g;
var MAX_NAME = 32;
function sanitizeText(input) {
  return input.replace(/\r\n?/g, "\n").replace(ANSI, "").replace(CONTROL, "").replace(BIDI, "").replace(/\t/g, "    ");
}
function cleanName(input) {
  if (typeof input !== "string") return "Unknown";
  const name = sanitizeText(input).replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  return name || "Unknown";
}

// src/transfer/filenames.ts
var PART_SUFFIX = ".termdrop-part";
var MAX_NAME_BYTES = 200;
var WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(\..*)?$/i;
var INVALID = /[<>:"|?*]/g;
var CONTROL2 = /[\u0000-\u001f\u007f-\u009f]/g;
var INVISIBLE = /[\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
function truncateBytes(text, max2) {
  if (Buffer.byteLength(text) <= max2) return text;
  let out = "";
  let bytes = 0;
  for (const ch of text) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > max2) break;
    out += ch;
    bytes += b;
  }
  return out;
}
function splitExt(name) {
  const double = /(\.tar\.(?:gz|bz2|xz|zst))$/i.exec(name);
  if (double && double.index > 0) return [name.slice(0, double.index), double[1]];
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return [name, ""];
  return [name.slice(0, dot), name.slice(dot)];
}
function safeFileName(raw) {
  if (typeof raw !== "string") return "file";
  let name = sanitizeText(raw.normalize("NFC")).replace(CONTROL2, "").replace(INVISIBLE, "");
  const parts = name.split(/[/\\]+/).filter((p) => p.trim() !== "");
  name = parts[parts.length - 1] ?? "";
  name = name.replace(INVALID, "_").replace(/\s+/g, " ").trim().replace(/^[-\s]+/, "").replace(/[.\s]+$/, "");
  if (!name || /^\.+$/.test(name)) return "file";
  if (WINDOWS_RESERVED.test(name)) name = `_${name}`;
  if (Buffer.byteLength(name) > MAX_NAME_BYTES) {
    const [stem, ext] = splitExt(name);
    const keepExt = Buffer.byteLength(ext) <= 24 ? ext : "";
    name = truncateBytes(stem, MAX_NAME_BYTES - Buffer.byteLength(keepExt)).trimEnd() + keepExt;
    if (!splitExt(name)[0].replace(/^\.+/, "")) name = `file${keepExt}`;
  }
  return name;
}
function numberedName(name, n) {
  if (n === 0) return name;
  const [stem, ext] = splitExt(name);
  return `${stem} (${n})${ext}`;
}
function inside(dir, name) {
  const full = path7.join(dir, name);
  if (path7.dirname(full) !== path7.resolve(dir) || path7.basename(full) !== name) {
    throw new Error(`Refusing to write outside the download folder: ${name}`);
  }
  return full;
}
var exists = (p) => {
  try {
    fs4.lstatSync(p);
    return true;
  } catch {
    return false;
  }
};
async function reservePart(dir, name, mode = 420) {
  for (let n = 0; n < 1e4; n++) {
    const final = inside(dir, numberedName(name, n));
    if (exists(final)) continue;
    const partPath = final + PART_SUFFIX;
    try {
      const handle = await fs4.promises.open(partPath, "wx", mode);
      return { handle, partPath, n };
    } catch (err) {
      if (err.code === "EEXIST") continue;
      throw err;
    }
  }
  throw new Error(`No free name for ${name}`);
}
var NO_LINKS = /* @__PURE__ */ new Set(["EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS", "EXDEV", "EINVAL", "EMLINK"]);
async function finalizePart(dir, partPath, name, startN = 0) {
  for (let n = startN; n < 1e4; n++) {
    const final = inside(dir, numberedName(name, n));
    try {
      await fs4.promises.link(partPath, final);
      await fs4.promises.unlink(partPath);
      return final;
    } catch (err) {
      const code = err.code ?? "";
      if (code === "EEXIST") continue;
      if (!NO_LINKS.has(code)) throw err;
      if (exists(final)) continue;
      await fs4.promises.rename(partPath, final);
      return final;
    }
  }
  throw new Error(`No free name for ${name}`);
}
async function removePart(partPath) {
  try {
    await fs4.promises.unlink(partPath);
  } catch {
  }
}

// src/transfer/offer.ts
var MAX_FILES = 500;
var MAX_WIRE_NAME = 1024;
var MAX_TOTAL = Number.MAX_SAFE_INTEGER;
var isSize = (v) => Number.isSafeInteger(v) && v >= 0;
function parseOfferFiles(files, total) {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) return null;
  if (!isSize(total) || total > MAX_TOTAL) return null;
  const out = [];
  let sum = 0;
  for (const f of files) {
    if (!f || typeof f !== "object" || Array.isArray(f)) return null;
    const { name, size } = f;
    if (typeof name !== "string" || name.length > MAX_WIRE_NAME || !isSize(size)) return null;
    sum += size;
    if (sum > MAX_TOTAL) return null;
    out.push({ name: safeFileName(name), size });
  }
  return sum === total ? out : null;
}
var totalSize = (files) => files.reduce((n, f) => n + f.size, 0);

// src/transfer/handoff.ts
var MAX_PATH = 4096;
function parseRequest(raw) {
  let o;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || o.v !== 1 || !Array.isArray(o.paths) || o.paths.length > MAX_FILES) return null;
  if (!o.paths.every((p) => typeof p === "string" && p.length > 0 && p.length <= MAX_PATH && path8.isAbsolute(p))) return null;
  if (o.to !== void 0 && (typeof o.to !== "string" || o.to.length > 64)) return null;
  return { v: 1, paths: o.paths, ...typeof o.to === "string" ? { to: o.to } : {} };
}
function startHandoffServer(socket, onRequest) {
  return startInstanceServer(socket, (line) => {
    const req = parseRequest(line);
    let reply = { ok: false, added: 0, rejected: [] };
    if (req) {
      try {
        reply = onRequest(req);
      } catch {
      }
    }
    return JSON.stringify(reply);
  });
}
async function handOff(socket, req, timeoutMs = 3e3) {
  const line = await askInstance(socket, JSON.stringify(req), timeoutMs);
  if (line === null) return null;
  try {
    const r = JSON.parse(line);
    return { ok: r.ok === true, added: Number(r.added) || 0, rejected: Array.isArray(r.rejected) ? r.rejected : [] };
  } catch {
    return null;
  }
}
var Inbox = class extends EventEmitter {
  queue = [];
  push(paths, to) {
    this.queue.push({ paths, ...to ? { to } : {} });
    this.emit("request");
  }
  take() {
    return this.queue.shift();
  }
};

// src/transfer/local.ts
import fs5 from "fs";
import path9 from "path";
var showPath = (p) => sanitizeText(p).replace(/\s+/g, " ");
function inspectPaths(paths, already = []) {
  const files = [];
  const rejected = [];
  const seen = new Set(already.map((f) => f.path));
  for (const raw of paths) {
    const p = path9.resolve(raw);
    const label = cleanName(path9.basename(p) || p);
    let st;
    try {
      st = fs5.statSync(p);
    } catch (err) {
      const code = err.code;
      rejected.push({ path: p, reason: code === "EACCES" || code === "EPERM" ? `${label}: no permission to read it` : `${label}: no such file` });
      continue;
    }
    if (st.isDirectory()) {
      rejected.push({ path: p, reason: `${label}: folders aren't supported yet \u2013 zip it first` });
      continue;
    }
    if (!st.isFile()) {
      rejected.push({ path: p, reason: `${label}: not a regular file` });
      continue;
    }
    try {
      fs5.accessSync(p, fs5.constants.R_OK);
    } catch {
      rejected.push({ path: p, reason: `${label}: no permission to read it` });
      continue;
    }
    if (seen.has(p)) continue;
    if (seen.size >= MAX_FILES) {
      rejected.push({ path: p, reason: `At most ${MAX_FILES} files at once \u2013 zip them first` });
      continue;
    }
    seen.add(p);
    files.push({ path: p, name: path9.basename(p), size: st.size });
  }
  return { files, rejected };
}
function freeSpace(dir) {
  try {
    const s = fs5.statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

// src/transfer/units.ts
function formatBytes(n) {
  if (n < 1e3) return `${n} B`;
  const units = ["kB", "MB", "GB", "TB", "PB"];
  let v = n;
  let i = -1;
  do {
    v /= 1e3;
    i++;
  } while (v >= 999.95 && i < units.length - 1);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
function formatSpeed(bps) {
  return `${formatBytes(Math.round(bps))}/s`;
}
function formatEta(seconds) {
  if (seconds === null || !Number.isFinite(seconds)) return "";
  if (seconds < 10) return "<10s";
  if (seconds < 60) return `~${Math.ceil(seconds / 5) * 5}s`;
  const min2 = Math.round(seconds / 60);
  if (min2 < 60) return `~${min2} min`;
  const h = Math.floor(min2 / 60);
  const m = min2 % 60;
  return m ? `~${h} h ${m} min` : `~${h} h`;
}
var plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
function filesLabel(files) {
  return files.length === 1 ? files[0].name : plural(files.length, "file");
}

// src/ui/App.tsx
import { Box as Box14, Text as Text15, useApp, useInput as useInput8 } from "ink";
import { useCallback, useEffect as useEffect7, useMemo, useRef as useRef4, useState as useState9 } from "react";

// src/commands/builtin.ts
import net2 from "net";
import path11 from "path";

// ../termcore/src/friends/state.ts
var REL_STATES = ["accepted", "outgoing", "none"];
var CONTACT_STATES = ["accepted", "outgoing", "incoming", "declined", "blocked"];
var STATE_RANK = { blocked: 5, accepted: 4, outgoing: 3, incoming: 2, declined: 1 };
function strongerState(a, b) {
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b;
}
function reconcile(mine, theirs) {
  const peerWants = theirs === "accepted" || theirs === "outgoing";
  switch (mine) {
    case "blocked":
      return "blocked";
    case "accepted":
    case "outgoing":
      return peerWants ? "accepted" : "outgoing";
    case "incoming":
      return peerWants ? "incoming" : null;
    case "declined":
      return peerWants ? "incoming" : "declined";
    case null:
      return peerWants ? "incoming" : null;
  }
}
function relStateFor(state) {
  return state === "accepted" || state === "outgoing" ? state : "none";
}

// ../termcore/src/friends/merge.ts
var max = (a, b) => a === void 0 ? b : b === void 0 ? a : Math.max(a, b);
var min = (a, b) => Math.min(a, b);
var fresher = (a, b) => (b.lastSeen ?? 0) > (a.lastSeen ?? 0) ? b : a;
function mergeFriends(a, b, id = a.id) {
  const recent = fresher(a, b);
  const apps = { ...b.apps };
  for (const [app, fields] of Object.entries(a.apps ?? {})) {
    apps[app] = { ...apps[app], ...fields };
  }
  const ports = { ...b.ports, ...a.ports };
  const out = {
    id,
    publicKey: a.publicKey || b.publicKey,
    name: recent.name,
    state: strongerState(a.state, b.state),
    lastActivity: max(a.lastActivity, b.lastActivity) ?? Date.now(),
    createdAt: min(a.createdAt, b.createdAt)
  };
  const alias = a.alias ?? b.alias;
  if (alias) out.alias = alias;
  const color = a.color ?? b.color;
  if (color) out.color = color;
  const lastIp = recent.lastIp ?? a.lastIp ?? b.lastIp;
  if (lastIp) out.lastIp = lastIp;
  if (Object.keys(ports).length) out.ports = ports;
  const lastSeen = max(a.lastSeen, b.lastSeen);
  if (lastSeen !== void 0) out.lastSeen = lastSeen;
  if (Object.keys(apps).length) out.apps = apps;
  return out;
}
function mergePeers(a, b, id = a.id) {
  const recent = fresher(a, b);
  const out = { id, name: recent.name };
  const lastIp = recent.lastIp ?? a.lastIp ?? b.lastIp;
  if (lastIp) out.lastIp = lastIp;
  const ports = { ...b.ports, ...a.ports };
  if (Object.keys(ports).length) out.ports = ports;
  const lastSeen = max(a.lastSeen, b.lastSeen);
  if (lastSeen !== void 0) out.lastSeen = lastSeen;
  return out;
}

// ../termcore/src/friends/book.ts
var SHARED = /* @__PURE__ */ new Set(["publicKey", "name", "alias", "state", "color", "lastIp", "lastSeen", "lastActivity", "createdAt"]);
function displayName(c2) {
  return c2.alias || c2.name;
}
function viewOf(f, app) {
  const { ports, apps, ...rest } = f;
  const port = ports?.[app];
  return { ...apps?.[app], ...rest, ...port ? { lastPort: port } : {} };
}
function applyPatch(f, patch, app) {
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id") continue;
    if (SHARED.has(k)) {
      if (v === void 0) delete f[k];
      else f[k] = v;
    } else if (k === "lastPort") {
      const ports = { ...f.ports };
      if (typeof v === "number" && v > 0) ports[app] = v;
      else delete ports[app];
      if (Object.keys(ports).length) f.ports = ports;
      else delete f.ports;
    } else {
      const fields = { ...f.apps?.[app] };
      if (v === void 0) delete fields[k];
      else fields[k] = v;
      const apps = { ...f.apps };
      if (Object.keys(fields).length) apps[app] = fields;
      else delete apps[app];
      if (Object.keys(apps).length) f.apps = apps;
      else delete f.apps;
    }
  }
}
var ContactBook = class {
  constructor(file, app) {
    this.file = file;
    this.app = app;
    this.rebuild(file.get());
    file.on("change", (v) => this.rebuild(v));
  }
  views = /* @__PURE__ */ new Map();
  version = 0;
  rebuild(v) {
    this.views = new Map(v.friends.map((f) => [f.id, viewOf(f, this.app)]));
    this.version++;
  }
  get(id) {
    return this.views.get(id);
  }
  all() {
    return [...this.views.values()];
  }
  /** The entry as stored (all apps' fields). */
  raw(id) {
    return this.file.get().friends.find((f) => f.id === id);
  }
  upsert(id, patch) {
    return this.mutate(id, () => patch);
  }
  /**
   * Decides a change from the newest stored entry (read under the lock): `fn` returns a patch,
   * `null` to remove the entry, or `undefined` for no change. Returns the entry afterwards.
   */
  mutate(id, fn) {
    let result;
    this.file.update((d) => {
      const i = d.friends.findIndex((f) => f.id === id);
      const prev = i >= 0 ? d.friends[i] : void 0;
      const patch = fn(prev ? viewOf(prev, this.app) : void 0);
      if (patch === null) {
        if (i >= 0) d.friends.splice(i, 1);
        result = void 0;
        return;
      }
      if (patch === void 0) {
        result = prev;
        return;
      }
      const p = patch;
      if (!prev && (p.publicKey === void 0 || !p.name || !p.state)) {
        result = void 0;
        return;
      }
      const now = Date.now();
      const next = prev ? structuredClone(prev) : { id, publicKey: "", name: "", state: p.state, lastActivity: now, createdAt: now };
      applyPatch(next, patch, this.app);
      if (i >= 0) d.friends[i] = next;
      else d.friends.push(next);
      result = next;
    });
    return result ? viewOf(result, this.app) : void 0;
  }
  /**
   * Ports of their other apps (from their discovery announcement): another app of ours can
   * then dial them right away. Only known entries, only when something changed.
   */
  setPorts(id, ports) {
    const cur = this.raw(id);
    if (!cur || Object.entries(ports).every(([app, port]) => cur.ports?.[app] === port)) return;
    this.file.update((d) => {
      const f = d.friends.find((x) => x.id === id);
      if (f) f.ports = { ...f.ports, ...ports };
    });
  }
  remove(id) {
    if (this.views.has(id) || this.raw(id)) this.mutate(id, () => null);
  }
  /** Someone has a new id (a verified link): their entry moves there, merged with one that may exist. */
  relink(oldId, newId, newPublicKey) {
    let moved = false;
    this.file.update((d) => {
      const old = d.friends.find((f) => f.id === oldId);
      if (!old) return;
      const existing = d.friends.find((f) => f.id === newId);
      const merged = existing ? mergeFriends(existing, old, newId) : { ...old, id: newId };
      merged.publicKey = newPublicKey;
      d.friends = [...d.friends.filter((f) => f.id !== oldId && f.id !== newId), merged];
      moved = true;
    });
    return moved;
  }
};
var PeerBook = class {
  constructor(file, app) {
    this.file = file;
    this.app = app;
  }
  view(p) {
    const { ports, ...rest } = p;
    const port = ports?.[this.app];
    return { ...rest, ...port ? { lastPort: port } : {} };
  }
  get(id) {
    const p = this.file.get().peers.find((x) => x.id === id);
    return p ? this.view(p) : void 0;
  }
  update(id, patch) {
    const prev = this.file.get().peers.find((x) => x.id === id);
    const port = patch.lastPort;
    const unchanged = prev && (patch.name === void 0 || patch.name === prev.name) && (patch.lastIp === void 0 || patch.lastIp === prev.lastIp) && (patch.lastSeen === void 0 || patch.lastSeen === prev.lastSeen) && (port === void 0 || port === prev.ports?.[this.app]);
    if (unchanged) return;
    this.file.update((d) => {
      let p = d.peers.find((x) => x.id === id);
      if (!p) {
        p = { id, name: patch.name ?? "Unknown" };
        d.peers.push(p);
      }
      if (patch.name !== void 0) p.name = patch.name;
      if (patch.lastIp !== void 0) p.lastIp = patch.lastIp;
      if (patch.lastSeen !== void 0) p.lastSeen = patch.lastSeen;
      if (port) p.ports = { ...p.ports, [this.app]: port };
    });
  }
  relink(oldId, newId) {
    let moved = false;
    this.file.update((d) => {
      const old = d.peers.find((p) => p.id === oldId);
      if (!old) return;
      const existing = d.peers.find((p) => p.id === newId);
      const merged = existing ? mergePeers(existing, old, newId) : { ...old, id: newId };
      d.peers = [...d.peers.filter((p) => p.id !== oldId && p.id !== newId), merged];
      moved = true;
    });
    return moved;
  }
};

// ../termcore/src/net/identity.ts
import crypto2 from "crypto";
var PEER_ID_RE = /^[A-Z2-7]{20}$/;
var BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = value << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[value >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[value << 5 - bits & 31];
  return out;
}
function fingerprint(publicRaw) {
  return base32(crypto2.createHash("sha256").update(publicRaw).digest()).slice(0, 20);
}
function formatId(id, full = false) {
  const groups = (full ? id : id.slice(0, 8)).match(/.{1,4}/g) ?? [];
  return groups.join("-");
}
function safetyCode(a, b) {
  const [first, second] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
  const digest = crypto2.createHash("sha256").update(first).update(second).digest();
  const groups = [];
  for (let i = 0; i < 6; i++) groups.push(String(digest.readUInt32BE(i * 4) % 1e5).padStart(5, "0"));
  return groups.join(" ");
}
function publicKeyFromRaw(raw) {
  return crypto2.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") }, format: "jwk" });
}
function isIdentityFile(o) {
  const f = o;
  return !!f && f.v === 1 && typeof f.publicKey === "string" && typeof f.privateKey === "string" && !!f.publicKey && !!f.privateKey;
}
function identityFromFile(file) {
  const publicRaw = Buffer.from(file.publicKey, "base64url");
  const privateKey = crypto2.createPrivateKey({
    key: { kty: "OKP", crv: "Ed25519", x: file.publicKey, d: file.privateKey },
    format: "jwk"
  });
  return { id: fingerprint(publicRaw), publicRaw, publicKey: publicKeyFromRaw(publicRaw), privateKey };
}
function generateIdentityFile() {
  const { privateKey } = crypto2.generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  return { v: 1, publicKey: jwk.x, privateKey: jwk.d };
}
function readIdentity(file) {
  const existing = readJson(file, null);
  if (!isIdentityFile(existing)) return null;
  try {
    return identityFromFile(existing);
  } catch {
    return null;
  }
}
function loadOrCreateIdentity(file) {
  const existing = readIdentity(file);
  if (existing) return existing;
  const created = generateIdentityFile();
  writeJsonAtomic(file, created);
  return identityFromFile(created);
}

// ../termcore/src/ui/format.ts
var pad = (n) => String(n).padStart(2, "0");
function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function clock(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var daysAgo = (ts, now) => Math.round((startOfDay(now) - startOfDay(ts)) / 864e5);
function shortTime(ts, now = Date.now()) {
  const days = daysAgo(ts, now);
  const d = new Date(ts);
  if (days <= 0) return clock(ts);
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAYS[d.getDay()];
  const date = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? date : `${date}, ${d.getFullYear()}`;
}
function duration(ms) {
  const s = Math.max(0, ms) / 1e3;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

// ../termcore/src/ui/theme.ts
import chalk from "chalk";

// ../termcore/src/friends/profile.ts
var STATUSES = ["available", "busy", "dnd"];
var MAX_STATUS_MSG = 60;
var PROFILE_COLORS = [
  { name: "coral", hex: "#f7768e" },
  { name: "orange", hex: "#ff9e64" },
  { name: "amber", hex: "#e0af68" },
  { name: "lime", hex: "#b9e66b" },
  { name: "green", hex: "#9ece6a" },
  { name: "teal", hex: "#73daca" },
  { name: "cyan", hex: "#7dcfff" },
  { name: "blue", hex: "#7aa2f7" },
  { name: "indigo", hex: "#8f8cf2" },
  { name: "purple", hex: "#bb9af7" },
  { name: "pink", hex: "#ff8fc7" },
  { name: "sand", hex: "#d8c4a0" }
];
function normalizeColor(input) {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  const named = PROFILE_COLORS.find((c2) => c2.name === v);
  if (named) return named.hex;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/.exec(v);
  if (!m) return null;
  return "#" + (m[1].length === 3 ? [...m[1]].map((ch) => ch + ch).join("") : m[1]);
}
var isStatus = (v) => typeof v === "string" && STATUSES.includes(v);
function cleanStatusMsg(input) {
  if (typeof input !== "string") return void 0;
  const msg = [...sanitizeText(input).replace(/\s+/g, " ").trim()].slice(0, MAX_STATUS_MSG).join("");
  return msg || void 0;
}

// ../termcore/src/ui/theme.ts
var DEFAULT_ACCENT = "#D97757";
var theme = {
  accent: DEFAULT_ACCENT,
  peer: "#7AA2F7",
  dim: "#8C8C8C",
  faint: "#5A5A5A",
  border: "#4E4E4E",
  success: "#8CC08A",
  error: "#E5737B",
  warning: "#E5C07B",
  code: "#C3A6E8",
  /** text on an accent background */
  onAccent: "#1E1E1E",
  /** text still to type (keyrace) */
  text: "#D4D4D4",
  /** text typed correctly (keyrace) */
  typed: "#FFFFFF"
};
function setAccent(hex) {
  const next = normalizeColor(hex) ?? DEFAULT_ACCENT;
  if (next.toLowerCase() === theme.accent.toLowerCase()) return false;
  theme.accent = next;
  return true;
}
var c = {
  get accent() {
    return chalk.hex(theme.accent);
  },
  peer: chalk.hex(theme.peer),
  dim: chalk.hex(theme.dim),
  faint: chalk.hex(theme.faint),
  success: chalk.hex(theme.success),
  error: chalk.hex(theme.error),
  warning: chalk.hex(theme.warning),
  code: chalk.hex(theme.code),
  bold: chalk.bold,
  italic: chalk.italic
};
var icons = {
  pointer: "\u276F",
  online: "\u25CF",
  offline: "\u25CB",
  away: "\u25D0",
  busy: "\u25D1",
  dnd: "\u2298",
  send: "\u25B6",
  racing: "\u25B6",
  request: "\u25C6",
  pending: "\u25F7",
  joined: "\u2713",
  done: "\u2713",
  delivered: "\u2713",
  read: "\u2713\u2713",
  error: "\u2717",
  info: "\xB7",
  star: "\u2605",
  up: "\u2191",
  down: "\u2193",
  file: "\u25AA",
  group: "#",
  left: "\u23CF",
  flag: "\u{1F3C1}"
};
var SENDER_COLORS = ["#7AA2F7", "#9ECE6A", "#E0AF68", "#BB9AF7", "#7DCFFF", "#F7768E", "#73DACA", "#FF9E64"];
function idHex(id) {
  let h = 0;
  for (const ch of id) h = h * 31 + ch.charCodeAt(0) >>> 0;
  return SENDER_COLORS[h % SENDER_COLORS.length];
}
var profileColor = null;
function setPersonColors(lookup) {
  profileColor = lookup;
}
function senderHex(id) {
  return profileColor?.(id) ?? idHex(id);
}
function personHex(id, color) {
  return color ?? senderHex(id);
}

// ../termcore/src/ui/presence.ts
function presenceDot(p) {
  if (!p.online) return { icon: icons.offline, color: theme.faint };
  if (p.status === "dnd") return { icon: icons.dnd, color: theme.error };
  if (p.status === "busy") return { icon: icons.busy, color: theme.warning };
  if (p.away) return { icon: icons.away, color: theme.dim };
  return { icon: icons.online, color: theme.success };
}
function statusText(status, msg) {
  const label = status === "busy" ? "busy" : status === "dnd" ? "do not disturb" : "";
  return [label, msg].filter(Boolean).join(" \xB7 ");
}

// src/transfer/paste.ts
import os5 from "os";
import path10 from "path";
var BRACKETS = /\u001b\[20[01]~/g;
function splitShellWords(text) {
  const words = [];
  let cur = "";
  let inWord = false;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else cur += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === "\\" && i + 1 < text.length && '"\\$`'.includes(text[i + 1])) cur += text[++i];
      else cur += ch;
      continue;
    }
    if (ch === "\\" && i + 1 < text.length) {
      const next = text[++i];
      if (next !== "\n") cur += next;
      inWord = true;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      inWord = true;
    } else if (/\s/.test(ch)) {
      if (inWord) words.push(cur);
      cur = "";
      inWord = false;
    } else {
      cur += ch;
      inWord = true;
    }
  }
  if (quote) return null;
  if (inWord) words.push(cur);
  return words;
}
function fromFileUrl(word) {
  if (!/^file:\/\//i.test(word)) return word;
  try {
    const url = new URL(word);
    if (url.host && url.host !== "localhost") return null;
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}
var isAbsolute = (p, platform) => platform === "win32" ? /^(?:[a-zA-Z]:[\\/]|\\\\[^\\]+\\)/.test(p) : p.startsWith("/");
function expandHome(p, home = os5.homedir()) {
  if (p === "~") return home;
  if (p.startsWith("~/") || p.startsWith("~\\")) return path10.join(home, p.slice(2));
  return p;
}
function parsePastedPaths(text, home = os5.homedir(), platform = process.platform) {
  const clean = text.replace(BRACKETS, "").replace(/\r\n?/g, "\n").trim();
  if (!clean) return null;
  const words = platform === "win32" ? splitWindowsWords(clean) : splitShellWords(clean);
  if (!words?.length) return null;
  const out = [];
  for (const w of words) {
    const p = fromFileUrl(w);
    if (p === null) return null;
    const full = expandHome(p, home);
    if (!isAbsolute(full, platform)) return null;
    if (!out.includes(full)) out.push(full);
  }
  return out;
}
function splitWindowsWords(text) {
  const words = [];
  const re = /"([^"]*)"|(\S+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) words.push(m[1] ?? m[2]);
  return words;
}
function resolvePastedPaths(text, exists4, home = os5.homedir(), platform = process.platform) {
  const parsed = parsePastedPaths(text, home, platform);
  if (parsed && parsed.every(exists4)) return parsed;
  const whole = expandHome(text.replace(BRACKETS, "").trim(), home);
  if (whole && isAbsolute(whole, platform) && exists4(whole)) return [whole];
  if (parsed && parsed.some(exists4)) return parsed;
  return null;
}

// ../termcore/src/ui/commands/parse.ts
function parseCommand(input) {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  const match = /^\/(\S*)\s*([\s\S]*)$/.exec(trimmed);
  if (!match) return null;
  const name = (match[1] ?? "").toLowerCase();
  const rest = (match[2] ?? "").trim();
  return { name, args: tokenize(rest), rest };
}
function tokenize(text) {
  const args = [];
  let current = "";
  let quote = null;
  let inToken = false;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inToken = true;
    } else if (/\s/.test(ch)) {
      if (inToken) args.push(current);
      current = "";
      inToken = false;
    } else {
      current += ch;
      inToken = true;
    }
  }
  if (inToken) args.push(current);
  return args;
}

// ../termcore/src/ui/commands/registry.ts
var CommandRegistry = class {
  constructor(commands, rules) {
    this.commands = commands;
    this.rules = rules;
  }
  find(name) {
    const n = name.toLowerCase();
    return this.commands.find((c2) => c2.name === n || c2.aliases?.includes(n));
  }
  fits(c2, where) {
    return c2.scope === "global" || !this.rules || where === void 0 || this.rules.inScope(c2.scope, where);
  }
  /** Commands available here (all of them without a place). */
  available(where) {
    return this.commands.filter((c2) => this.fits(c2, where));
  }
  /** Commands available here, filtered by prefix. */
  suggest(prefix, where) {
    const p = prefix.toLowerCase();
    return this.available(where).filter((c2) => c2.name.startsWith(p) || c2.aliases?.some((a) => a.startsWith(p)));
  }
  /**
   * Runs an input as a command. Returns `false` if it isn't a command.
   * Errors always end up as a message in the UI – never as a crash.
   */
  async execute(input, ctx) {
    const parsed = parseCommand(input);
    if (!parsed) return false;
    const { ui } = ctx;
    if (!parsed.name) {
      ui.print("Type a command, e.g. /help", "error");
      return true;
    }
    const where = this.rules?.where(ctx);
    const cmd = this.available(where).find((c2) => c2.name === parsed.name || c2.aliases?.includes(parsed.name)) ?? this.find(parsed.name);
    if (!cmd) {
      ui.print(`Unknown command /${parsed.name} \u2013 all commands: /help`, "error");
      return true;
    }
    if (!this.fits(cmd, where)) {
      ui.print(this.rules.outOfScope(cmd.name, cmd.scope, where), "error");
      return true;
    }
    if (parsed.args.length < (cmd.minArgs ?? 0)) {
      ui.print(`Usage: /${cmd.name} ${cmd.usage ?? ""}`.trim(), "error");
      return true;
    }
    try {
      await cmd.run(ctx, parsed.args, parsed.rest);
    } catch (err) {
      ui.print(`/${cmd.name} failed: ${err.message}`, "error");
    }
    return true;
  }
};

// src/commands/registry.ts
var CommandRegistry2 = class extends CommandRegistry {
};

// src/commands/builtin.ts
var STATE_LABEL = {
  accepted: "friend",
  outgoing: "request sent",
  incoming: "wants to be friends",
  declined: "declined your request",
  blocked: "blocked"
};
async function friendOf(ctx, title, filter = () => true) {
  const sel = ctx.selectedId ? ctx.store.contacts.get(ctx.selectedId) : void 0;
  if (sel && filter(sel.state, sel.trusted === true)) return sel.id;
  const options = ctx.store.contacts.all().filter((c2) => filter(c2.state, c2.trusted === true)).map((c2) => ({ id: c2.id, label: displayName(c2), hint: STATE_LABEL[c2.state] })).sort((a, b) => a.label.localeCompare(b.label));
  if (!options.length) throw new Error("No friend to choose from");
  const ids = await ctx.ui.pick(title, options, false);
  return ids?.[0] ?? null;
}
function parseAddress(input) {
  const m = /^\[?([^\]]+?)\]?(?::(\d{1,5}))?$/.exec(input.trim());
  if (!m) throw new Error(`Invalid address: ${input}`);
  const host = m[1];
  const port = m[2] ? Number(m[2]) : APP.tcpPort;
  if (port < 1 || port > 65535) throw new Error(`Invalid port: ${m[2]}`);
  if (!net2.isIP(host) && !/^[a-z0-9.-]+$/i.test(host)) throw new Error(`Invalid address: ${input}`);
  return { host, port };
}
var RESULT_TEXT = { done: "done", declined: "declined", cancelled: "cancelled", failed: "failed", expired: "expired" };
var builtinCommands = [
  {
    name: "help",
    aliases: ["?"],
    description: "Show all commands and shortcuts",
    scope: "global",
    run(ctx) {
      const cmds = registry.available();
      const width = Math.max(...cmds.map((c2) => `/${c2.name} ${c2.usage ?? ""}`.length));
      const lines = cmds.map((c2) => `\`${`/${c2.name} ${c2.usage ?? ""}`.trimEnd().padEnd(width)}\`  ${c2.description}`);
      ctx.ui.print(
        [
          "### Commands",
          "",
          ...lines.map((l) => `- ${l}`),
          "",
          "**Keys:** `\u2191\u2193` select \xB7 `enter` send / accept \xB7 `x` decline \xB7 `t` trust \xB7 `a` add by IP \xB7 `r` rename \xB7 `d` remove \xB7 `tab` transfers \xB7 `/` command \xB7 `q` quit",
          "**Transfers** (`tab`): `c` cancel \xB7 `enter` open \xB7 `o` show in Finder",
          "**Sending:** drag files into the window, or run `termdrop <files>` in another terminal."
        ].join("\n")
      );
    }
  },
  {
    name: "send",
    usage: "[paths\u2026]",
    description: "Send files (no paths: open the file picker)",
    scope: "global",
    run(ctx, _args, rest) {
      const words = splitShellWords(rest) ?? [];
      if (!words.length) return ctx.ui.sendFiles();
      ctx.ui.sendFiles(words.map((a) => path11.resolve(expandHome(a))), { recipients: true });
    }
  },
  {
    name: "me",
    aliases: ["id"],
    description: "Show your name, ID and address",
    scope: "global",
    run(ctx) {
      const me = ctx.store.me;
      const addr = me.ips.length ? me.ips.map((ip) => `\`${ip}:${me.port}\``).join(", ") : "no network";
      const status = statusText(me.status, me.statusMsg);
      ctx.ui.print(
        [
          `### ${me.name}`,
          "",
          `- **ID** \`${formatId(me.id, true)}\``,
          ...status ? [`- **Status** ${status}`] : [],
          `- **Reachable at** ${addr}`,
          `- **Files are saved to** \`${showPath(tildify(ctx.store.downloadDir()))}\``,
          "",
          "_Name, ID and friends are shared by termchat, keyrace and termdrop (~/.termhub)._"
        ].join("\n")
      );
    }
  },
  {
    name: "name",
    usage: "<new name>",
    minArgs: 1,
    description: "Change your display name (in all apps)",
    scope: "global",
    run(ctx, _args, rest) {
      const name = ctx.store.setName(rest);
      ctx.ui.print(`You are now ${name}`, "success");
    }
  },
  {
    name: "add",
    usage: "<ip[:port]>",
    minArgs: 1,
    description: "Add a friend by IP (if they don't show up under Nearby)",
    scope: "global",
    async run(ctx, args) {
      const { host, port } = parseAddress(args[0]);
      ctx.ui.print(`Connecting to ${host}:${port} \u2026`);
      await ctx.store.addByAddress(host, port);
    }
  },
  {
    name: "rename",
    usage: "[nickname]",
    description: "Your own nickname for the selected friend (empty = their own name)",
    scope: "global",
    async run(ctx, _args, rest) {
      const id = await friendOf(ctx, "Rename which friend?");
      if (!id) return;
      ctx.store.rename(id, rest);
      ctx.ui.print(rest ? `Now shown as ${ctx.store.friend(id)?.display}` : "Nickname removed", "success");
    }
  },
  {
    name: "remove",
    description: "Remove the selected friend",
    scope: "global",
    async run(ctx) {
      const id = await friendOf(ctx, "Remove which friend?");
      if (!id) return;
      const f = ctx.store.friend(id);
      if (await ctx.ui.confirm(`Remove ${f.display} as a friend?`)) ctx.store.removeFriend(id);
    }
  },
  {
    name: "block",
    description: "Block the selected friend",
    scope: "global",
    async run(ctx) {
      const id = await friendOf(ctx, "Block whom?", (s) => s !== "blocked");
      if (!id) return;
      const f = ctx.store.friend(id);
      if (await ctx.ui.confirm(`Block ${f.display}?`)) ctx.store.block(id);
    }
  },
  {
    name: "unblock",
    description: "Unblock someone you blocked",
    scope: "global",
    async run(ctx) {
      const id = await friendOf(ctx, "Unblock whom?", (s) => s === "blocked");
      if (id) ctx.store.unblock(id);
    }
  },
  {
    name: "whois",
    aliases: ["info"],
    description: "Friend details and safety code",
    scope: "global",
    async run(ctx) {
      const id = await friendOf(ctx, "Show whom?");
      if (!id) return;
      const f = ctx.store.friend(id);
      const code = ctx.store.safetyCodeWith(id);
      const lines = [
        `### ${f.display}${f.alias ? ` _(calls themselves ${f.name})_` : ""}`,
        "",
        `- **ID** \`${formatId(f.id, true)}\``,
        `- **Status** ${f.away ? "away" : f.online ? "online" : "offline"}${f.online && statusText(f.status, f.statusMsg) ? ` \xB7 ${statusText(f.status, f.statusMsg)}` : ""} \xB7 ${STATE_LABEL[f.state] ?? f.state}${f.trusted ? " \xB7 \u2605 trusted (files are accepted automatically)" : ""}`,
        `- **Address** ${f.lastIp ? `\`${f.lastIp}:${f.lastPort ?? "?"}\`` : "unknown"}`,
        `- **Safety code** ${code ? `\`${code}\`` : "not connected yet"}`,
        "",
        "_Compare the safety code in person. If it matches, nobody is sitting in the middle._"
      ];
      ctx.ui.print(lines.join("\n"));
    }
  },
  {
    name: "trust",
    description: "Accept the selected friend's files automatically",
    scope: "global",
    async run(ctx) {
      const id = await friendOf(ctx, "Trust whom?", (s, t) => s === "accepted" && !t);
      if (id) ctx.store.setTrusted(id, true);
    }
  },
  {
    name: "untrust",
    description: "Ask again before accepting the selected friend's files",
    scope: "global",
    async run(ctx) {
      const id = await friendOf(ctx, "Stop trusting whom?", (s, t) => s === "accepted" && t);
      if (id) ctx.store.setTrusted(id, false);
    }
  },
  {
    name: "folder",
    aliases: ["downloads"],
    usage: "[path]",
    description: "Show or change where received files are saved",
    scope: "global",
    run(ctx, _args, rest) {
      const arg = rest.replace(/^(["'])(.*)\1$/, "$2").trim();
      if (!arg) {
        const free = ctx.store.freeSpace();
        ctx.ui.print(`Files are saved to ${showPath(tildify(ctx.store.downloadDir()))}${free !== null ? ` \xB7 ${formatBytes(free)} free` : ""}`);
        return;
      }
      const dir = ctx.store.setDownloadDir(expandHome(arg));
      ctx.ui.print(`Received files now go to ${showPath(tildify(dir))}`, "success");
    }
  },
  {
    name: "history",
    aliases: ["log"],
    description: "All past transfers",
    scope: "global",
    run(ctx) {
      const all = ctx.store.history.recent(200);
      const t = ctx.store.totals();
      const lines = [
        "### Transfers",
        "",
        `**Sent** ${formatBytes(t.sentBytes)} in ${t.sentFiles} files \xB7 **received** ${formatBytes(t.receivedBytes)} in ${t.receivedFiles} files`,
        ""
      ];
      if (!all.length) lines.push("_Nothing yet \u2013 drag a file into this window to send it._");
      for (const e of all) {
        const arrow = e.dir === "out" ? "\u2191" : "\u2193";
        const where = e.saved?.length ? ` \u2192 \`${showPath(tildify(path11.dirname(e.saved[0])))}\`` : "";
        lines.push(
          `- ${arrow} **${e.peerName}** ${showPath(filesLabel(e.files))} \xB7 ${formatBytes(e.total)} \xB7 ${RESULT_TEXT[e.result]}${e.result === "done" && e.ms >= 1e3 ? ` in ${duration(e.ms)}` : e.reason ? ` (${e.reason})` : ""}${where} _${shortTime(e.ts)}_`
        );
      }
      ctx.ui.print(lines.join("\n"));
    }
  },
  {
    name: "notifications",
    aliases: ["notify"],
    usage: "[on|off]",
    description: "Desktop notifications while the app is in the background (all apps)",
    scope: "global",
    run(ctx, args) {
      const arg = args[0]?.toLowerCase();
      if (arg && arg !== "on" && arg !== "off") throw new Error("Usage: /notifications on|off");
      if (arg) ctx.store.setNotifications(arg === "on");
      ctx.ui.print(`Notifications are ${ctx.store.notificationsEnabled() ? "on" : "off"}`, "info");
    }
  },
  {
    name: "update",
    description: "Install the latest termdrop version from GitHub",
    scope: "global",
    async run(ctx) {
      if (installKind() === "source") return ctx.ui.print(SOURCE_HINT);
      ctx.ui.print("Checking for updates \u2026");
      const latest = await fetchLatestVersion();
      if (!latest) throw new Error("Couldn't reach GitHub \u2013 are you online?");
      if (compareVersions(latest, VERSION) <= 0) {
        ctx.store.setUpdateAvailable(null);
        ctx.ui.print(`termdrop ${VERSION} is up to date`, "success");
        return;
      }
      if (ctx.store.transfers.open().length && !await ctx.ui.confirm("Transfers are running \u2013 updating restarts termdrop and stops them. Go on?")) return;
      if (!await ctx.ui.confirm(`Update termdrop ${VERSION} \u2192 ${latest}?`)) return;
      ctx.ui.print(`Installing termdrop ${latest} \u2026 (this can take a minute)`);
      const res = await runInstall({ inherit: false, version: latest });
      if (!res.ok) {
        const tail = res.output.trim().split("\n").slice(-6).join("\n");
        const hint = installHint(res.output);
        throw new Error(hint ?? `npm reported:
${tail}`);
      }
      const installed = await installedVersion();
      if (installed && compareVersions(installed, latest) < 0) throw new Error(staleInstallHint(installed));
      ctx.store.setUpdateAvailable(null);
      if (await ctx.ui.confirm(`Updated to ${latest}. Restart termdrop now?`)) {
        requestRestart();
        ctx.ui.quit();
      } else {
        ctx.ui.print(`Updated \u2013 restart termdrop to use ${latest}`, "success");
      }
    }
  },
  {
    name: "quit",
    aliases: ["exit", "q"],
    description: "Quit termdrop",
    scope: "global",
    async run(ctx) {
      if (ctx.store.transfers.open().length && !await ctx.ui.confirm("Transfers are still running \u2013 quit and stop them?")) return;
      ctx.ui.quit();
    }
  }
];
var registry = new CommandRegistry2(builtinCommands);

// src/core/store.ts
import fs14 from "fs";
import path17 from "path";

// ../termcore/src/app/toasts.ts
var TOAST_MS = 4e3;
var Toasts = class {
  constructor(changed, ms = TOAST_MS) {
    this.changed = changed;
    this.ms = ms;
  }
  current = null;
  timer = null;
  show(text, kind = "info", extra) {
    this.current = { ...extra, text, kind };
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.current = null;
      this.changed();
    }, this.ms);
    this.timer.unref();
    this.changed();
  }
  stop() {
    if (this.timer) clearTimeout(this.timer);
  }
};

// ../termcore/src/friends/net.ts
import fs11 from "fs";

// ../termcore/src/app/notify.ts
import { execFile as execFile2 } from "child_process";
var MAC_SCRIPT = "on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run";
function notify(title, body, app = "termhub") {
  const cmd = process.platform === "darwin" ? ["osascript", ["-e", MAC_SCRIPT, title, body]] : process.platform === "linux" ? ["notify-send", [`--app-name=${app}`, "--", title, body]] : null;
  if (!cmd) return;
  try {
    execFile2(cmd[0], [...cmd[1]], () => {
    }).on("error", () => {
    });
  } catch {
  }
}

// ../termcore/src/app/run.ts
import fs6 from "fs";
import path12 from "path";
function registerRun(runDir, info) {
  const file = path12.join(runDir, `${info.app}.json`);
  const entry = { ...info, pid: process.pid, startedAt: Date.now() };
  try {
    writeJsonAtomic(file, entry);
  } catch {
    return () => {
    };
  }
  return () => {
    try {
      if (readJson(file, null)?.pid === process.pid) fs6.rmSync(file, { force: true });
    } catch {
    }
  };
}
function runningApps(runDir, isAlive = pidAlive) {
  let files = [];
  try {
    files = fs6.readdirSync(runDir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    try {
      const r = readJson(path12.join(runDir, f), null);
      if (r && isSuiteApp(r.app) && Number.isInteger(r.pid) && Number.isInteger(r.port) && isAlive(r.pid)) out.push(r);
    } catch {
    }
  }
  return out;
}
function runningPorts(runDir) {
  return Object.fromEntries(runningApps(runDir).map((r) => [r.app, r.port]));
}

// ../termcore/src/net/dialer.ts
var MAX_BACKOFF = 3e4;
var MAX_BACKOFF_NEARBY = 5e3;
var CALLBACK_TTL = 15e3;
var MAX_CALLBACKS_PER_MINUTE = 10;
var Dialer = class {
  constructor(d) {
    this.d = d;
  }
  states = /* @__PURE__ */ new Map();
  /** Peers that asked us to connect to them (id → when). */
  callbacks = /* @__PURE__ */ new Map();
  callbackTimes = [];
  /** Friends we already told that they can't be reached. */
  warned = /* @__PURE__ */ new Set();
  /** We dialed this id and someone else answered – that session waits for their link. */
  relinking = /* @__PURE__ */ new Map();
  timer = null;
  start(intervalMs = 1500) {
    this.timer = setInterval(() => this.loop(), intervalMs);
    this.timer.unref();
    this.loop();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }
  /** A session came up: forget backoff and callbacks for that peer. */
  connected(id) {
    this.states.delete(id);
    this.callbacks.delete(id);
    this.warned.delete(id);
    this.relinking.delete(id);
  }
  /** A connection turned out to be useless (e.g. someone else answered): back off as after a failed dial. */
  failed(id) {
    const ds = this.states.get(id) ?? { inFlight: false, next: 0, backoff: 1e3 };
    ds.backoff = Math.min(ds.backoff * 2, MAX_BACKOFF);
    ds.next = Date.now() + ds.backoff;
    this.states.set(id, ds);
  }
  /** Discovery saw peers (maybe at a new address) – retry them right away. */
  discovered(ids) {
    for (const id of ids) {
      const ds = this.states.get(id);
      if (ds && !ds.inFlight) ds.next = 0;
    }
  }
  wanted(id) {
    const state = this.d.stateOf(id);
    return state === "accepted" || state === "outgoing" || state !== "blocked" && (this.d.alsoWants?.(id) ?? false);
  }
  wantsConnection(id) {
    return !this.d.network.isOnline(id) && this.wanted(id);
  }
  /** Dials, and asks the peer to dial us too – whichever direction the firewalls allow wins. */
  connect(id) {
    this.tryDial(id);
    this.d.discovery()?.callMe(id);
  }
  /** A peer asked us to connect to them, e.g. because they sent us a request but can't reach us. */
  onCallback(id) {
    if (this.d.network.isOnline(id) || this.d.stateOf(id) === "blocked") return;
    const now = Date.now();
    if (!this.callbacks.has(id)) {
      this.callbackTimes = this.callbackTimes.filter((t) => now - t < 6e4);
      if (this.callbackTimes.length >= MAX_CALLBACKS_PER_MINUTE) return;
      this.callbackTimes.push(now);
    }
    this.callbacks.set(id, now);
    this.tryDial(id);
  }
  loop() {
    for (const id of this.d.candidates()) this.tryDial(id);
    const now = Date.now();
    for (const [id, at] of this.callbacks) {
      if (now - at >= CALLBACK_TTL) this.callbacks.delete(id);
      else this.tryDial(id);
    }
  }
  target(id) {
    const p = this.d.discovery()?.find(id);
    if (p) return { ip: p.ip, port: p.port, discovered: true };
    const last = this.d.lastAddress(id);
    return last ? { ...last, discovered: false } : null;
  }
  tryDial(id) {
    const { network } = this.d;
    if (network.isOnline(id) || this.relinking.get(id)?.isOpen) return;
    const state = this.d.stateOf(id);
    const now = Date.now();
    const calledBack = state !== "blocked" && now - (this.callbacks.get(id) ?? -Infinity) < CALLBACK_TTL;
    if (!this.wanted(id) && !calledBack) return;
    const t = this.target(id);
    if (!t) return;
    const ds = this.states.get(id) ?? { inFlight: false, next: 0, backoff: 1e3 };
    this.states.set(id, ds);
    if (ds.inFlight || now < ds.next) return;
    if (t.discovered && !calledBack && state !== "outgoing" && this.d.myId > id) {
      ds.deferredSince ??= now;
      if (now - ds.deferredSince < 4e3) return;
    }
    ds.inFlight = true;
    network.dial(t.ip, t.port, id).then((s) => {
      this.states.delete(id);
      if (s.peerId !== id) this.relinking.set(id, s);
    }).catch((err) => {
      this.d.log(`Connection to ${id} (${t.ip}:${t.port}) failed: ${err.message}`);
      ds.backoff = Math.min(ds.backoff * 2, t.discovered ? MAX_BACKOFF_NEARBY : MAX_BACKOFF);
      ds.next = Date.now() + ds.backoff;
      ds.failures = (ds.failures ?? 0) + 1;
      const s = this.d.stateOf(id);
      const waiting = s === "outgoing" || s === "accepted";
      if (waiting && t.discovered && ds.failures >= 3 && !network.isOnline(id) && !this.warned.has(id)) {
        this.warned.add(id);
        this.d.unreachable(id, { ip: t.ip, port: t.port, error: err.message });
      }
    }).finally(() => {
      ds.inFlight = false;
    });
  }
};

// ../termcore/src/net/discovery.ts
import dgram from "dgram";
import os6 from "os";
import { EventEmitter as EventEmitter2 } from "events";
var ANNOUNCE_INTERVAL = 3e3;
var EXPIRE_AFTER = 1e4;
var IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
var MAX_PACKET = 2048;
var HINT_INTERVAL = 15e3;
var REPROBE_AFTER = 3e4;
var MAX_GOSSIP = 32;
var MAX_WAS = 4;
var SCAN_BATCH = 5;
var SCAN_TICK = 50;
var MIN_SCAN_PREFIX = 16;
var RESCAN_ALONE = 10 * 6e4;
function localIPv4s() {
  const out = [];
  for (const addrs of Object.values(os6.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      const ip = a.address.split(".").map(Number);
      const mask = a.netmask.split(".").map(Number);
      const broadcast = ip.map((b, i) => (b | ~mask[i] & 255) & 255).join(".");
      out.push({ address: a.address, netmask: a.netmask, broadcast });
    }
  }
  return out;
}
var toInt = (ip) => ip.split(".").reduce((n, b) => n * 256 + Number(b), 0);
var toIp = (n) => [n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255].join(".");
function prefixLength(netmask) {
  let n = toInt(netmask);
  let bits = 0;
  while (n & 2147483648) {
    bits++;
    n = n << 1 >>> 0;
  }
  return bits;
}
function isPrivate(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 172 && b >= 16 && b < 32 || a === 192 && b === 168 || a === 100 && b >= 64 && b < 128;
}
function* scanOrder(ifaces) {
  const ranges = ifaces.flatMap((i) => {
    const prefix = prefixLength(i.netmask);
    if (prefix > 30 || i.address.startsWith("169.254.")) return [];
    const mask = prefix < MIN_SCAN_PREFIX ? 4294901760 : toInt(i.netmask);
    const ip = toInt(i.address);
    const net4 = (ip & mask) >>> 0;
    const broadcast = (net4 | ~mask >>> 0) >>> 0;
    return [{ ip, net: net4, broadcast }];
  });
  const gens = ranges.map(function* ({ ip, net: net4, broadcast }) {
    for (let d = 1; ip + d < broadcast || ip - d > net4; d++) {
      if (ip + d < broadcast) yield toIp(ip + d);
      if (ip - d > net4) yield toIp(ip - d);
    }
  });
  const seen = /* @__PURE__ */ new Set();
  while (gens.length) {
    for (let i = 0; i < gens.length; i++) {
      const r = gens[i].next();
      if (r.done) gens.splice(i--, 1);
      else if (!seen.has(r.value)) {
        seen.add(r.value);
        yield r.value;
      }
    }
  }
}
function udpTransport(port) {
  return ({ onMessage, onError, onReady }) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let bound = false;
    socket.on("error", (err) => {
      if (!bound) onError(err);
    });
    socket.on("message", (buf, rinfo) => onMessage(buf, rinfo.address));
    socket.bind(port, () => {
      bound = true;
      try {
        socket.setBroadcast(true);
      } catch {
      }
      onReady();
    });
    return {
      send(buf, address, to = port) {
        try {
          socket.send(buf, to, address, () => {
          });
        } catch {
        }
      },
      close() {
        try {
          socket.close();
        } catch {
        }
      }
    };
  };
}
function parseApps(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return void 0;
  const out = {};
  for (const [k, p] of Object.entries(v)) {
    if (isSuiteApp(k) && Number.isInteger(p) && p > 0 && p < 65536) out[k] = p;
  }
  return Object.keys(out).length ? out : void 0;
}
function parseWas(v, own) {
  if (!Array.isArray(v)) return void 0;
  const out = v.slice(0, MAX_WAS).filter((x) => typeof x === "string" && PEER_ID_RE.test(x) && x !== own);
  return out.length ? out : void 0;
}
var sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
var Discovery = class extends EventEmitter2 {
  constructor(myId, getName, getPort, opts) {
    super();
    this.myId = myId;
    this.getName = getName;
    this.getPort = getPort;
    this.opts = opts;
    this.listApps = new Set(opts.listApps ?? [opts.app]);
    this.udpPort = opts.udpPort ?? SUITE[opts.app].udpPort;
  }
  transport = null;
  timer = null;
  scanTimer = null;
  scanQueue = null;
  lastScanEnd = 0;
  lastHints = 0;
  netSignature = "";
  /** address → when we last asked it directly */
  probed = /* @__PURE__ */ new Map();
  peers = /* @__PURE__ */ new Map();
  listApps;
  udpPort;
  /** True while the own subnet is being scanned. */
  get scanning() {
    return this.scanQueue !== null;
  }
  start() {
    const open = this.opts.transport ?? udpTransport(this.udpPort);
    this.transport = open({
      onMessage: (buf, address) => this.onMessage(buf, address),
      onError: (err) => {
        this.emit("log", `Discovery unavailable: ${err.message}`);
        this.stop();
      },
      onReady: () => {
        this.netSignature = this.signature();
        this.announce(true);
        this.probeHints();
        this.startScan();
        this.timer = setInterval(() => this.tick(), ANNOUNCE_INTERVAL);
        this.timer.unref();
      }
    });
  }
  /** The peer that is (or used to be, see `was`) `id`. */
  find(id) {
    const direct = this.peers.get(id);
    if (direct) return direct;
    for (const p of this.peers.values()) if (p.was?.includes(id)) return p;
    return void 0;
  }
  /** Re-announce immediately, e.g. after a name change. */
  announce(query) {
    const msg = this.message(query);
    for (const target of /* @__PURE__ */ new Set(["255.255.255.255", ...this.interfaces().map((i) => i.broadcast)])) this.sendTo(msg, target);
    for (const p of this.peers.values()) {
      const m = p.app === this.opts.app ? msg : { ...msg, q: 1 };
      this.sendTo(this.opts.wants?.(p.id) ? { ...m, c: 1 } : m, p.ip, p.app);
    }
  }
  /** Asks a peer right away to connect to us (e.g. after sending them a request). */
  callMe(id) {
    const p = this.find(id);
    if (p) this.sendTo({ ...this.message(false), c: 1 }, p.ip, p.app);
  }
  tick() {
    const now = Date.now();
    const signature = this.signature();
    if (signature !== this.netSignature) {
      this.netSignature = signature;
      this.emit("log", "Network changed \u2013 searching again");
      this.probed.clear();
      this.announce(true);
      this.probeHints();
      this.startScan();
    } else {
      this.announce(false);
      if (now - this.lastHints >= HINT_INTERVAL) this.probeHints();
      if (!this.scanQueue && this.peers.size === 0 && now - this.lastScanEnd >= RESCAN_ALONE) this.startScan();
    }
    for (const [ip, at] of this.probed) if (now - at >= REPROBE_AFTER) this.probed.delete(ip);
    this.expire();
  }
  message(query) {
    const msg = { app: this.opts.app, v: 1, id: this.myId, name: this.getName(), port: this.getPort() };
    if (query) msg.q = 1;
    const ips = [...new Set([...this.peers.values()].map((p) => p.ip))].slice(0, MAX_GOSSIP);
    if (ips.length) msg.ips = ips;
    const apps = this.opts.apps?.();
    if (apps && Object.keys(apps).length) msg.apps = apps;
    const was = this.opts.was?.().slice(0, MAX_WAS);
    if (was?.length) msg.was = was;
    return msg;
  }
  /**
   * Sends to `address` on the port of `app` (default: ours). Queries to other apps' ports ask
   * for the answer on ours (`rp`).
   */
  sendTo(msg, address, app = this.opts.app, port) {
    const to = port ?? (app === this.opts.app ? this.udpPort : SUITE[app].udpPort);
    const out = to === this.udpPort ? msg : { ...msg, rp: this.udpPort };
    this.transport?.send(Buffer.from(JSON.stringify(out)), address, to);
  }
  /** Sends a query to `address` on our port and on every port in `alsoAsk`. */
  query(address) {
    const msg = this.message(true);
    this.sendTo(msg, address);
    for (const other of this.opts.alsoAsk ?? []) this.sendTo(msg, address, other.app, other.udpPort);
  }
  interfaces() {
    return this.opts.interfaces?.() ?? localIPv4s();
  }
  signature() {
    return this.interfaces().map((i) => `${i.address}/${i.netmask}`).sort().join(",");
  }
  /** Asks one address directly whether the app runs there (at most every 30 s). */
  probe(ip) {
    if (!IPV4_RE.test(ip) || this.interfaces().some((i) => i.address === ip)) return;
    for (const p of this.peers.values()) if (p.ip === ip) return;
    const last = this.probed.get(ip);
    if (last !== void 0 && Date.now() - last < REPROBE_AFTER) return;
    this.probed.set(ip, Date.now());
    this.query(ip);
  }
  probeHints() {
    this.lastHints = Date.now();
    for (const ip of this.opts.hints?.() ?? []) this.probe(ip);
    if (this.opts.alsoAsk?.length) {
      const msg = this.message(true);
      for (const target of /* @__PURE__ */ new Set(["255.255.255.255", ...this.interfaces().map((i) => i.broadcast)])) {
        for (const other of this.opts.alsoAsk) this.sendTo(msg, target, other.app, other.udpPort);
      }
    }
  }
  startScan() {
    this.scanQueue = scanOrder(this.interfaces());
    if (!this.scanTimer) {
      this.scanTimer = setInterval(() => this.scanStep(), SCAN_TICK);
      this.scanTimer.unref();
    }
    this.emit("change");
  }
  scanStep() {
    const known = new Set([...this.peers.values()].map((p) => p.ip));
    for (let sent = 0; sent < SCAN_BATCH; ) {
      const next = this.scanQueue?.next();
      if (!next || next.done) {
        this.scanQueue = null;
        this.lastScanEnd = Date.now();
        if (this.scanTimer) clearInterval(this.scanTimer);
        this.scanTimer = null;
        this.emit("change");
        return;
      }
      if (known.has(next.value)) continue;
      this.query(next.value);
      sent++;
    }
  }
  onMessage(buf, address) {
    if (buf.length > MAX_PACKET) return;
    let msg;
    try {
      msg = JSON.parse(buf.toString("utf8"));
    } catch {
      return;
    }
    if (!msg || !isSuiteApp(msg.app) || msg.v !== 1 || typeof msg.id !== "string" || !PEER_ID_RE.test(msg.id)) return;
    if (msg.id === this.myId) return;
    const port = Number(msg.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return;
    const rp = Number.isInteger(msg.rp) && msg.rp >= 1024 && msg.rp <= 65535 ? msg.rp : void 0;
    if (!this.listApps.has(msg.app)) {
      if (msg.q && rp) this.sendTo(this.message(false), address, this.opts.app, rp);
      return;
    }
    const prev = this.peers.get(msg.id);
    const apps = parseApps(msg.apps);
    const was = parseWas(msg.was, msg.id);
    const peer = {
      id: msg.id,
      name: cleanName(msg.name),
      ip: address,
      port,
      lastSeen: Date.now(),
      app: msg.app,
      ...apps ? { apps } : {},
      ...was ? { was } : {}
    };
    this.peers.set(msg.id, peer);
    if (!prev || prev.ip !== peer.ip || prev.port !== peer.port || prev.name !== peer.name || prev.app !== peer.app || !sameJson(prev.apps, peer.apps) || !sameJson(prev.was, peer.was)) {
      this.emit("change");
    }
    if (msg.q) this.sendTo(this.message(false), address, msg.app, rp);
    if (msg.c === 1) this.emit("callback", msg.id);
    if (Array.isArray(msg.ips)) {
      const subnets = this.interfaces().map((i) => ({ net: toInt(i.address) & toInt(i.netmask), mask: toInt(i.netmask) }));
      const nearby = (ip) => isPrivate(ip) || subnets.some((s) => (toInt(ip) & s.mask) === s.net);
      for (const ip of msg.ips.slice(0, MAX_GOSSIP)) {
        if (typeof ip === "string" && IPV4_RE.test(ip) && nearby(ip)) this.probe(ip);
      }
    }
  }
  expire() {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of this.peers) {
      if (now - p.lastSeen > EXPIRE_AFTER) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit("change");
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.scanTimer) clearInterval(this.scanTimer);
    this.timer = null;
    this.scanTimer = null;
    this.scanQueue = null;
    this.transport?.close();
    this.transport = null;
  }
};

// ../termcore/src/net/network.ts
import net3 from "net";
import { EventEmitter as EventEmitter5 } from "events";

// ../termcore/src/net/framing.ts
import { EventEmitter as EventEmitter3 } from "events";
var MAX_FRAME = 64 * 1024;
var FrameTooLargeError = class extends Error {
  constructor(size) {
    super(`Frame too large (${size} bytes)`);
  }
};
function encodeFrame(payload2) {
  if (payload2.length > MAX_FRAME) throw new FrameTooLargeError(payload2.length);
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(payload2.length, 0);
  return Buffer.concat([header, payload2]);
}
var FrameDecoder = class {
  buffer = Buffer.alloc(0);
  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const frames = [];
    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32BE(0);
      if (len > MAX_FRAME) throw new FrameTooLargeError(len);
      if (this.buffer.length < 4 + len) break;
      frames.push(Buffer.from(this.buffer.subarray(4, 4 + len)));
      this.buffer = this.buffer.subarray(4 + len);
    }
    return frames;
  }
};
var FrameSocket = class extends EventEmitter3 {
  constructor(socket) {
    super();
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on("data", (chunk) => {
      let frames;
      try {
        frames = this.decoder.push(chunk);
      } catch (err) {
        this.destroy(err);
        return;
      }
      for (const f of frames) this.deliver(f);
    });
    socket.on("error", (err) => this.finish(err));
    socket.on("close", () => this.finish(void 0));
  }
  decoder = new FrameDecoder();
  queue = [];
  waiter = null;
  streaming = false;
  closed = false;
  closeError;
  get isClosed() {
    return this.closed;
  }
  get remoteAddress() {
    return (this.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  }
  deliver(frame) {
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.resolve(frame);
    } else if (this.streaming) {
      this.emit("frame", frame);
    } else {
      this.queue.push(frame);
    }
  }
  read(timeoutMs) {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.closed) return Promise.reject(this.closeError ?? new Error("Connection closed"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new Error("Handshake timed out"));
      }, timeoutMs);
      this.waiter = {
        resolve: (f) => {
          clearTimeout(timer);
          resolve(f);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        }
      };
    });
  }
  /** From now on, frames are delivered as events (including already buffered ones). */
  startStreaming() {
    this.streaming = true;
    const pending = this.queue;
    this.queue = [];
    for (const f of pending) this.emit("frame", f);
  }
  send(payload2) {
    if (this.closed) return false;
    this.socket.write(encodeFrame(payload2));
    return true;
  }
  /**
   * Like send(), for bulk data: header and payload go out without being copied together, and
   * the result is the socket's backpressure signal – `false` means wait for drained().
   */
  write(payload2) {
    if (this.closed) return false;
    if (payload2.length > MAX_FRAME) throw new FrameTooLargeError(payload2.length);
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(payload2.length, 0);
    this.socket.cork();
    this.socket.write(header);
    const ok = this.socket.write(payload2);
    this.socket.uncork();
    return ok;
  }
  /** Resolves once the socket's send buffer has room again (or the connection is gone). */
  drained() {
    if (this.closed || !this.socket.writableNeedDrain) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        this.socket.off("drain", done);
        this.off("close", done);
        resolve();
      };
      this.socket.on("drain", done);
      this.on("close", done);
    });
  }
  /** Stops reading from the socket (the receiver's disk can't keep up). */
  pause() {
    this.socket.pause();
  }
  resume() {
    if (!this.closed) this.socket.resume();
  }
  /** Graceful close: buffered data is still sent. */
  end() {
    if (!this.closed) this.socket.end();
  }
  destroy(err) {
    this.socket.destroy();
    this.finish(err);
  }
  finish(err) {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.closeError = err;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.reject(err ?? new Error("Connection closed"));
    }
    this.emit("close", err);
  }
};

// ../termcore/src/net/handshake.ts
import crypto4 from "crypto";

// ../termcore/src/net/channel.ts
import crypto3 from "crypto";
var TAG_LEN = 16;
var CipherState = class {
  constructor(key) {
    this.key = key;
    if (key.length !== 32) throw new Error("Key must be 32 bytes");
  }
  counter = 0n;
  nextNonce() {
    const nonce = Buffer.alloc(12);
    nonce.writeBigUInt64BE(this.counter, 4);
    this.counter++;
    return nonce;
  }
  encrypt(plain) {
    const cipher = crypto3.createCipheriv("chacha20-poly1305", this.key, this.nextNonce(), { authTagLength: TAG_LEN });
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([body, cipher.getAuthTag()]);
  }
  /** Throws if the frame is not authentic. */
  decrypt(frame) {
    if (frame.length < TAG_LEN) throw new Error("Frame too short");
    const decipher = crypto3.createDecipheriv("chacha20-poly1305", this.key, this.nextNonce(), {
      authTagLength: TAG_LEN
    });
    decipher.setAuthTag(frame.subarray(frame.length - TAG_LEN));
    return Buffer.concat([decipher.update(frame.subarray(0, frame.length - TAG_LEN)), decipher.final()]);
  }
};

// ../termcore/src/net/handshake.ts
var HANDSHAKE_TIMEOUT = 5e3;
var XID_RE = /^[A-Za-z0-9_-]{12,32}$/;
var HandshakeError = class extends Error {
};
function parseHello(frame, protocol) {
  let obj;
  try {
    obj = JSON.parse(frame.toString("utf8"));
  } catch {
    throw new HandshakeError("Invalid handshake");
  }
  const o = obj;
  if (o?.t !== "hello" || o.p !== protocol || typeof o.eph !== "string" || typeof o.nonce !== "string") {
    throw new HandshakeError(`Not a ${protocol.split("/")[0]} peer or incompatible version`);
  }
  const eph = Buffer.from(o.eph, "base64url");
  const nonce = Buffer.from(o.nonce, "base64url");
  if (eph.length !== 32 || nonce.length !== 16) throw new HandshakeError("Invalid handshake");
  return { eph, nonce };
}
function authPayload(protocol, role, transcript) {
  return Buffer.concat([Buffer.from(`${protocol} auth ${role}`), transcript]);
}
async function performHandshake(fs20, opts) {
  const { protocol, me, myName, initiator, xid } = opts;
  const timeoutMs = opts.timeoutMs ?? HANDSHAKE_TIMEOUT;
  const { privateKey: ephPriv, publicKey: ephPub } = crypto4.generateKeyPairSync("x25519");
  const ephRaw = Buffer.from(ephPub.export({ format: "jwk" }).x, "base64url");
  const nonce = crypto4.randomBytes(16);
  fs20.send(
    Buffer.from(
      JSON.stringify({ t: "hello", p: protocol, eph: ephRaw.toString("base64url"), nonce: nonce.toString("base64url") })
    )
  );
  const peer = parseHello(await fs20.read(timeoutMs), protocol);
  if (peer.eph.equals(ephRaw)) throw new HandshakeError("Reflected handshake");
  const [i, r] = initiator ? [{ eph: ephRaw, nonce }, peer] : [peer, { eph: ephRaw, nonce }];
  const transcript = crypto4.createHash("sha256").update(protocol).update(i.eph).update(i.nonce).update(r.eph).update(r.nonce).digest();
  let shared;
  try {
    const peerEphKey = crypto4.createPublicKey({
      key: { kty: "OKP", crv: "X25519", x: peer.eph.toString("base64url") },
      format: "jwk"
    });
    shared = crypto4.diffieHellman({ privateKey: ephPriv, publicKey: peerEphKey });
  } catch {
    throw new HandshakeError("Invalid key");
  }
  if (shared.every((b) => b === 0)) throw new HandshakeError("Invalid key");
  const okm = Buffer.from(crypto4.hkdfSync("sha256", shared, transcript, `${protocol} keys`, 64));
  const i2r = okm.subarray(0, 32);
  const r2i = okm.subarray(32, 64);
  const send = new CipherState(initiator ? i2r : r2i);
  const recv = new CipherState(initiator ? r2i : i2r);
  const myRole = initiator ? "I" : "R";
  const peerRole = initiator ? "R" : "I";
  const sig = crypto4.sign(null, authPayload(protocol, myRole, transcript), me.privateKey);
  fs20.send(
    send.encrypt(
      Buffer.from(
        JSON.stringify({
          pub: me.publicRaw.toString("base64url"),
          name: myName,
          sig: sig.toString("base64url"),
          ...initiator && xid ? { x: xid } : {}
        })
      )
    )
  );
  let auth;
  try {
    auth = JSON.parse(recv.decrypt(await fs20.read(timeoutMs)).toString("utf8"));
  } catch (err) {
    if (err instanceof Error && /timed out|closed/.test(err.message)) throw err;
    throw new HandshakeError("Authentication failed");
  }
  if (typeof auth.pub !== "string" || typeof auth.sig !== "string") {
    throw new HandshakeError("Authentication failed");
  }
  const peerPublicRaw = Buffer.from(auth.pub, "base64url");
  if (peerPublicRaw.length !== 32) throw new HandshakeError("Invalid identity key");
  let valid = false;
  try {
    valid = crypto4.verify(
      null,
      authPayload(protocol, peerRole, transcript),
      publicKeyFromRaw(peerPublicRaw),
      Buffer.from(auth.sig, "base64url")
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new HandshakeError("Invalid signature");
  const peerId = fingerprint(peerPublicRaw);
  if (peerId === me.id) throw new HandshakeError("Cannot connect to yourself");
  let peerXid;
  if (auth.x !== void 0) {
    if (initiator || typeof auth.x !== "string" || !XID_RE.test(auth.x)) throw new HandshakeError("Invalid transfer id");
    peerXid = auth.x;
  }
  return { peerId, peerPublicRaw, peerName: cleanName(auth.name), send, recv, ...peerXid ? { xid: peerXid } : {} };
}

// ../termcore/src/net/peer.ts
import { EventEmitter as EventEmitter4 } from "events";
var PING_INTERVAL = 15e3;
var IDLE_TIMEOUT = 45e3;
var RATE_WINDOW = 1e3;
var RATE_MAX = 200;
var Session = class extends EventEmitter4 {
  constructor(fs20, hs, initiator, parse, tag, expected) {
    super();
    this.fs = fs20;
    this.hs = hs;
    this.initiator = initiator;
    this.parse = parse;
    this.tag = tag;
    this.expected = expected;
    this.peerId = hs.peerId;
    this.peerPublicRaw = hs.peerPublicRaw;
    this.peerName = hs.peerName;
    fs20.on("frame", (frame) => this.onFrame(frame));
    fs20.on("close", (err) => this.finish(err ? err.message : "Connection closed"));
    this.timer = setInterval(() => this.tick(), PING_INTERVAL / 3);
    this.timer.unref();
  }
  peerId;
  peerPublicRaw;
  peerName;
  openedAt = Date.now();
  lastActivity = Date.now();
  rateCount = 0;
  rateStart = Date.now();
  timer;
  closed = false;
  /** Call only once all listeners are attached – otherwise early frames are lost. */
  start() {
    this.fs.startStreaming();
  }
  get remoteAddress() {
    return this.fs.remoteAddress;
  }
  /** The other side's port – for a connection we opened, the port they listen on. */
  get remotePort() {
    return this.fs.socket.remotePort ?? 0;
  }
  get isOpen() {
    return !this.closed;
  }
  send(msg) {
    if (this.closed) return false;
    return this.fs.send(this.hs.send.encrypt(Buffer.from(JSON.stringify(msg), "utf8")));
  }
  close(reason = "Connection closed", graceful = true) {
    if (this.closed) return;
    if (graceful) {
      this.send({ t: "bye" });
      this.fs.end();
      setTimeout(() => this.fs.destroy(), 1e3).unref();
    } else {
      this.fs.destroy();
    }
    this.finish(reason);
  }
  onFrame(frame) {
    if (this.closed) return;
    const now = Date.now();
    if (now - this.rateStart > RATE_WINDOW) {
      this.rateStart = now;
      this.rateCount = 0;
    }
    if (++this.rateCount > RATE_MAX) {
      this.close("Peer is sending too much data", false);
      return;
    }
    let plain;
    try {
      plain = this.hs.recv.decrypt(frame);
    } catch {
      this.close("Received tampered data", false);
      return;
    }
    this.lastActivity = now;
    const msg = this.parse(plain);
    if (!msg) return;
    if (msg.t === "ping") {
      this.send({ t: "pong" });
      return;
    }
    if (msg.t === "pong") return;
    if (msg.t === "bye") {
      this.close("Peer closed the connection", false);
      return;
    }
    this.emit("message", msg);
  }
  tick() {
    const idle = Date.now() - this.lastActivity;
    if (idle > IDLE_TIMEOUT) this.close("Timed out", false);
    else if (idle > PING_INTERVAL) this.send({ t: "ping" });
  }
  finish(reason) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    this.emit("close", reason);
  }
};

// ../termcore/src/net/network.ts
var MAX_PENDING_HANDSHAKES = 32;
var DIAL_TIMEOUT = 4e3;
var Network = class extends EventEmitter5 {
  constructor(opts) {
    super();
    this.opts = opts;
  }
  server = null;
  pendingHandshakes = 0;
  sessions = /* @__PURE__ */ new Map();
  port = 0;
  get me() {
    return this.opts.me;
  }
  /** Listens on the preferred port, or on a free one if it's taken. */
  async start(preferredPort) {
    const tryListen = (port) => new Promise((resolve, reject) => {
      const server = net3.createServer((socket) => this.onIncoming(socket));
      server.once("error", reject);
      server.listen(port, "0.0.0.0", () => {
        server.off("error", reject);
        resolve(server);
      });
    });
    try {
      this.server = await tryListen(preferredPort);
    } catch (err) {
      if (err.code !== "EADDRINUSE") throw err;
      this.emit("log", `Port ${preferredPort} in use, using a free port`);
      this.server = await tryListen(0);
    }
    this.server.on("error", (err) => this.emit("log", `Server error: ${err.message}`));
    this.port = this.server.address().port;
    return this.port;
  }
  isOnline(id) {
    return this.sessions.get(id)?.isOpen ?? false;
  }
  get(id) {
    return this.sessions.get(id);
  }
  handshake(fs20, initiator, xid) {
    return performHandshake(fs20, { protocol: this.opts.protocol, me: this.opts.me, myName: this.opts.getName(), initiator, xid });
  }
  /**
   * Opens a connection. With `expectedId`, verifies that this exact peer is on the
   * other end – otherwise disconnects immediately (unless acceptMismatch says otherwise).
   */
  async dial(host, port, expectedId, tag) {
    const fs20 = new FrameSocket(await this.connect(host, port));
    try {
      const hs = await this.handshake(fs20, true);
      let expected;
      if (expectedId && hs.peerId !== expectedId) {
        if (!this.opts.acceptMismatch?.(expectedId, hs.peerId)) throw new HandshakeError("Someone else is now reachable at this address");
        expected = expectedId;
      }
      return this.register(new Session(fs20, hs, true, this.opts.parse, tag, expected));
    } catch (err) {
      fs20.destroy();
      throw err;
    }
  }
  /** Opens a connection for one purpose (`xid`) to exactly this peer. */
  async dialPurpose(host, port, expectedId, xid) {
    const fs20 = new FrameSocket(await this.connect(host, port));
    try {
      const hs = await this.handshake(fs20, true, xid);
      if (hs.peerId !== expectedId) throw new HandshakeError("Someone else is now reachable at this address");
      return { fs: fs20, hs, xid };
    } catch (err) {
      fs20.destroy();
      throw err;
    }
  }
  connect(host, port) {
    return new Promise((resolve, reject) => {
      const s = net3.connect({ host, port });
      const timer = setTimeout(() => {
        s.destroy();
        reject(new Error("Connection timed out"));
      }, DIAL_TIMEOUT);
      s.once("connect", () => {
        clearTimeout(timer);
        s.removeAllListeners("error");
        resolve(s);
      });
      s.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
  async onIncoming(socket) {
    if (this.pendingHandshakes >= MAX_PENDING_HANDSHAKES) {
      socket.destroy();
      return;
    }
    this.pendingHandshakes++;
    const fs20 = new FrameSocket(socket);
    try {
      const hs = await this.handshake(fs20, false);
      if (hs.xid) {
        if (!this.emit("purpose", { fs: fs20, hs, xid: hs.xid })) fs20.destroy();
      } else {
        this.register(new Session(fs20, hs, false, this.opts.parse));
      }
    } catch (err) {
      this.emit("log", `Rejected incoming connection from ${fs20.remoteAddress}: ${err.message}`);
      fs20.destroy();
    } finally {
      this.pendingHandshakes--;
    }
  }
  /**
   * If both sides connect at the same time, the connection opened by the peer with
   * the smaller ID wins. Both sides independently reach the same result.
   */
  register(session) {
    const me = this.opts.me.id;
    const existing = this.sessions.get(session.peerId);
    if (existing?.isOpen) {
      const winner = me < session.peerId ? me : session.peerId;
      const initiatorOf = (s) => s.initiator ? me : s.peerId;
      const keepExisting = initiatorOf(existing) === winner && initiatorOf(session) !== winner;
      if (keepExisting) {
        session.close("Duplicate connection", false);
        return existing;
      }
      this.sessions.set(session.peerId, session);
      existing.close("Duplicate connection", false);
    } else {
      this.sessions.set(session.peerId, session);
    }
    session.on("close", (reason) => {
      if (this.sessions.get(session.peerId) === session) {
        this.sessions.delete(session.peerId);
        this.emit("offline", session.peerId, reason);
      }
    });
    this.emit("session", session);
    session.start();
    return session;
  }
  disconnect(id) {
    this.sessions.get(id)?.close();
  }
  async stop() {
    for (const s of this.sessions.values()) s.close("App closed");
    await new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      setTimeout(resolve, 1500).unref();
    });
    this.server = null;
  }
};

// ../termcore/src/store/hub.ts
import fs10 from "fs";
import path16 from "path";

// ../termcore/src/friends/links.ts
import crypto5 from "crypto";
var B64_KEY_RE = /^[A-Za-z0-9_-]{43}$/;
var B64_SIG_RE = /^[A-Za-z0-9_-]{86}$/;
var MAX_LINKS = 8;
function payload(old, next, ts) {
  return Buffer.from(`termhub/link/1
${old}
${next}
${ts}`);
}
function createLink(oldId, newId, ts = Date.now()) {
  const old = oldId.publicRaw.toString("base64url");
  const next = newId.publicRaw.toString("base64url");
  const p = payload(old, next, ts);
  return {
    v: 1,
    old,
    new: next,
    ts,
    so: crypto5.sign(null, p, oldId.privateKey).toString("base64url"),
    sn: crypto5.sign(null, p, newId.privateKey).toString("base64url")
  };
}
function parseLink(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || o.v !== 1) return null;
  if (typeof o.old !== "string" || !B64_KEY_RE.test(o.old) || typeof o.new !== "string" || !B64_KEY_RE.test(o.new)) return null;
  if (o.old === o.new) return null;
  if (typeof o.so !== "string" || !B64_SIG_RE.test(o.so) || typeof o.sn !== "string" || !B64_SIG_RE.test(o.sn)) return null;
  if (typeof o.ts !== "number" || !Number.isSafeInteger(o.ts) || o.ts < 0) return null;
  return { v: 1, old: o.old, new: o.new, ts: o.ts, so: o.so, sn: o.sn };
}
function verifyLink(link) {
  try {
    const p = payload(link.old, link.new, link.ts);
    const oldKey = Buffer.from(link.old, "base64url");
    const newKey = Buffer.from(link.new, "base64url");
    if (oldKey.length !== 32 || newKey.length !== 32) return false;
    return crypto5.verify(null, p, publicKeyFromRaw(oldKey), Buffer.from(link.so, "base64url")) && crypto5.verify(null, p, publicKeyFromRaw(newKey), Buffer.from(link.sn, "base64url"));
  } catch {
    return false;
  }
}
var linkOldId = (l) => fingerprint(Buffer.from(l.old, "base64url"));
var linkNewId = (l) => fingerprint(Buffer.from(l.new, "base64url"));
function resolveId(id, byOld) {
  const seen = /* @__PURE__ */ new Set();
  let cur = id;
  while (byOld.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = byOld.get(cur);
  }
  return cur;
}

// ../termcore/src/store/files.ts
var ANIMATIONS = ["nonstop", "brief", "off"];
var num = (v) => typeof v === "number" && Number.isFinite(v) ? v : void 0;
var IPV4_RE2 = /^\d{1,3}(\.\d{1,3}){3}$/;
function parsePorts(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return void 0;
  const out = {};
  for (const [k, p] of Object.entries(v)) {
    if (isSuiteApp(k) && Number.isInteger(p) && p > 0 && p < 65536) out[k] = p;
  }
  return Object.keys(out).length ? out : void 0;
}
function parseApps2(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return void 0;
  const out = {};
  for (const [k, fields] of Object.entries(v)) {
    if (isSuiteApp(k) && fields && typeof fields === "object" && !Array.isArray(fields) && Object.keys(fields).length) {
      out[k] = fields;
    }
  }
  return Object.keys(out).length ? out : void 0;
}
function compact(o) {
  for (const k of Object.keys(o)) if (o[k] === void 0) delete o[k];
  return o;
}
function parseFriend(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || typeof o.id !== "string" || !PEER_ID_RE.test(o.id)) return null;
  if (!CONTACT_STATES.includes(o.state)) return null;
  const now = Date.now();
  return compact({
    id: o.id,
    publicKey: typeof o.publicKey === "string" ? o.publicKey : "",
    name: cleanName(o.name),
    alias: typeof o.alias === "string" && o.alias.trim() ? cleanName(o.alias) : void 0,
    state: o.state,
    color: normalizeColor(o.color) ?? void 0,
    lastIp: typeof o.lastIp === "string" && IPV4_RE2.test(o.lastIp) ? o.lastIp : void 0,
    ports: parsePorts(o.ports),
    lastSeen: num(o.lastSeen),
    lastActivity: num(o.lastActivity) ?? now,
    createdAt: num(o.createdAt) ?? now,
    apps: parseApps2(o.apps)
  });
}
function parseKnownPeer(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || typeof o.id !== "string" || !PEER_ID_RE.test(o.id)) return null;
  return compact({
    id: o.id,
    name: cleanName(o.name),
    lastIp: typeof o.lastIp === "string" && IPV4_RE2.test(o.lastIp) ? o.lastIp : void 0,
    ports: parsePorts(o.ports),
    lastSeen: num(o.lastSeen)
  });
}
function uniqueById(list) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const e of list) {
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}
function parseFriendsFile(raw) {
  const list = raw?.friends;
  return { v: 1, friends: Array.isArray(list) ? uniqueById(list.map(parseFriend)) : [] };
}
function parsePeersFile(raw) {
  const list = raw?.peers;
  return { v: 1, peers: Array.isArray(list) ? uniqueById(list.map(parseKnownPeer)) : [] };
}
function parseProfile(raw) {
  const o = raw;
  if (!o || typeof o !== "object" || typeof o.name !== "string" || !o.name.trim()) return null;
  return compact({
    v: 1,
    name: cleanName(o.name),
    color: normalizeColor(o.color) ?? void 0,
    status: isStatus(o.status) ? o.status : "available",
    statusMsg: cleanStatusMsg(o.statusMsg)
  });
}
var DEFAULT_SETTINGS = { v: 1, animations: "brief", notifications: true };
function parseSettings(raw) {
  const o = raw ?? {};
  return compact({
    v: 1,
    accent: normalizeColor(o.accent) ?? void 0,
    animations: ANIMATIONS.includes(o.animations) ? o.animations : DEFAULT_SETTINGS.animations,
    notifications: typeof o.notifications === "boolean" ? o.notifications : DEFAULT_SETTINGS.notifications
  });
}
function parseLinksFile(raw) {
  const o = raw ?? {};
  const links = (v) => Array.isArray(v) ? v.map(parseLink).filter((l) => l !== null) : [];
  return { v: 1, mine: links(o.mine), known: links(o.known) };
}

// ../termcore/src/store/migrate.ts
import crypto6 from "crypto";
import fs8 from "fs";
import path14 from "path";

// ../termcore/src/store/lock.ts
import fs7 from "fs";
import path13 from "path";
var sleepCell = new Int32Array(new SharedArrayBuffer(4));
var sleepSync = (ms) => void Atomics.wait(sleepCell, 0, 0, ms);
function readLock2(file) {
  try {
    const o = JSON.parse(fs7.readFileSync(file, "utf8"));
    return Number.isInteger(o?.pid) && typeof o.ts === "number" && typeof o.token === "string" ? o : null;
  } catch {
    return null;
  }
}
function withLock(lockFile, fn, timings = {}) {
  const timeoutMs = timings.timeoutMs ?? 1e4;
  const staleMs = timings.staleMs ?? 15e3;
  ensureDir(path13.dirname(lockFile));
  const mine = { pid: process.pid, ts: Date.now(), token: Math.random().toString(36).slice(2) };
  const start2 = Date.now();
  let delay = 1;
  for (; ; ) {
    mine.ts = Date.now();
    try {
      fs7.writeFileSync(lockFile, JSON.stringify(mine), { flag: "wx", mode: 384 });
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
    const holder = readLock2(lockFile);
    const stale = holder ? holder.pid !== process.pid && !pidAlive(holder.pid) || Date.now() - holder.ts > staleMs : Date.now() - start2 > 200;
    if (stale) {
      const again = readLock2(lockFile);
      if (!holder || again && again.token === holder.token) {
        try {
          fs7.unlinkSync(lockFile);
        } catch {
        }
      }
      continue;
    }
    if (Date.now() - start2 > timeoutMs) throw new Error(`Timed out waiting for ${path13.basename(lockFile)}`);
    sleepSync(delay);
    delay = Math.min(delay * 2, 25);
  }
  try {
    return fn();
  } finally {
    if (readLock2(lockFile)?.token === mine.token) {
      try {
        fs7.unlinkSync(lockFile);
      } catch {
      }
    }
  }
}

// ../termcore/src/store/migrate.ts
var LEGACY_FILES = ["identity.json", "config.json", "contacts.json", "peers.json"];
var BASE_CONTACT_FIELDS = /* @__PURE__ */ new Set(["id", "publicKey", "name", "alias", "state", "lastIp", "lastPort", "lastSeen", "lastActivity", "createdAt"]);
var lockOf = (paths, file) => path14.join(paths.locksDir, `${path14.basename(file)}.lock`);
var hash = (s) => s === null ? void 0 : crypto6.createHash("sha256").update(s).digest("hex").slice(0, 32);
function readText(file) {
  try {
    return fs8.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}
function parseArray(raw) {
  if (raw === null) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function readLegacy(app, dir) {
  const idRaw = readJson(path14.join(dir, "identity.json"), null);
  const identityFile = isIdentityFile(idRaw) ? idRaw : null;
  let identity = null;
  try {
    identity = identityFile ? identityFromFile(identityFile) : null;
  } catch {
    identity = null;
  }
  let config = null;
  try {
    const c2 = readJson(path14.join(dir, "config.json"), null);
    config = c2 && typeof c2 === "object" ? c2 : null;
  } catch {
    config = null;
  }
  return {
    app,
    dir,
    identityFile: identity ? identityFile : null,
    identity,
    config,
    contactsRaw: readText(path14.join(dir, "contacts.json")),
    peersRaw: readText(path14.join(dir, "peers.json"))
  };
}
function friendFromLegacy(app, raw) {
  const c2 = raw;
  if (!c2 || typeof c2 !== "object") return null;
  const fields = {};
  for (const [k, v] of Object.entries(c2)) {
    if (!BASE_CONTACT_FIELDS.has(k) && v !== void 0 && v !== null && v !== false && v !== 0 && v !== "") fields[k] = v;
  }
  const port = Number(c2.lastPort);
  return parseFriend({
    ...c2,
    ports: Number.isInteger(port) && port > 0 ? { [app]: port } : void 0,
    apps: Object.keys(fields).length ? { [app]: fields } : void 0
  });
}
function peerFromLegacy(app, raw) {
  const c2 = raw;
  if (!c2 || typeof c2 !== "object") return null;
  const port = Number(c2.lastPort);
  return parseKnownPeer({ ...c2, ports: Number.isInteger(port) && port > 0 ? { [app]: port } : void 0 });
}
function mergeInto(map, entries, merge, skip, mapId) {
  for (const e of entries) {
    if (!e) continue;
    const id = mapId(e.id);
    if (skip.has(id)) continue;
    const entry = id === e.id ? e : { ...e, id };
    const prev = map.get(id);
    map.set(id, prev ? merge(prev, entry) : entry);
  }
}
function backup(paths, l, suffix = "") {
  const dest = path14.join(paths.legacyDir, l.app);
  for (const f of LEGACY_FILES) {
    const src = path14.join(l.dir, f);
    if (!fs8.existsSync(src)) continue;
    ensureDir(dest);
    const target = path14.join(dest, suffix ? f.replace(/\.json$/, `.${suffix}.json`) : f);
    if (!suffix && fs8.existsSync(target)) continue;
    fs8.copyFileSync(src, target);
    fs8.chmodSync(target, 384);
  }
}
function migrate(paths) {
  return withLock(path14.join(paths.locksDir, "migration.lock"), () => fs8.existsSync(paths.identity) ? catchUp(paths) : fullMigration(paths), {
    timeoutMs: 6e4,
    staleMs: 12e4
  });
}
function fullMigration(paths) {
  const legacy = LEGACY_APPS.map((app) => readLegacy(app, paths.legacy[app]));
  const masterSrc = legacy.find((l) => l.identity);
  const nothing = { migrated: false, caughtUp: [], master: null, links: 0, friends: 0 };
  if (!masterSrc) return nothing;
  const masterFile = masterSrc.identityFile ?? generateIdentityFile();
  const master = identityFromFile(masterFile);
  const now = Date.now();
  const links = [];
  const myIds = /* @__PURE__ */ new Set([master.id]);
  for (const l of legacy) {
    if (!l.identity) continue;
    myIds.add(l.identity.id);
    if (l.identity.id !== master.id && !links.some((x) => linkOldId(x) === l.identity.id)) links.push(createLink(l.identity, master, now));
  }
  const friends = /* @__PURE__ */ new Map();
  const peers = /* @__PURE__ */ new Map();
  for (const l of legacy) {
    mergeInto(friends, parseArray(l.contactsRaw).map((c2) => friendFromLegacy(l.app, c2)), mergeFriends, myIds, (id) => id);
    mergeInto(peers, parseArray(l.peersRaw).map((p) => peerFromLegacy(l.app, p)), mergePeers, myIds, (id) => id);
  }
  const pick = (get) => {
    for (const l of legacy) {
      const v = get(l);
      if (v !== void 0) return v;
    }
    return void 0;
  };
  const nameRaw = pick((l) => typeof l.config?.name === "string" && l.config.name.trim() ? l.config.name : void 0);
  const name = nameRaw ? cleanName(nameRaw) : void 0;
  const effects = legacy[0]?.config?.effects;
  const settings = {
    v: 1,
    animations: ANIMATIONS.includes(effects) ? effects : "brief",
    notifications: pick((l) => typeof l.config?.notifications === "boolean" ? l.config.notifications : void 0) ?? true
  };
  for (const l of legacy) backup(paths, l);
  ensureDir(paths.dir);
  writeJsonAtomic(paths.friends, parseFriendsFile({ friends: [...friends.values()] }));
  writeJsonAtomic(paths.peers, parsePeersFile({ peers: [...peers.values()] }));
  if (!fs8.existsSync(paths.settings)) writeJsonAtomic(paths.settings, settings);
  writeJsonAtomic(paths.links, { v: 1, mine: links, known: [] });
  if (name) writeJsonAtomic(paths.profile, { v: 1, name, status: "available" });
  const record = {
    v: 1,
    at: now,
    master: { app: masterSrc.app, id: master.id },
    sources: Object.fromEntries(legacy.map((l) => [l.app, sourceOf(l)]))
  };
  writeJsonAtomic(paths.migration, record);
  writeJsonAtomic(paths.identity, masterFile);
  return { migrated: true, caughtUp: [], master: record.master, links: links.length, friends: friends.size, ...name ? { name } : {} };
}
var sourceOf = (l) => ({
  ...l.identity ? { id: l.identity.id } : {},
  ...l.contactsRaw !== null ? { contacts: hash(l.contactsRaw) } : {},
  ...l.peersRaw !== null ? { peers: hash(l.peersRaw) } : {}
});
function catchUp(paths) {
  const master = readIdentity(paths.identity);
  const record = readJson(paths.migration, null);
  const report = { migrated: false, caughtUp: [], master: record?.master ?? null, links: 0, friends: 0 };
  if (!master) return report;
  const sources = { ...record?.sources };
  const linksFile = parseLinksFile(readJson(paths.links, null));
  const byOld = new Map([...linksFile.mine, ...linksFile.known].map((l) => [linkOldId(l), linkNewId(l)]));
  const myIds = /* @__PURE__ */ new Set([master.id, ...linksFile.mine.map(linkOldId)]);
  let changedRecord = !record;
  let friendsTouched = false;
  for (const app of LEGACY_APPS) {
    const l = readLegacy(app, paths.legacy[app]);
    const seen = sources[app] ?? {};
    const now = sourceOf(l);
    if (l.identity && l.identity.id !== master.id && !byOld.has(l.identity.id)) {
      const link = createLink(l.identity, master);
      linksFile.mine.push(link);
      byOld.set(l.identity.id, master.id);
      myIds.add(l.identity.id);
      report.links++;
    }
    if (l.identity) myIds.add(l.identity.id);
    const contactsChanged = now.contacts !== void 0 && now.contacts !== seen.contacts;
    const peersChanged = now.peers !== void 0 && now.peers !== seen.peers;
    if (contactsChanged || peersChanged) {
      backup(paths, l, String(Date.now()));
      const mapId = (id) => resolveId(id, byOld);
      if (contactsChanged) {
        withLock(lockOf(paths, paths.friends), () => {
          const file = parseFriendsFile(readJson(paths.friends, null));
          const map = new Map(file.friends.map((f) => [f.id, f]));
          mergeInto(map, parseArray(l.contactsRaw).map((c2) => friendFromLegacy(app, c2)), mergeFriends, myIds, mapId);
          writeJsonAtomic(paths.friends, { v: 1, friends: [...map.values()] });
        });
        friendsTouched = true;
      }
      if (peersChanged) {
        withLock(lockOf(paths, paths.peers), () => {
          const file = parsePeersFile(readJson(paths.peers, null));
          const map = new Map(file.peers.map((p) => [p.id, p]));
          mergeInto(map, parseArray(l.peersRaw).map((p) => peerFromLegacy(app, p)), mergePeers, myIds, mapId);
          writeJsonAtomic(paths.peers, { v: 1, peers: [...map.values()] });
        });
      }
      report.caughtUp.push(app);
    }
    if (JSON.stringify(now) !== JSON.stringify(seen)) {
      sources[app] = now;
      changedRecord = true;
    }
  }
  if (report.links) {
    withLock(lockOf(paths, paths.links), () => {
      const current = parseLinksFile(readJson(paths.links, null));
      const mine = [...current.mine, ...linksFile.mine.filter((l) => !current.mine.some((m) => m.old === l.old))];
      writeJsonAtomic(paths.links, { ...current, mine });
    });
  }
  if (changedRecord || report.links) {
    writeJsonAtomic(paths.migration, {
      v: 1,
      at: record?.at ?? Date.now(),
      master: record?.master ?? { app: "new", id: master.id },
      sources
    });
  }
  report.friends = friendsTouched ? parseFriendsFile(readJson(paths.friends, null)).friends.length : 0;
  return report;
}

// ../termcore/src/store/shared.ts
import { EventEmitter as EventEmitter6 } from "events";
import fs9 from "fs";
import path15 from "path";
var DEBOUNCE_MS = 30;
var POLL_MS = 1500;
var stampOf = (file) => {
  try {
    const s = fs9.statSync(file);
    return { mtimeMs: s.mtimeMs, size: s.size, ino: s.ino };
  } catch {
    return null;
  }
};
var sameStamp = (a, b) => a === b || !!a && !!b && a.mtimeMs === b.mtimeMs && a.size === b.size && a.ino === b.ino;
var SharedFile = class extends EventEmitter6 {
  constructor(file, opts) {
    super();
    this.file = file;
    this.opts = opts;
    this.lockFile = path15.join(opts.locksDir, `${path15.basename(file)}.lock`);
    this.stamp = stampOf(file);
    this.value = opts.parse(readJson(file, null));
    this.text = JSON.stringify(this.value);
  }
  value;
  text;
  stamp;
  watcher = null;
  poll = null;
  debounce = null;
  lockFile;
  get() {
    return this.value;
  }
  /** Reads the file again if it changed on disk. Returns whether the value changed. */
  refresh() {
    const stamp = stampOf(this.file);
    if (sameStamp(stamp, this.stamp)) return false;
    this.stamp = stamp;
    return this.adopt(this.opts.parse(readJson(this.file, null)), true);
  }
  adopt(value, external) {
    const text = JSON.stringify(value);
    if (text === this.text) return false;
    this.value = value;
    this.text = text;
    this.emit("change", value, external);
    return true;
  }
  /**
   * Locked read-modify-write. `fn` gets a private copy of the newest value; it may change it in
   * place (return nothing) or return a replacement. Nothing is written if nothing changed.
   * Returns the new value.
   */
  update(fn) {
    return withLock(this.lockFile, () => {
      const current = this.opts.parse(readJson(this.file, null));
      const draft = structuredClone(current);
      const next = this.opts.parse(fn(draft) ?? draft);
      const text = JSON.stringify(next);
      if (text !== JSON.stringify(current)) {
        writeFileAtomic(this.file, JSON.stringify(next, null, 2));
      }
      this.stamp = stampOf(this.file);
      if (JSON.stringify(current) !== this.text) this.adopt(current, true);
      this.adopt(next, false);
      return next;
    });
  }
  /** Writes a value as is (under the lock) – for files only one process creates (migration). */
  replace(value) {
    this.update(() => value);
  }
  watch() {
    if (this.watcher || this.poll) return;
    const schedule = () => {
      if (this.debounce) return;
      this.debounce = setTimeout(() => {
        this.debounce = null;
        this.refresh();
      }, DEBOUNCE_MS);
      this.debounce.unref();
    };
    try {
      fs9.mkdirSync(path15.dirname(this.file), { recursive: true, mode: 448 });
      const name = path15.basename(this.file);
      this.watcher = fs9.watch(path15.dirname(this.file), { persistent: false }, (_ev, f) => {
        if (!f || f === name) schedule();
      });
      this.watcher.on("error", () => {
        this.watcher?.close();
        this.watcher = null;
      });
    } catch {
      this.watcher = null;
    }
    this.poll = setInterval(() => this.refresh(), POLL_MS);
    this.poll.unref();
  }
  unwatch() {
    this.watcher?.close();
    this.watcher = null;
    if (this.poll) clearInterval(this.poll);
    if (this.debounce) clearTimeout(this.debounce);
    this.poll = null;
    this.debounce = null;
  }
};

// ../termcore/src/store/hub.ts
var Hub = class {
  /** Opens an existing hub (after `prepare` and onboarding). Throws if there's no profile yet. */
  constructor(paths) {
    this.paths = paths;
    const identity = readIdentity(paths.identity);
    if (!identity) throw new Error("No profile found");
    this.identity = identity;
    const locksDir = paths.locksDir;
    this.profile = new SharedFile(paths.profile, { locksDir, parse: parseProfile });
    if (!this.profile.get()) throw new Error("No profile found");
    this.friends = new SharedFile(paths.friends, { locksDir, parse: parseFriendsFile });
    this.peers = new SharedFile(paths.peers, { locksDir, parse: parsePeersFile });
    this.settings = new SharedFile(paths.settings, { locksDir, parse: parseSettings });
    this.links = new SharedFile(paths.links, { locksDir, parse: parseLinksFile });
  }
  identity;
  profile;
  friends;
  peers;
  settings;
  links;
  /**
   * Run once at startup, before anything reads the hub: migrates the apps' old data on the
   * first start of a new version (see migrate.ts).
   */
  static prepare(paths) {
    return migrate(paths);
  }
  /** Is there a complete profile (identity + name)? Otherwise the app shows its onboarding. */
  static hasProfile(paths) {
    return readIdentity(paths.identity) !== null && parseProfile(readJson(paths.profile, null)) !== null;
  }
  /** The name, if there's a profile. */
  static profileName(paths) {
    return parseProfile(readJson(paths.profile, null))?.name ?? null;
  }
  /** Creates identity (if there's none yet) and profile on first launch. */
  static createProfile(paths, name) {
    const identity = loadOrCreateIdentity(paths.identity);
    const prev = parseProfile(readJson(paths.profile, null));
    writeJsonAtomic(paths.profile, { ...prev ?? { v: 1, status: "available" }, name: cleanName(name) });
    return identity;
  }
  /** Follows file changes by the other apps. */
  watch() {
    for (const f of this.files()) f.watch();
  }
  close() {
    for (const f of this.files()) {
      f.unwatch();
      f.removeAllListeners();
    }
  }
  files() {
    return [this.profile, this.friends, this.peers, this.settings, this.links];
  }
  get me() {
    return this.profile.get();
  }
  setProfile(patch) {
    return this.profile.update((p) => {
      const next = { ...p ?? { v: 1, name: "Unknown", status: "available" } };
      for (const [k, v] of Object.entries(patch)) {
        if (v === void 0) delete next[k];
        else next[k] = v;
      }
      return next;
    });
  }
  setSettings(patch) {
    return this.settings.update((s) => {
      const next = { ...s };
      for (const [k, v] of Object.entries(patch)) {
        if (v === void 0) delete next[k];
        else next[k] = v;
      }
      return next;
    });
  }
  /** My own links (sent to everyone I connect to). */
  myLinks() {
    return this.links.get().mine;
  }
  /** My old ids. */
  myOldIds() {
    return this.myLinks().map(linkOldId);
  }
  /** Remembers a verified link of someone else. */
  addKnownLink(link) {
    this.links.update((l) => {
      if (l.known.some((k) => k.old === link.old && k.new === link.new)) return;
      l.known = [...l.known.filter((k) => k.old !== link.old), link];
    });
  }
  /** old id → new id, for my links and everyone else's. */
  linkMap() {
    const { mine, known } = this.links.get();
    return new Map([...mine, ...known].map((l) => [linkOldId(l), linkNewId(l)]));
  }
};
function rekeyedFile(appHome) {
  return path16.join(appHome, "rekeyed.json");
}
function applyLinks(hub, appHome, rekey) {
  const file = rekeyedFile(appHome);
  const done = new Set(readJson(file, []).filter((x) => typeof x === "string"));
  const applied = [];
  for (const [oldId, newId] of hub.linkMap()) {
    if (done.has(`${oldId}>${newId}`)) continue;
    rekey(oldId, newId);
    done.add(`${oldId}>${newId}`);
    applied.push(oldId);
  }
  if (applied.length) {
    fs10.mkdirSync(appHome, { recursive: true, mode: 448 });
    writeJsonAtomic(file, [...done]);
  }
  return applied;
}
function migrationNotice(friends) {
  return `Your profile and ${friends === 1 ? "1 friend" : `${friends} friends`} moved to ~/.termhub \u2013 shared by termchat, keyrace and termdrop`;
}

// ../termcore/src/friends/wire.ts
var NO_EXTENSION = { parse: () => null };
function parseJsonObject(buf) {
  let o;
  try {
    o = JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
  return o && typeof o === "object" && !Array.isArray(o) ? o : null;
}
function parseWire(buf, ext = NO_EXTENSION) {
  const o = parseJsonObject(buf);
  if (!o || typeof o.t !== "string") return null;
  switch (o.t) {
    case "state": {
      const port = Number(o.port);
      if (!REL_STATES.includes(o.state)) return null;
      const color = normalizeColor(o.color);
      return {
        t: "state",
        name: cleanName(o.name),
        state: o.state,
        port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 0,
        ...color ? { color } : {}
      };
    }
    case "presence": {
      if (typeof o.away !== "boolean") return null;
      const msg = cleanStatusMsg(o.msg);
      return {
        ...ext.presence?.(o) ?? {},
        t: "presence",
        away: o.away,
        ...isStatus(o.status) ? { status: o.status } : {},
        ...msg ? { msg } : {}
      };
    }
    case "links": {
      if (!Array.isArray(o.links) || o.links.length > MAX_LINKS) return null;
      const links = o.links.map(parseLink).filter((l) => l !== null);
      return { t: "links", links };
    }
    case "decline":
    case "ping":
    case "pong":
    case "bye":
      return { t: o.t };
    default:
      return ext.parse(o);
  }
}
function encodeWire(msg) {
  return Buffer.from(JSON.stringify(msg), "utf8");
}

// ../termcore/src/friends/net.ts
var UNKNOWN_PEER_TIMEOUT = 15e3;
var RELINK_TIMEOUT = 5e3;
var FIRST_MESSAGE_WAIT = 1e3;
var FriendNet = class {
  constructor(opts) {
    this.opts = opts;
    const { hub, app } = opts;
    this.hub = hub;
    this.app = app;
    this.identity = hub.identity;
    this.contacts = new ContactBook(hub.friends, app.name);
    this.peerBook = new PeerBook(hub.peers, app.name);
    this.lastStates = statesOf(hub.friends.get());
    this.network = new Network({
      protocol: app.protocol,
      me: this.identity,
      getName: () => this.name,
      parse: (plain) => parseWire(plain, opts.wire),
      acceptMismatch: (expected, actual) => (!!this.contacts.get(expected) || !!this.peerBook.get(expected)) && this.contacts.get(actual)?.state !== "blocked"
    });
    this.dialer = new Dialer({
      myId: this.identity.id,
      network: this.network,
      discovery: () => this.discoveryRef,
      stateOf: (id) => this.contacts.get(id)?.state,
      lastAddress: (id) => {
        const c2 = this.contacts.get(id);
        if (c2?.lastIp && c2.lastPort) return { ip: c2.lastIp, port: c2.lastPort };
        const p = this.peerBook.get(id);
        return p?.lastIp && p.lastPort ? { ip: p.lastIp, port: p.lastPort } : null;
      },
      candidates: () => {
        const ids = this.contacts.all().filter((c2) => c2.state === "accepted" || c2.state === "outgoing").map((c2) => c2.id);
        return [...ids, ...opts.hooks.extraDialIds?.() ?? []];
      },
      alsoWants: (id) => opts.hooks.alsoWants?.(id) ?? false,
      log: (l) => this.log(l),
      unreachable: (id, info) => this.event({ kind: "unreachable", id, who: this.peerName(id), ...info })
    });
    this.network.on("session", (s) => this.onSession(s));
    this.network.on("purpose", (c2) => opts.hooks.purpose ? opts.hooks.purpose(c2) : c2.fs.destroy());
    this.network.on("offline", (id) => this.onOffline(id));
    this.network.on("log", (l) => this.log(l));
    hub.friends.on("change", (v, external) => {
      const prev = this.lastStates;
      this.lastStates = statesOf(v);
      if (external && this.started) this.syncFromOthers(prev, this.lastStates);
      this.changed();
    });
    hub.peers.on("change", () => this.changed());
    hub.profile.on("change", () => this.onProfileChanged());
    hub.settings.on("change", (s) => {
      opts.hooks.settings?.(s);
      this.changed();
    });
    hub.links.on("change", () => this.runRekey());
  }
  identity;
  contacts;
  peerBook;
  network;
  dialer;
  hub;
  app;
  discoveryRef = null;
  focused = true;
  presenceMap = /* @__PURE__ */ new Map();
  lastStates;
  unregisterRun = null;
  started = false;
  /** Sessions with peers we don't know yet: our state waits for their first message. */
  awaitingFirst = /* @__PURE__ */ new WeakSet();
  // ───────────── Lifecycle ─────────────
  async start() {
    const { opts } = this;
    await this.network.start(opts.port ?? this.app.tcpPort);
    this.started = true;
    const udpPort = opts.discoveryPort ?? this.app.udpPort;
    this.unregisterRun = registerRun(this.hub.paths.runDir, { app: this.app.name, port: this.network.port, udp: udpPort, version: this.app.version });
    this.hub.watch();
    this.runRekey();
    if (opts.discovery !== false) {
      const d = new Discovery(this.identity.id, () => this.name, () => this.network.port, {
        ...opts.discoveryOptions,
        app: this.app.name,
        udpPort,
        apps: () => runningPorts(this.hub.paths.runDir),
        was: () => this.hub.myOldIds(),
        hints: () => this.lastKnownIps(),
        wants: (id) => this.dialer.wantsConnection(id)
      });
      this.discoveryRef = d;
      d.on("change", () => this.onDiscovered());
      d.on("log", (l) => this.log(l));
      d.on("callback", (id) => this.dialer.onCallback(id));
      d.start();
    }
    this.dialer.start(opts.dialIntervalMs ?? 1500);
    this.changed();
  }
  async stop() {
    this.started = false;
    this.dialer.stop();
    this.discoveryRef?.stop();
    await this.network.stop();
    this.hub.close();
    this.unregisterRun?.();
    this.unregisterRun = null;
  }
  get discovery() {
    return this.discoveryRef;
  }
  // ───────────── Me ─────────────
  get profile() {
    return this.hub.me;
  }
  get name() {
    return this.profile.name;
  }
  get me() {
    const p = this.profile;
    return {
      id: this.identity.id,
      name: p.name,
      color: p.color,
      status: p.status,
      statusMsg: p.statusMsg,
      port: this.network.port,
      ips: localIPv4s().map((i) => i.address),
      discovery: this.discoveryRef !== null,
      scanning: this.discoveryRef?.scanning ?? false
    };
  }
  get settings() {
    return this.hub.settings.get();
  }
  /** Do not disturb: no desktop notifications, invites and offers wait quietly. */
  get dnd() {
    return this.profile.status === "dnd";
  }
  get animations() {
    return this.settings.animations;
  }
  notificationsEnabled() {
    return this.settings.notifications;
  }
  setNotifications(on) {
    this.hub.setSettings({ notifications: on });
  }
  setAnimations(mode) {
    this.hub.setSettings({ animations: mode });
  }
  setName(name) {
    const clean = cleanName(name);
    this.hub.setProfile({ name: clean });
    return clean;
  }
  /** Terminal window gained/lost focus. Terminals without focus reporting stay "focused". */
  setFocused(focused) {
    if (this.focused === focused) return;
    this.focused = focused;
    this.broadcastPresence();
    this.changed();
  }
  get isFocused() {
    return this.focused;
  }
  /** Desktop banner – only while the terminal is in the background, notifications are on and we're not in dnd. */
  notify(title, body) {
    if (this.focused || !this.notificationsEnabled() || this.dnd) return;
    if (this.opts.notify) this.opts.notify(title, body);
    else notify(title, body, this.app.name);
  }
  // ───────────── Queries ─────────────
  isOnline(id) {
    return this.network.isOnline(id);
  }
  presenceOf(id) {
    return this.isOnline(id) ? this.presenceMap.get(id) : void 0;
  }
  /** Best name for any peer: own nickname/friend name, else what we remember. */
  peerName(id) {
    if (id === this.identity.id) return this.name;
    const c2 = this.contacts.get(id);
    if (c2) return displayName(c2);
    return this.peerBook.get(id)?.name ?? "Unknown";
  }
  /** People on the network running this app who aren't friends (an old id they announce counts). */
  nearby() {
    return [...this.discoveryRef?.peers.values() ?? []].filter((p) => !this.contacts.get(p.id) && !(p.was ?? []).some((w) => this.contacts.get(w))).sort((a, b) => a.name.localeCompare(b.name));
  }
  /** Number of accepted friends online. */
  onlineCount() {
    let n = 0;
    for (const id of this.network.sessions.keys()) if (this.contacts.get(id)?.state === "accepted") n++;
    return n;
  }
  safetyCodeWith(id) {
    const c2 = this.contacts.get(id);
    if (!c2?.publicKey) return null;
    return safetyCode(this.identity.publicRaw, Buffer.from(c2.publicKey, "base64url"));
  }
  send(id, msg) {
    return this.network.get(id)?.send(msg) ?? false;
  }
  // ───────────── Friends ─────────────
  /** Request to a peer from "Nearby". */
  requestNearby(id) {
    const p = this.discoveryRef?.peers.get(id);
    const existing = this.contacts.get(id);
    if (existing) {
      let result = "pending";
      if (existing.state === "incoming") {
        this.accept(id);
        result = "accepted";
      } else if (existing.state === "declined" || existing.state === "blocked") {
        this.setState(id, "outgoing");
        result = "again";
      }
      this.connect(id);
      return result;
    }
    if (!p) throw new Error("They are no longer nearby");
    this.contacts.upsert(id, { publicKey: "", name: p.name, state: "outgoing", lastIp: p.ip, lastPort: p.port });
    this.connect(id);
    this.changed();
    return "sent";
  }
  /** Ask again (after a decline). */
  request(id) {
    this.setState(id, "outgoing");
    this.connect(id);
  }
  /** Add a friend by IP – for networks that block broadcast. */
  async addByAddress(host, port = this.app.tcpPort) {
    const session = await this.network.dial(host, port, void 0, "request");
    return session.peerId;
  }
  /** Accepts a request. False if there's none from them. */
  accept(id) {
    const c2 = this.contacts.get(id);
    if (!c2 || c2.state !== "incoming") return false;
    this.setState(id, "accepted");
    this.connect(id);
    return true;
  }
  /** Declines a request (or ends a friendship without a word): they're told, the entry is removed. */
  decline(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return void 0;
    const s = this.network.get(id);
    if (s) {
      s.send({ t: "decline" });
      if (!this.opts.hooks.keepUnknown?.(id)) s.close("Declined");
    }
    this.contacts.remove(id);
    this.changed();
    return c2;
  }
  block(id, patch = {}) {
    const c2 = this.contacts.get(id);
    if (!c2) return void 0;
    this.contacts.upsert(id, { ...patch, state: "blocked" });
    this.network.get(id)?.close("Blocked");
    this.changed();
    return c2;
  }
  unblock(id) {
    const c2 = this.contacts.get(id);
    if (c2?.state !== "blocked") return void 0;
    this.setState(id, "outgoing");
    this.connect(id);
    return c2;
  }
  /** Removes a friend; they see it as "removed you". */
  remove(id) {
    this.contacts.remove(id);
    const s = this.network.get(id);
    if (s) {
      s.send({ t: "state", name: this.name, state: "none", port: this.network.port });
      if (!this.opts.hooks.keepUnknown?.(id)) s.close("Friend removed");
    }
    this.changed();
  }
  rename(id, alias) {
    const clean = alias.trim() ? cleanName(alias) : void 0;
    this.contacts.upsert(id, { alias: clean });
    this.changed();
  }
  /** Dials, and asks the peer to dial us too – whichever direction the firewalls allow wins. */
  connect(id) {
    this.dialer.connect(id);
  }
  tryDial(id) {
    this.dialer.tryDial(id);
  }
  setState(id, state) {
    this.contacts.upsert(id, { state, lastActivity: Date.now() });
    this.sendState(id);
    this.changed();
  }
  sendState(id) {
    const s = this.network.get(id);
    if (!s) return;
    const c2 = this.contacts.get(id);
    const color = this.profile.color;
    s.send({ t: "state", name: this.name, state: relStateFor(c2?.state ?? null), port: this.network.port, ...color ? { color } : {} });
  }
  // ───────────── Presence ─────────────
  ownPresence() {
    const p = this.profile;
    return {
      ...this.opts.hooks.presenceExtra?.() ?? {},
      t: "presence",
      away: !this.focused,
      ...p.status !== "available" ? { status: p.status } : {},
      ...p.statusMsg ? { msg: p.statusMsg } : {}
    };
  }
  sendPresence(id) {
    this.network.get(id)?.send(this.ownPresence());
  }
  broadcastPresence() {
    for (const id of this.network.sessions.keys()) this.sendPresence(id);
  }
  // ───────────── Internals ─────────────
  changed() {
    this.opts.hooks.changed();
  }
  log(line) {
    this.opts.hooks.log?.(line);
  }
  event(e) {
    this.opts.hooks.event?.(e);
  }
  lastKnownIps() {
    const ips = /* @__PURE__ */ new Set();
    for (const c2 of this.contacts.all()) if (c2.lastIp && c2.state !== "blocked") ips.add(c2.lastIp);
    for (const ip of this.opts.hooks.extraHints?.() ?? []) ips.add(ip);
    return [...ips];
  }
  onDiscovered() {
    const d = this.discoveryRef;
    if (!d) return;
    const seen = [];
    for (const p of d.peers.values()) {
      for (const id of [p.id, ...p.was ?? []]) {
        const c2 = this.contacts.get(id);
        if (c2 && (c2.lastIp !== p.ip || c2.lastPort !== p.port)) this.contacts.upsert(id, { lastIp: p.ip, lastPort: p.port });
        if (c2 && p.apps) this.contacts.setPorts(id, p.apps);
        const known = this.peerBook.get(id);
        if (known && (known.lastIp !== p.ip || known.lastPort !== p.port)) this.peerBook.update(id, { lastIp: p.ip, lastPort: p.port });
        seen.push(id);
      }
    }
    this.dialer.discovered(seen);
    this.changed();
  }
  onProfileChanged() {
    if (!this.started) return this.changed();
    for (const id of this.network.sessions.keys()) {
      this.sendState(id);
      this.sendPresence(id);
    }
    this.discoveryRef?.announce(false);
    this.changed();
  }
  /** Another app changed the friend list: tell our peers what changed for them. */
  syncFromOthers(prev, next) {
    for (const id of /* @__PURE__ */ new Set([...prev.keys(), ...next.keys()])) {
      const before = prev.get(id);
      const after = next.get(id);
      if (before === after) continue;
      const s = this.network.get(id);
      if (after === void 0) {
        if (s) {
          s.send({ t: "state", name: this.name, state: "none", port: this.network.port });
          if (!this.opts.hooks.keepUnknown?.(id)) s.close("Friend removed");
        }
        continue;
      }
      if (after === "blocked") {
        s?.close("Blocked");
        continue;
      }
      if (relStateFor(before ?? null) !== relStateFor(after)) this.sendState(id);
      if (after === "accepted" || after === "outgoing") this.dialer.connect(id);
    }
  }
  runRekey() {
    const rekey = this.opts.hooks.rekey;
    if (!rekey) return;
    try {
      if (applyLinks(this.hub, this.opts.paths.home, rekey).length) this.changed();
    } catch (err) {
      this.log(`Couldn't update data for new ids: ${err.message}`);
    }
  }
  onSession(s) {
    const id = s.peerId;
    let c2 = this.contacts.get(id);
    if (c2?.state === "blocked") {
      s.close("Blocked", false);
      return;
    }
    this.dialer.connected(id);
    if (s.tag === "request") {
      if (!c2) {
        c2 = this.contacts.upsert(id, { publicKey: "", name: s.peerName, state: "outgoing" });
        this.event({ kind: "requestSent", id, who: s.peerName });
      } else if (c2.state === "incoming") {
        this.accept(id);
      } else if (c2.state === "declined") {
        this.contacts.upsert(id, { state: "outgoing" });
      }
    }
    if (c2) {
      this.contacts.upsert(id, {
        publicKey: s.peerPublicRaw.toString("base64url"),
        name: s.peerName,
        lastIp: s.remoteAddress,
        lastSeen: Date.now()
      });
    }
    s.on("message", (m) => this.onWire(s, m));
    if (s.expected) {
      const expected = s.expected;
      setTimeout(() => {
        if (s.isOpen && this.contacts.get(expected) && !this.contacts.get(id)) s.close("Someone else is now reachable at this address");
      }, this.opts.relinkTimeoutMs ?? RELINK_TIMEOUT).unref();
      s.on("close", () => {
        if (this.contacts.get(expected)) this.dialer.failed(expected);
      });
    } else if (!c2 && !this.opts.hooks.keepUnknown?.(id)) {
      setTimeout(() => {
        if (s.isOpen && !this.contacts.get(id) && !this.opts.hooks.keepUnknown?.(id)) s.close("No request received");
      }, UNKNOWN_PEER_TIMEOUT).unref();
    }
    const links = this.hub.myLinks();
    if (links.length) s.send({ t: "links", links });
    if (c2) this.sendState(id);
    else {
      this.awaitingFirst.add(s);
      setTimeout(() => this.flushInitialState(s), FIRST_MESSAGE_WAIT).unref();
    }
    const own = this.ownPresence();
    if (Object.keys(own).length > 2 || own.away) this.sendPresence(id);
    this.opts.hooks.session?.(s);
    this.log(`Connected to ${s.peerName} (${id}) via ${s.remoteAddress}`);
    this.changed();
  }
  onOffline(id) {
    this.presenceMap.delete(id);
    this.opts.hooks.offline?.(id);
    if (this.contacts.get(id)) this.contacts.upsert(id, { lastSeen: Date.now() });
    this.changed();
  }
  flushInitialState(s) {
    if (!this.awaitingFirst.has(s)) return;
    this.awaitingFirst.delete(s);
    if (s.isOpen && this.network.get(s.peerId) === s) this.sendState(s.peerId);
  }
  onWire(s, m) {
    try {
      this.handleWire(s, m);
    } finally {
      this.flushInitialState(s);
    }
  }
  handleWire(s, m) {
    if (this.network.get(s.peerId) !== s) return;
    const id = s.peerId;
    const base = m;
    switch (base.t) {
      case "links":
        return this.onLinks(s, base.links);
      case "state":
        return this.onState(s, base);
      case "decline": {
        let declined = false;
        const c2 = this.contacts.mutate(id, (cur) => {
          if (cur?.state !== "outgoing") return void 0;
          declined = true;
          return { state: "declined" };
        });
        if (declined && c2) {
          this.event({ kind: "declinedUs", id, who: displayName(c2) });
          this.changed();
        }
        return;
      }
      case "presence": {
        if (!this.contacts.get(id) && !this.opts.hooks.keepUnknown?.(id)) return;
        const { t: _t, away, status, msg, ...extra } = base;
        const next = { away, status: status ?? "available", ...msg ? { msg } : {}, extra };
        if (JSON.stringify(next) === JSON.stringify(this.presenceMap.get(id))) return;
        this.presenceMap.set(id, next);
        this.opts.hooks.presence?.(id, next);
        this.changed();
        return;
      }
      case "ping":
      case "pong":
      case "bye":
        return;
      default:
        if (this.contacts.get(id)?.state === "blocked") return;
        this.opts.hooks.message(s, m);
    }
  }
  /** Their links: an old id we know is them now. Only links to the session's own key count. */
  onLinks(s, links) {
    let changed = false;
    for (const link of links) {
      if (linkNewId(link) !== s.peerId || !verifyLink(link)) continue;
      const oldId = linkOldId(link);
      if (oldId === s.peerId || oldId === this.identity.id) continue;
      const friend = this.contacts.get(oldId);
      const known = this.peerBook.get(oldId);
      if (!friend && !known && s.expected !== oldId && !this.opts.hooks.knowsId?.(oldId)) continue;
      this.hub.addKnownLink(link);
      if (friend) this.contacts.relink(oldId, s.peerId, link.new);
      if (known) this.peerBook.relink(oldId, s.peerId);
      this.dialer.connected(oldId);
      this.event({ kind: "linked", oldId, id: s.peerId, who: this.peerName(s.peerId) });
      this.log(`${oldId} is now ${s.peerId}`);
      changed = true;
    }
    if (changed) {
      this.runRekey();
      if (!this.awaitingFirst.has(s)) this.sendState(s.peerId);
      this.changed();
    }
  }
  onState(s, m) {
    const id = s.peerId;
    this.opts.hooks.stateMessage?.(s, m);
    let prev = null;
    let before;
    const now = Date.now();
    const updated = this.contacts.mutate(id, (cur) => {
      before = cur;
      prev = cur?.state ?? null;
      const next2 = reconcile(prev, m.state);
      if (next2 === null) return cur ? null : void 0;
      return {
        publicKey: s.peerPublicRaw.toString("base64url"),
        name: m.name,
        state: next2,
        color: m.color,
        lastIp: s.remoteAddress,
        lastPort: m.port || cur?.lastPort,
        lastSeen: now,
        ...prev !== next2 ? { lastActivity: now } : {},
        ...this.opts.hooks.statePatch?.(prev, next2) ?? {}
      };
    });
    const next = updated?.state ?? null;
    if (next === null) {
      if (before) this.event({ kind: "withdrawn", id, who: displayName(before) });
      if (!this.opts.hooks.keepUnknown?.(id)) s.close("Not a friend");
      this.changed();
      return;
    }
    const who = displayName(updated);
    if (next === "accepted" && prev !== "accepted") {
      this.event({ kind: "accepted", id, who, byThem: prev === "outgoing" });
    } else if (next === "incoming" && prev !== "incoming") {
      this.event({ kind: "incoming", id, who });
    } else if (prev === "accepted" && next === "outgoing") {
      this.event({ kind: "removedUs", id, who });
    }
    if (relStateFor(prev) !== relStateFor(next)) this.sendState(id);
    this.opts.hooks.stateChanged?.(id, prev, next);
    this.changed();
  }
};
function statesOf(v) {
  return new Map(v.friends.map((f) => [f.id, f.state]));
}
function appendLog(file, line) {
  try {
    fs11.appendFileSync(file, `${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`);
  } catch {
  }
}

// src/transfer/history.ts
function toEntry(t, now) {
  const end = t.endedAt ?? now;
  return {
    xid: t.xid,
    ts: end,
    dir: t.dir,
    peerId: t.peerId,
    peerName: t.peerName,
    files: t.files,
    total: t.total,
    bytes: t.bytes,
    result: t.status,
    ...t.reason ? { reason: t.reason } : {},
    ms: Math.max(0, end - (t.startedAt ?? t.createdAt)),
    ...t.saved?.length ? { saved: t.saved } : {},
    ...t.paths?.length ? { paths: t.paths } : {},
    ...t.auto ? { auto: true } : {}
  };
}
var isEntry = (e) => {
  const o = e;
  return !!o && typeof o.xid === "string" && typeof o.ts === "number" && (o.dir === "in" || o.dir === "out") && Array.isArray(o.files);
};
var HistoryBook = class {
  constructor(paths) {
    this.paths = paths;
    this.entries = readJsonl(paths.transfers).filter(isEntry);
  }
  entries;
  add(entry) {
    this.entries.push(entry);
    try {
      appendJsonl(this.paths.transfers, entry);
    } catch {
    }
  }
  /** Newest first. */
  recent(n) {
    return this.entries.slice(-n).reverse();
  }
  all() {
    return this.entries;
  }
  /** A friend has a new id (they migrated to ~/.termhub): their past transfers move with them. */
  rekey(oldId, newId) {
    if (!this.entries.some((e) => e.peerId === oldId)) return;
    this.entries = this.entries.map((e) => e.peerId === oldId ? { ...e, peerId: newId } : e);
    writeJsonlAtomic(this.paths.transfers, this.entries);
  }
  get(xid) {
    return this.entries.find((e) => e.xid === xid);
  }
  totals() {
    const t = { sentBytes: 0, sentFiles: 0, receivedBytes: 0, receivedFiles: 0 };
    for (const e of this.entries) {
      if (e.result !== "done") continue;
      if (e.dir === "out") {
        t.sentBytes += e.total;
        t.sentFiles += e.files.length;
      } else {
        t.receivedBytes += e.total;
        t.receivedFiles += e.files.length;
      }
    }
    return t;
  }
};

// src/transfer/link.ts
import { EventEmitter as EventEmitter7 } from "events";

// src/core/protocol.ts
var REJECT_REASONS = ["declined", "no_space", "busy", "too_large"];
var FAIL_REASONS = ["hash_mismatch", "too_much_data", "file_changed", "disk_error", "read_error", "protocol"];
var SHA256_RE = /^[0-9a-f]{64}$/;
var MAX_INDEX = 1e4;
var isXid = (v) => typeof v === "string" && XID_RE.test(v);
function parseTransferWire(o) {
  switch (o.t) {
    case "offer": {
      if (!isXid(o.xid)) return null;
      const files = parseOfferFiles(o.files, o.total);
      return files ? { t: "offer", xid: o.xid, files, total: o.total } : null;
    }
    case "accept":
    case "cancel":
      return isXid(o.xid) ? { t: o.t, xid: o.xid } : null;
    case "reject":
      if (!isXid(o.xid)) return null;
      return { t: "reject", xid: o.xid, reason: REJECT_REASONS.includes(o.reason) ? o.reason : "declined" };
    default:
      return null;
  }
}
var WIRE = { parse: parseTransferWire };
function parseLinkMsg(buf) {
  const o = parseJsonObject(buf);
  if (!o) return null;
  switch (o.t) {
    case "eof":
      if (!Number.isInteger(o.i) || o.i < 0 || o.i > MAX_INDEX) return null;
      if (typeof o.sha256 !== "string" || !SHA256_RE.test(o.sha256)) return null;
      return { t: "eof", i: o.i, sha256: o.sha256 };
    case "done":
      return { t: "done" };
    case "failed":
      return { t: "failed", reason: FAIL_REASONS.includes(o.reason) ? o.reason : "protocol" };
    default:
      return null;
  }
}

// src/transfer/link.ts
var TAG_LEN2 = 16;
var DATA = 0;
var MSG = 1;
var CHUNK_SIZE = MAX_FRAME - 1 - TAG_LEN2;
var DataLink = class extends EventEmitter7 {
  constructor(fs20, hs, xid) {
    super();
    this.fs = fs20;
    this.hs = hs;
    this.peerId = hs.peerId;
    this.xid = xid;
    fs20.on("frame", (frame) => this.onFrame(frame));
    fs20.on("close", (err) => this.finish(err ? err.message : "Connection closed"));
  }
  peerId;
  xid;
  closed = false;
  closeReason = "";
  /** Call once listeners are attached – frames that arrived before are delivered then. */
  start() {
    this.fs.startStreaming();
  }
  get isOpen() {
    return !this.closed;
  }
  get reason() {
    return this.closeReason;
  }
  /** Sends file data. `false` = the send buffer is full, wait for drained(). */
  sendData(chunk) {
    if (this.closed) return false;
    const header = Buffer.from([DATA]);
    return this.fs.write(this.hs.send.encrypt(chunk.length ? Buffer.concat([header, chunk]) : header));
  }
  sendMsg(msg) {
    if (this.closed) return false;
    return this.fs.write(this.hs.send.encrypt(Buffer.concat([Buffer.from([MSG]), Buffer.from(JSON.stringify(msg))])));
  }
  drained() {
    return this.fs.drained();
  }
  pause() {
    this.fs.pause();
  }
  resume() {
    this.fs.resume();
  }
  /** Graceful close once everything buffered is sent. */
  end() {
    this.fs.end();
    setTimeout(() => this.fs.destroy(), 5e3).unref();
  }
  destroy(reason = "Connection closed") {
    if (!this.closed) this.closeReason = reason;
    this.fs.destroy();
    this.finish(reason);
  }
  onFrame(frame) {
    if (this.closed) return;
    let plain;
    try {
      plain = this.hs.recv.decrypt(frame);
    } catch {
      this.destroy("Received tampered data");
      return;
    }
    if (plain[0] === DATA) {
      this.emit("frame", { kind: "data", data: plain.subarray(1) });
      return;
    }
    const msg = plain[0] === MSG ? parseLinkMsg(plain.subarray(1)) : null;
    if (!msg) {
      this.destroy("Received an invalid message");
      return;
    }
    this.emit("frame", { kind: "msg", msg });
  }
  finish(reason) {
    if (this.closed) return;
    this.closed = true;
    this.closeReason ||= reason;
    this.emit("close", this.closeReason);
  }
};

// src/transfer/manager.ts
import crypto9 from "crypto";
import fs13 from "fs";

// src/transfer/receiver.ts
import crypto8 from "crypto";

// src/transfer/sender.ts
import crypto7 from "crypto";
import fs12 from "fs";
var VERDICT_TIMEOUT = 6e4;
var TransferError = class extends Error {
  constructor(kind, reason, message) {
    super(message);
    this.kind = kind;
    this.reason = reason;
  }
};
var FAIL_TEXT = {
  hash_mismatch: "a file arrived damaged (checksum mismatch)",
  too_much_data: "more data arrived than announced",
  file_changed: "a file changed while it was being sent",
  disk_error: "the receiver couldn't save the file",
  read_error: "a file couldn't be read",
  protocol: "the transfer got out of step"
};
async function sendFiles(link, files, opts) {
  const box = { verdict: null };
  let wake = null;
  const settle = (v) => {
    box.verdict ??= v;
    wake?.();
  };
  link.on("frame", (f) => {
    if (f.kind === "msg" && (f.msg.t === "done" || f.msg.t === "failed")) settle(f.msg);
    else settle({ t: "failed", reason: "protocol" });
  });
  link.on("close", (reason) => settle({ t: "closed", reason }));
  const onAbort = () => settle({ t: "closed", reason: "cancelled" });
  opts.signal?.addEventListener("abort", onAbort);
  link.start();
  const stopped = () => {
    const verdict = box.verdict;
    if (opts.signal?.aborted) return new TransferError("cancelled", null, "Cancelled");
    if (!verdict) return null;
    if (verdict.t === "failed") return new TransferError("peer", verdict.reason, FAIL_TEXT[verdict.reason]);
    if (verdict.t === "closed") return new TransferError("connection", null, "The connection was lost");
    return new TransferError("peer", "protocol", FAIL_TEXT.protocol);
  };
  const giveUp = (reason, message) => {
    link.sendMsg({ t: "failed", reason });
    link.end();
    return new TransferError("local", reason, message);
  };
  try {
    let total = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const hash2 = crypto7.createHash("sha256");
      let sent = 0;
      const stream = fs12.createReadStream(file.path, { highWaterMark: CHUNK_SIZE });
      try {
        for await (const chunk of stream) {
          const err2 = stopped();
          if (err2) throw err2;
          sent += chunk.length;
          if (sent > file.size) throw giveUp("file_changed", `${file.name} changed while it was being sent`);
          hash2.update(chunk);
          total += chunk.length;
          if (!link.sendData(chunk)) {
            await new Promise((resolve) => {
              wake = resolve;
              void link.drained().then(resolve);
            });
            wake = null;
          }
          opts.onProgress(total, i);
        }
      } catch (err2) {
        if (err2 instanceof TransferError) throw err2;
        throw giveUp("read_error", `Couldn't read ${file.name}: ${err2.message}`);
      } finally {
        stream.destroy();
      }
      const err = stopped();
      if (err) throw err;
      if (sent !== file.size) throw giveUp("file_changed", `${file.name} changed while it was being sent`);
      link.sendMsg({ t: "eof", i, sha256: hash2.digest("hex") });
      opts.onProgress(total, i);
    }
    if (!box.verdict) {
      await new Promise((resolve) => {
        wake = resolve;
        setTimeout(resolve, VERDICT_TIMEOUT).unref();
      });
      wake = null;
    }
    if (box.verdict?.t === "done") {
      link.end();
      return;
    }
    throw stopped() ?? new TransferError("connection", null, "The receiver stopped answering");
  } catch (err) {
    if (!(err instanceof TransferError && err.kind === "local")) {
      link.destroy(err instanceof TransferError && err.kind === "cancelled" ? "Cancelled" : "Transfer failed");
    }
    throw err;
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

// src/transfer/receiver.ts
var QUEUE_HIGH = 32;
var QUEUE_LOW = 8;
var ReceiveError = class extends TransferError {
  saved = [];
};
function receiveFiles(link, files, dir, opts) {
  return new Promise((resolve, reject) => {
    const saved = [];
    const queue = [];
    let paused = false;
    let running = false;
    let finished = false;
    let index = 0;
    let got = 0;
    let total = 0;
    let current = null;
    const fail = async (err, tell) => {
      if (finished) return;
      finished = true;
      queue.length = 0;
      if (tell) {
        link.sendMsg({ t: "failed", reason: tell });
        link.end();
      } else {
        link.destroy(err.kind === "cancelled" ? "Cancelled" : "Transfer failed");
      }
      const part = current;
      current = null;
      if (part) {
        await part.handle.close().catch(() => {
        });
        await removePart(part.partPath);
      }
      const out = new ReceiveError(err.kind, err.reason, err.message);
      out.saved = saved;
      reject(out);
    };
    const local = (reason, message) => fail(new TransferError("local", reason, message), reason);
    const open = async () => {
      if (current) return current;
      const r = await reservePart(dir, files[index].name);
      current = { ...r, hash: crypto8.createHash("sha256") };
      return current;
    };
    const handle = async (f) => {
      if (f.kind === "data") {
        const file = files[index];
        if (!file || got + f.data.length > file.size) return local("too_much_data", FAIL_TEXT.too_much_data);
        const c3 = await open();
        c3.hash.update(f.data);
        got += f.data.length;
        total += f.data.length;
        await c3.handle.write(f.data);
        opts.onProgress(total, index);
        return;
      }
      const msg = f.msg;
      if (msg.t === "failed") return fail(new TransferError("peer", msg.reason, FAIL_TEXT[msg.reason]));
      if (msg.t !== "eof" || msg.i !== index || got !== files[index]?.size) return local("protocol", FAIL_TEXT.protocol);
      const c2 = await open();
      await c2.handle.close();
      current = null;
      if (c2.hash.digest("hex") !== msg.sha256) {
        await removePart(c2.partPath);
        return local("hash_mismatch", `${files[index].name} arrived damaged (checksum mismatch)`);
      }
      saved.push(await finalizePart(dir, c2.partPath, files[index].name, c2.n));
      index++;
      got = 0;
      opts.onProgress(total, Math.min(index, files.length - 1));
      if (index === files.length) {
        finished = true;
        link.sendMsg({ t: "done" });
        link.end();
        resolve({ saved });
      }
    };
    const pump = async () => {
      if (running) return;
      running = true;
      try {
        while (queue.length && !finished) {
          await handle(queue.shift());
          if (paused && queue.length <= QUEUE_LOW) {
            paused = false;
            link.resume();
          }
        }
      } catch (err) {
        const code = err.code;
        const text = code === "ENOSPC" ? "The disk is full" : `Couldn't save the file: ${err.message}`;
        await local("disk_error", text);
      } finally {
        running = false;
      }
    };
    link.on("frame", (f) => {
      if (finished) return;
      queue.push(f);
      if (!paused && queue.length >= QUEUE_HIGH) {
        paused = true;
        link.pause();
      }
      void pump();
    });
    link.on("close", () => {
      if (finished) return;
      const wait = () => running || queue.length ? setTimeout(wait, 10) : void fail(new TransferError("connection", null, "The connection was lost"));
      wait();
    });
    opts.signal?.addEventListener("abort", () => void fail(new TransferError("cancelled", null, "Cancelled")));
    link.start();
  });
}

// src/transfer/session.ts
var FINAL = ["done", "declined", "cancelled", "failed", "expired"];
var isFinal = (s) => FINAL.includes(s);
var isPending = (s) => s === "waiting" || s === "offered";
var SPEED_TAU = 2e3;
function smoothSpeed(prev, deltaBytes, dtMs) {
  if (dtMs <= 0) return prev;
  const inst = deltaBytes * 1e3 / dtMs;
  if (prev <= 0) return inst;
  const alpha = 1 - Math.exp(-dtMs / SPEED_TAU);
  return prev + (inst - prev) * alpha;
}
function secondsLeft(t) {
  if (t.speed <= 0) return null;
  return Math.max(0, (t.total - t.bytes) / t.speed);
}
function transition(t, e) {
  if (isFinal(t.status)) return t;
  switch (e.type) {
    case "accepted":
      return isPending(t.status) ? { ...t, status: "connecting", ...e.auto ? { auto: true } : {} } : t;
    case "rejected":
      return isPending(t.status) ? { ...t, status: "declined", rejectReason: e.reason, reason: e.text, endedAt: e.at } : t;
    case "linked":
      return t.status === "connecting" || t.dir === "out" && t.status === "waiting" ? { ...t, status: "active", startedAt: e.at, sampledAt: e.at } : t;
    case "progress": {
      if (t.status !== "active" || e.bytes < t.bytes) return t;
      const dt = e.at - (t.sampledAt ?? e.at);
      if (e.bytes === t.bytes && e.fileIndex === t.fileIndex && dt < 1e3) return t;
      return { ...t, bytes: Math.min(e.bytes, t.total), fileIndex: e.fileIndex, speed: smoothSpeed(t.speed, e.bytes - t.bytes, dt), sampledAt: e.at };
    }
    case "completed":
      return t.status === "active" ? { ...t, status: "done", bytes: t.total, endedAt: e.at, ...e.saved ? { saved: e.saved } : {} } : t;
    case "cancelled":
      return { ...t, status: "cancelled", cancelledBy: e.by, reason: e.text, endedAt: e.at, ...e.saved?.length ? { saved: e.saved } : {} };
    case "failed":
      return { ...t, status: "failed", reason: e.text, endedAt: e.at, ...e.saved?.length ? { saved: e.saved } : {} };
    case "expired":
      return isPending(t.status) ? { ...t, status: "expired", reason: e.text, endedAt: e.at } : t;
  }
}

// src/transfer/manager.ts
var DEFAULT_TUNING = {
  progressMs: 100,
  linkTimeoutMs: 15e3,
  graceMs: 600,
  stallMs: 3e4,
  reserveBytes: 100 * 1e3 * 1e3,
  maxIncoming: 8,
  maxPerPeer: 5,
  keepFinished: 50
};
var REJECT_TEXT = {
  declined: (n) => `${n} declined`,
  no_space: (n) => `${n} doesn't have enough free space`,
  busy: (n) => `${n} is busy with other transfers`,
  too_large: () => "too many files for one offer"
};
var newXid = () => crypto9.randomBytes(12).toString("base64url");
var TransferManager = class {
  constructor(deps) {
    this.deps = deps;
    this.t = { ...DEFAULT_TUNING, ...deps.tuning };
    this.now = deps.now ?? Date.now;
  }
  transfers = /* @__PURE__ */ new Map();
  runtime = /* @__PURE__ */ new Map();
  ticker = null;
  t;
  now;
  // ───────────── Queries ─────────────
  get(xid) {
    return this.transfers.get(xid);
  }
  /** All transfers of this session, newest first. */
  list() {
    return [...this.transfers.values()].reverse();
  }
  /** Offers waiting for our answer, newest first. */
  incomingOffers() {
    return this.list().filter((t) => t.dir === "in" && t.status === "offered");
  }
  /** Transfers that haven't ended yet, except offers waiting for our answer. */
  open() {
    return this.list().filter((t) => !isFinal(t.status) && t.status !== "offered");
  }
  /** Files are moving between us and this friend right now. */
  busyWith(id) {
    return this.list().some((t) => t.peerId === id && (t.status === "active" || t.status === "connecting"));
  }
  // ───────────── Sending ─────────────
  /**
   * Offers `files` to each recipient – one transfer per recipient, so a slow or declining one
   * never holds up the others. Returns the transfers that went out.
   */
  offer(files, recipients) {
    if (!files.length) throw new Error("No files selected");
    if (files.length > MAX_FILES) throw new Error(`At most ${MAX_FILES} files at once \u2013 zip them first`);
    const wireFiles = files.map((f) => ({ name: f.name, size: f.size }));
    const total = totalSize(wireFiles);
    if (encodeWire({ t: "offer", xid: newXid(), files: wireFiles, total }).length > MAX_FRAME - 1024) {
      throw new Error("Too many files with long names for one offer \u2013 zip them first");
    }
    const batch = newXid();
    const out = [];
    for (const id of recipients) {
      if (!this.deps.isFriend(id) || !this.deps.isOnline(id)) continue;
      const xid = newXid();
      const t = {
        xid,
        dir: "out",
        peerId: id,
        peerName: this.deps.nameOf(id),
        files: wireFiles,
        total,
        batch,
        status: "waiting",
        createdAt: this.now(),
        bytes: 0,
        fileIndex: 0,
        speed: 0,
        paths: files.map((f) => f.path)
      };
      this.transfers.set(xid, t);
      this.runtime.set(xid, { abort: new AbortController(), files, bytes: 0, fileIndex: 0, movedAt: this.now() });
      if (this.deps.send(id, { t: "offer", xid, files: wireFiles, total })) out.push(t);
      else this.apply(xid, { type: "failed", text: `${t.peerName} went offline`, at: this.now() });
    }
    this.trim();
    this.deps.changed();
    return out;
  }
  // ───────────── Receiving ─────────────
  accept(xid, auto = false) {
    const t = this.transfers.get(xid);
    if (!t || t.dir !== "in" || t.status !== "offered") return;
    if (!this.deps.isOnline(t.peerId)) {
      this.apply(xid, { type: "expired", text: `${t.peerName} went offline`, at: this.now() });
      this.deps.toast(`${t.peerName} is offline \u2013 the offer expired`, "error");
      return;
    }
    const dir = this.deps.downloadDir();
    try {
      fs13.mkdirSync(dir, { recursive: true });
    } catch (err) {
      this.deps.toast(`Can't use ${dir}: ${err.message} \u2013 pick another folder with /folder`, "error");
      return;
    }
    if (!this.hasSpace(t.total, dir, xid)) {
      this.reject(t, "no_space");
      this.deps.toast(`Not enough free space for ${filesLabel(t.files)} (${formatBytes(t.total)})`, "error");
      return;
    }
    const rt = this.runtime.get(xid);
    rt.dir = dir;
    this.apply(xid, { type: "accepted", auto });
    this.deps.send(t.peerId, { t: "accept", xid });
    this.connect(xid);
  }
  decline(xid) {
    const t = this.transfers.get(xid);
    if (!t || t.dir !== "in" || t.status !== "offered") return;
    this.reject(t, "declined");
  }
  /** Stops a transfer (either direction) or withdraws an offer we made. */
  cancel(xid) {
    const t = this.transfers.get(xid);
    if (!t || isFinal(t.status)) return;
    if (t.dir === "in" && t.status === "offered") return this.decline(xid);
    this.deps.send(t.peerId, { t: "cancel", xid });
    this.apply(xid, { type: "cancelled", by: "me", text: "cancelled by you", at: this.now() });
  }
  // ───────────── Network events ─────────────
  onWire(from, m) {
    switch (m.t) {
      case "offer":
        return this.onOffer(from, m);
      case "accept": {
        const t = this.mine(m.xid, from, "out");
        if (!t || t.status !== "waiting") return;
        this.apply(m.xid, { type: "accepted" });
        this.connect(m.xid);
        return;
      }
      case "reject": {
        const t = this.mine(m.xid, from, "out");
        if (!t || t.status !== "waiting") return;
        this.apply(m.xid, { type: "rejected", reason: m.reason, text: REJECT_TEXT[m.reason](t.peerName), at: this.now() });
        this.deps.toast(`${REJECT_TEXT[m.reason](t.peerName)} \u2013 ${filesLabel(t.files)}`, m.reason === "declined" ? "info" : "error");
        return;
      }
      case "cancel": {
        const t = this.mine(m.xid, from);
        if (!t || isFinal(t.status)) return;
        const offer = t.dir === "in" && t.status === "offered";
        this.apply(m.xid, { type: "cancelled", by: "peer", text: offer ? "withdrawn" : `cancelled by ${t.peerName}`, at: this.now() });
        this.deps.toast(offer ? `${t.peerName} withdrew the offer` : `${t.peerName} cancelled ${filesLabel(t.files)}`, offer ? "info" : "error");
        return;
      }
      default:
    }
  }
  /** A data connection came in; it's only taken if it belongs to a transfer with this peer. */
  onLink(link) {
    const t = this.transfers.get(link.xid);
    const rt = this.runtime.get(link.xid);
    const expected = t && rt && !rt.link && t.peerId === link.peerId && (t.status === "connecting" || t.dir === "out" && t.status === "waiting");
    if (!expected) {
      link.destroy("Unexpected data connection");
      return;
    }
    this.run(link.xid, link);
  }
  /** The friend session ended: unanswered offers expire. Running transfers live on their own connection. */
  onPeerOffline(id) {
    for (const t of this.list()) {
      if (t.peerId !== id) continue;
      if (isPending(t.status)) {
        this.apply(t.xid, { type: "expired", text: `${t.peerName} went offline`, at: this.now() });
      }
    }
  }
  /** App quits: tell everyone, stop everything. */
  stop() {
    for (const t of this.list()) {
      if (isFinal(t.status)) continue;
      if (t.dir === "in" && t.status === "offered") this.deps.send(t.peerId, { t: "reject", xid: t.xid, reason: "busy" });
      else this.deps.send(t.peerId, { t: "cancel", xid: t.xid });
      this.apply(t.xid, { type: "cancelled", by: "me", text: "termdrop was closed", at: this.now() });
    }
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }
  // ───────────── Internals ─────────────
  mine(xid, from, dir) {
    const t = this.transfers.get(xid);
    return t && t.peerId === from && (!dir || t.dir === dir) ? t : void 0;
  }
  onOffer(from, m) {
    if (!this.deps.isFriend(from) || this.transfers.has(m.xid)) return;
    const name = this.deps.nameOf(from);
    const t = {
      xid: m.xid,
      dir: "in",
      peerId: from,
      peerName: name,
      files: m.files,
      total: m.total,
      status: "offered",
      createdAt: this.now(),
      bytes: 0,
      fileIndex: 0,
      speed: 0
    };
    this.transfers.set(m.xid, t);
    this.runtime.set(m.xid, { abort: new AbortController(), bytes: 0, fileIndex: 0, movedAt: this.now() });
    const label = `${plural(m.files.length, "file")} \xB7 ${formatBytes(m.total)}`;
    const incoming = this.list().filter((x) => x.dir === "in" && !isFinal(x.status) && x.xid !== m.xid);
    if (incoming.length >= this.t.maxIncoming || incoming.filter((x) => x.peerId === from && x.status === "offered").length >= this.t.maxPerPeer) {
      this.reject(t, "busy");
      return;
    }
    if (!this.hasSpace(m.total, this.deps.downloadDir(), m.xid)) {
      this.reject(t, "no_space");
      this.deps.toast(`Declined ${name}'s ${label} \u2013 not enough free space`, "error");
      this.deps.notify("termdrop", `Declined ${name}'s ${label} \u2013 not enough free space`);
      return;
    }
    const quiet = this.deps.quiet?.() ?? false;
    if (this.deps.isTrusted(from) && !quiet) {
      this.deps.toast(`Receiving ${filesLabel(m.files)} from ${name} (${formatBytes(m.total)})`, "info");
      this.deps.notify("termdrop", `Receiving ${filesLabel(m.files)} from ${name}`);
      this.accept(m.xid, true);
      return;
    }
    if (!quiet) {
      this.deps.toast(`${name} wants to send you ${label}`, "info");
      this.deps.notify("termdrop", `${name} wants to send you ${label}`);
    }
    this.deps.changed();
  }
  reject(t, reason) {
    this.deps.send(t.peerId, { t: "reject", xid: t.xid, reason });
    const text = reason === "declined" ? "declined by you" : reason === "no_space" ? "not enough free space" : "too busy";
    this.apply(t.xid, { type: "rejected", reason, text, at: this.now() });
  }
  /** Room for `bytes` more at `dir`, counting what running incoming transfers still need. */
  hasSpace(bytes, dir, except) {
    const free = this.deps.freeSpace(dir);
    if (free === null) return true;
    let pending = 0;
    for (const t of this.transfers.values()) {
      if (t.xid !== except && t.dir === "in" && (t.status === "connecting" || t.status === "active")) pending += t.total - t.bytes;
    }
    return free - pending - this.t.reserveBytes >= bytes;
  }
  /** After both said yes: whoever opened the friend session opens the data connection. */
  connect(xid) {
    const t = this.transfers.get(xid);
    const rt = this.runtime.get(xid);
    rt.linkTimer = setTimeout(() => {
      const cur = this.transfers.get(xid);
      if (cur && (cur.status === "connecting" || cur.status === "waiting") && !rt.link) {
        this.deps.send(t.peerId, { t: "cancel", xid });
        this.apply(xid, { type: "failed", text: `couldn't connect to ${t.peerName}`, at: this.now() });
      }
    }, this.t.linkTimeoutMs);
    rt.linkTimer.unref();
    if (!this.deps.dialsData(t.peerId)) return;
    this.deps.dialData(t.peerId, xid).then(
      (link) => {
        const cur = this.transfers.get(xid);
        if (!cur || cur.status !== "connecting" || rt.link) return link.destroy("Not needed anymore");
        this.run(xid, link);
      },
      (err) => {
        this.deps.send(t.peerId, { t: "cancel", xid });
        this.apply(xid, { type: "failed", text: `couldn't connect to ${t.peerName} (${err.message})`, at: this.now() });
      }
    );
  }
  /** The data connection is up: pump the bytes. */
  run(xid, link) {
    const t = this.transfers.get(xid);
    const rt = this.runtime.get(xid);
    rt.link = link;
    if (rt.linkTimer) clearTimeout(rt.linkTimer);
    rt.movedAt = this.now();
    this.apply(xid, { type: "linked", at: this.now() });
    this.startTicker();
    const opts = {
      signal: rt.abort.signal,
      onProgress: (bytes, fileIndex) => {
        if (bytes > rt.bytes) rt.movedAt = this.now();
        rt.bytes = bytes;
        rt.fileIndex = fileIndex;
      }
    };
    if (t.dir === "out") {
      sendFiles(link, rt.files, opts).then(
        () => {
          this.apply(xid, { type: "completed", at: this.now() });
          this.deps.toast(`${t.peerName} received ${filesLabel(t.files)}`, "success");
        },
        (err) => this.failed(xid, err)
      );
    } else {
      receiveFiles(link, t.files, rt.dir, opts).then(
        ({ saved }) => {
          this.apply(xid, { type: "completed", at: this.now(), saved });
          this.deps.toast(`Received ${filesLabel(t.files)} from ${t.peerName}`, "success");
          this.deps.notify("termdrop", `Received ${filesLabel(t.files)} from ${t.peerName}`);
        },
        (err) => this.failed(xid, err)
      );
    }
  }
  failed(xid, err) {
    const t = this.transfers.get(xid);
    if (!t) return;
    const saved = err instanceof ReceiveError ? err.saved : void 0;
    if (isFinal(t.status)) {
      if (saved?.length && !t.saved) this.transfers.set(xid, { ...t, saved });
      return;
    }
    const e = err instanceof TransferError ? err : new TransferError("local", null, err.message);
    if (e.kind === "cancelled") return;
    const fail = () => this.apply(xid, { type: "failed", text: e.kind === "connection" ? "connection lost" : e.message, at: this.now(), saved });
    if (e.kind !== "connection") {
      fail();
      this.deps.toast(`${filesLabel(t.files)} ${t.dir === "out" ? "to" : "from"} ${t.peerName} failed: ${e.message}`, "error");
      return;
    }
    setTimeout(() => {
      const cur = this.transfers.get(xid);
      if (!cur || isFinal(cur.status)) return;
      fail();
      this.deps.toast(`Lost the connection to ${t.peerName} \u2013 ${filesLabel(t.files)} failed`, "error");
    }, this.t.graceMs).unref();
  }
  apply(xid, e) {
    const prev = this.transfers.get(xid);
    if (!prev) return;
    const next = transition(prev, e);
    if (next === prev) return;
    this.transfers.set(xid, next);
    if (isFinal(next.status)) this.ended(next);
    if (e.type !== "progress") this.deps.changed();
  }
  ended(t) {
    const rt = this.runtime.get(t.xid);
    if (rt) {
      if (rt.linkTimer) clearTimeout(rt.linkTimer);
      if (t.status !== "done") rt.abort.abort();
      this.runtime.delete(t.xid);
    }
    if (!(t.dir === "in" && t.cancelledBy === "peer" && !t.startedAt && t.reason === "withdrawn")) this.deps.record(toEntry(t, this.now()));
    this.trim();
  }
  /** Forget old finished transfers (they're in the history). */
  trim() {
    const finished = [...this.transfers.values()].filter((t) => isFinal(t.status));
    for (const t of finished.slice(0, Math.max(0, finished.length - this.t.keepFinished))) this.transfers.delete(t.xid);
  }
  /** Samples progress for the UI while something runs; stops when nothing does (idle = no redraws). */
  startTicker() {
    if (this.ticker) return;
    this.ticker = setInterval(() => this.tick(), this.t.progressMs);
    this.ticker.unref();
  }
  tick() {
    const now = this.now();
    let changed = false;
    let running = false;
    for (const [xid, rt] of this.runtime) {
      const t = this.transfers.get(xid);
      if (!t || t.status !== "active") continue;
      running = true;
      const before = this.transfers.get(xid);
      this.apply(xid, { type: "progress", bytes: rt.bytes, fileIndex: rt.fileIndex, at: now });
      if (this.transfers.get(xid) !== before) changed = true;
      if (now - rt.movedAt > this.t.stallMs) {
        this.deps.send(t.peerId, { t: "cancel", xid });
        rt.link?.destroy("Stalled");
        this.apply(xid, { type: "failed", text: "stalled \u2013 no data for a while", at: now });
        changed = true;
      }
    }
    if (changed) this.deps.changed();
    if (!running && this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }
};

// src/core/config.ts
function readConfig(paths) {
  const c2 = readJson(paths.config, null) ?? {};
  return {
    ...Number.isInteger(c2.port) ? { port: c2.port } : {},
    ...typeof c2.downloadDir === "string" && c2.downloadDir ? { downloadDir: c2.downloadDir } : {}
  };
}
function writeConfig(paths, patch) {
  const raw = readJson(paths.config, null) ?? {};
  writeJsonAtomic(paths.config, { ...raw, ...patch });
}

// src/core/store.ts
var FRIEND_ORDER = { accepted: 0, outgoing: 1, declined: 2, incoming: 3, blocked: 4 };
var AppStore = class {
  constructor(opts) {
    this.opts = opts;
    this.paths = opts.paths;
    this.hub = new Hub(opts.paths.hub);
    this.history = new HistoryBook(opts.paths);
    this.toasts = new Toasts(() => this.changed());
    this.net = new FriendNet({
      app: APP,
      paths: opts.paths,
      hub: this.hub,
      port: opts.port ?? readConfig(opts.paths).port,
      discovery: opts.discovery,
      discoveryPort: opts.discoveryPort,
      discoveryOptions: opts.discoveryOptions,
      dialIntervalMs: opts.dialIntervalMs,
      notify: opts.notify,
      wire: WIRE,
      hooks: {
        changed: () => this.changed(),
        log: (l) => this.log(l),
        event: (e) => this.onEvent(e),
        message: (s, m) => this.transfers.onWire(s.peerId, m),
        offline: (id) => this.transfers.onPeerOffline(id),
        // a friendship that has to be confirmed again starts without trust
        statePatch: (prev, next) => prev === "accepted" && next !== "accepted" ? { trusted: false } : {},
        purpose: ({ fs: fs20, hs, xid }) => this.transfers.onLink(new DataLink(fs20, hs, xid)),
        knowsId: (id) => this.history.all().some((e) => e.peerId === id),
        rekey: (oldId, newId) => this.history.rekey(oldId, newId),
        settings: (s) => this.applySettings(s)
      }
    });
    this.applySettings(this.hub.settings.get());
    setPersonColors((id) => this.contacts.get(id)?.color);
    this.transfers = new TransferManager({
      send: (id, msg) => this.net.send(id, msg),
      isOnline: (id) => this.net.isOnline(id),
      isFriend: (id) => this.contacts.get(id)?.state === "accepted",
      isTrusted: (id) => this.contacts.get(id)?.trusted === true,
      quiet: () => this.net.dnd,
      nameOf: (id) => this.peerName(id),
      dialsData: (id) => this.network.get(id)?.initiator ?? false,
      dialData: async (id, xid) => {
        const s = this.network.get(id);
        if (!s?.isOpen) throw new Error("not connected");
        const { fs: fs20, hs } = await this.network.dialPurpose(s.remoteAddress, s.remotePort, id, xid);
        return new DataLink(fs20, hs, xid);
      },
      downloadDir: () => this.downloadDir(),
      freeSpace: opts.freeSpace ?? freeSpace,
      changed: () => this.changed(),
      toast: (text, kind) => this.showToast(text, kind),
      notify: (title, body) => this.net.notify(title, body),
      record: (entry) => this.record(entry),
      tuning: opts.tuning
    });
  }
  net;
  hub;
  transfers;
  history;
  paths;
  toasts;
  listeners = /* @__PURE__ */ new Set();
  notifyQueued = false;
  sendSeq = 0;
  version = 0;
  /** Newer version on GitHub (checked by the UI at launch), shown in the header. */
  updateAvailable = null;
  /** The latest files handed to the app; the UI opens the send flow for it. */
  sendRequest = null;
  /** Creates the shared profile and keys on first launch (one profile for all apps). */
  static createProfile(paths, name) {
    return Hub.createProfile(paths.hub, name).id;
  }
  /** Is there a profile yet (in any app)? */
  static hasProfile(paths) {
    return Hub.hasProfile(paths.hub);
  }
  // ───────────── Shortcuts ─────────────
  get identity() {
    return this.net.identity;
  }
  get contacts() {
    return this.net.contacts;
  }
  get network() {
    return this.net.network;
  }
  // ───────────── Lifecycle ─────────────
  async start() {
    await this.net.start();
    this.changed();
  }
  async stop() {
    this.transfers.stop();
    this.toasts.stop();
    await this.net.stop();
  }
  // ───────────── Subscription for React ─────────────
  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  changed() {
    this.version++;
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      for (const fn of this.listeners) fn();
    });
  }
  applySettings(s) {
    if (setAccent(s.accent)) this.changed();
  }
  // ───────────── Queries ─────────────
  get me() {
    return this.net.me;
  }
  get toast() {
    return this.toasts.current;
  }
  get settings() {
    return this.net.settings;
  }
  isOnline(id) {
    return this.net.isOnline(id);
  }
  friend(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return void 0;
    const online = this.isOnline(id);
    const p = this.net.presenceOf(id);
    return {
      ...c2,
      display: displayName(c2),
      online,
      away: online && (p?.away ?? false),
      busy: this.transfers.busyWith(id),
      status: p?.status ?? "available",
      ...p?.msg ? { statusMsg: p.msg } : {}
    };
  }
  /** Best name for any peer: own nickname/friend name, else what we remember. */
  peerName(id) {
    return this.net.peerName(id);
  }
  /** Accepted friends who are online right now (who can receive files). */
  onlineFriends() {
    return this.contacts.all().filter((c2) => c2.state === "accepted" && this.isOnline(c2.id)).map((c2) => this.friend(c2.id)).sort((a, b) => a.display.localeCompare(b.display));
  }
  /** An online friend by name, nickname or ID (for `--to`); null if none or ambiguous. */
  findFriend(query) {
    const q = query.trim().toLowerCase().replace(/-/g, "");
    if (!q) return null;
    const friends = this.contacts.all().filter((c2) => c2.state === "accepted");
    const exact = friends.filter((c2) => displayName(c2).toLowerCase() === q || c2.name.toLowerCase() === q || c2.id.toLowerCase().startsWith(q));
    const prefix = exact.length ? exact : friends.filter((c2) => displayName(c2).toLowerCase().startsWith(q) || c2.name.toLowerCase().startsWith(q));
    return prefix.length === 1 ? this.friend(prefix[0].id) : null;
  }
  dashboard() {
    const all = this.contacts.all().map((c2) => this.friend(c2.id));
    const presence = (f) => f.state !== "accepted" ? 4 : f.busy && f.online ? 0 : f.online && !f.away ? 1 : f.away ? 2 : 3;
    const friends = all.filter((f) => f.state !== "incoming").sort(
      (a, b) => FRIEND_ORDER[a.state] - FRIEND_ORDER[b.state] || presence(a) - presence(b) || a.display.localeCompare(b.display)
    );
    const requests = [
      ...this.transfers.incomingOffers().map((offer) => ({ kind: "offer", offer })),
      ...all.filter((f) => f.state === "incoming").sort((a, b) => b.lastActivity - a.lastActivity).map((friend) => ({ kind: "friend", friend }))
    ];
    return { requests, friends, nearby: this.net.nearby() };
  }
  /** Number of accepted friends online. */
  onlineCount() {
    return this.net.onlineCount();
  }
  totals() {
    return this.history.totals();
  }
  safetyCodeWith(id) {
    return this.net.safetyCodeWith(id);
  }
  // ───────────── Files and folders ─────────────
  downloadDir() {
    return readConfig(this.paths).downloadDir ?? defaultDownloadDir();
  }
  /** Changes where received files go. The folder is created if needed. */
  setDownloadDir(dir) {
    const full = path17.resolve(dir);
    fs14.mkdirSync(full, { recursive: true });
    if (!fs14.statSync(full).isDirectory()) throw new Error(`${full} is not a folder`);
    fs14.accessSync(full, fs14.constants.W_OK);
    writeConfig(this.paths, { downloadDir: full });
    this.changed();
    return full;
  }
  freeSpace(dir = this.downloadDir()) {
    return (this.opts.freeSpace ?? freeSpace)(dir);
  }
  /**
   * Files handed to the app (command line, another shell, /send, a paste): checked, then the
   * UI opens the send flow with them. Returns what was accepted and what not.
   */
  requestSend(paths, to, source = "shell", recipients = false) {
    const { files, rejected } = inspectPaths(paths);
    this.sendRequest = { seq: ++this.sendSeq, files, rejected, source, ...to ? { to } : {}, ...recipients ? { recipients } : {} };
    this.changed();
    return this.sendRequest;
  }
  /** Offers files to friends (one transfer each). */
  send(files, recipients) {
    const out = this.transfers.offer(files, recipients);
    if (!out.length) throw new Error("None of them is online anymore");
    return out;
  }
  record(entry) {
    this.history.add(entry);
    if (!this.contacts.get(entry.peerId)) this.net.peerBook.update(entry.peerId, { name: entry.peerName, lastSeen: entry.ts });
  }
  // ───────────── UI helpers ─────────────
  showToast(text, kind = "info") {
    this.toasts.show(text, kind);
  }
  log(line) {
    if (this.opts.debug) appendLog(this.paths.log, line);
  }
  onEvent(e) {
    switch (e.kind) {
      case "accepted":
        return this.showToast(e.byThem ? `${e.who} accepted your friend request` : `You and ${e.who} are now friends`, "success");
      case "incoming":
        this.showToast(`${e.who} wants to be friends`, "info");
        return this.net.notify("termdrop", `${e.who} wants to be friends`);
      case "removedUs":
        return this.showToast(`${e.who} removed you as a friend \u2013 your request is waiting to be accepted`, "error");
      case "declinedUs":
        return this.showToast(`${e.who} declined your friend request`, "error");
      case "withdrawn":
        return this.showToast(`${e.who} withdrew their friend request`);
      case "requestSent":
        return this.showToast(`Friend request sent to ${e.who} \u2013 waiting for them to accept`);
      case "unreachable":
        return this.showToast(
          `Can't reach ${e.who} at ${e.ip}:${e.port} yet \u2013 still trying. A firewall may be blocking termdrop (Windows: allow Node.js for public networks \xB7 macOS: allow incoming connections for node).`,
          "error"
        );
      case "linked":
        return;
    }
  }
  // ───────────── Friends ─────────────
  /** Request to a peer from "Nearby". */
  requestNearby(id) {
    const name = this.net.discovery?.peers.get(id)?.name;
    const r = this.net.requestNearby(id);
    if (r === "sent") this.showToast(`Friend request sent to ${name ?? "them"}`);
    else if (r === "accepted") this.showToast(`You and ${this.peerName(id)} are now friends`, "success");
  }
  /** Ask again (after a decline). */
  request(id) {
    this.net.request(id);
    this.showToast("Friend request sent again");
  }
  /** Add a friend by IP – for networks that block broadcast. */
  addByAddress(host, port = APP.tcpPort) {
    return this.net.addByAddress(host, port);
  }
  accept(id) {
    const c2 = this.contacts.get(id);
    if (c2 && this.net.accept(id)) this.showToast(`You and ${displayName(c2)} are now friends`, "success");
  }
  decline(id) {
    const c2 = this.net.decline(id);
    if (c2) this.showToast(`Declined ${displayName(c2)}'s request`);
  }
  block(id) {
    const c2 = this.net.block(id, { trusted: false });
    if (c2) this.showToast(`${displayName(c2)} is blocked. No more connections will be accepted.`, "error");
  }
  unblock(id) {
    const c2 = this.net.unblock(id);
    if (c2) this.showToast(`Unblocked ${displayName(c2)} \u2013 friend request sent`, "success");
  }
  removeFriend(id) {
    const c2 = this.contacts.get(id);
    if (c2) this.net.peerBook.update(id, { name: displayName(c2) });
    this.net.remove(id);
  }
  rename(id, alias) {
    this.net.rename(id, alias);
  }
  /** Trusted friends' files are accepted without asking. */
  setTrusted(id, trusted) {
    const c2 = this.contacts.get(id);
    if (!c2 || c2.state !== "accepted") throw new Error("Only friends can be trusted");
    this.contacts.upsert(id, { trusted });
    this.showToast(
      trusted ? `${displayName(c2)} is trusted \u2013 their files are accepted automatically` : `Files from ${displayName(c2)} need your OK again`,
      "success"
    );
    this.changed();
  }
  /** Changes the shared name (all apps). */
  setName(name) {
    return this.net.setName(name);
  }
  // ───────────── Presence and notifications ─────────────
  /** Terminal window gained/lost focus. Terminals without focus reporting stay "focused". */
  setFocused(focused) {
    this.net.setFocused(focused);
  }
  /** False while the terminal window is in the background (if the terminal reports focus). */
  get isFocused() {
    return this.net.isFocused;
  }
  /** Do not disturb (profile status): offers wait quietly, no notifications. */
  get dnd() {
    return this.net.dnd;
  }
  notificationsEnabled() {
    return this.net.notificationsEnabled();
  }
  setNotifications(on) {
    this.net.setNotifications(on);
  }
  setUpdateAvailable(version) {
    if (this.updateAvailable === version) return;
    this.updateAvailable = version;
    if (version) this.showToast(`termdrop ${version} is available \u2013 /update installs it`);
    else this.changed();
  }
};

// ../termcore/src/ui/components/Header.tsx
import { Box, Text } from "ink";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var friendsOnline = (n, wide) => wide ? n === 1 ? "friend online" : "friends online" : "online";
function Header({ app, version, width, me, address, online, onlineLabel = friendsOnline, updateAvailable }) {
  const wide = width >= 72;
  const status = me.status && me.status !== "available" ? presenceDot({ online: true, status: me.status }) : null;
  const statusLine = wide ? statusText(me.status, me.statusMsg) : "";
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width, children: [
    /* @__PURE__ */ jsxs(Box, { paddingX: 1, width, children: [
      /* @__PURE__ */ jsx(Box, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsxs(Text, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx(Text, { backgroundColor: theme.accent, color: theme.onAccent, bold: true, children: ` ${app} ` }),
        /* @__PURE__ */ jsxs(Text, { color: theme.faint, children: [
          " v",
          version
        ] }),
        /* @__PURE__ */ jsx(Text, { children: "  " }),
        /* @__PURE__ */ jsx(Text, { bold: true, color: me.color, children: me.name }),
        status ? /* @__PURE__ */ jsxs(Text, { color: status.color, children: [
          " ",
          status.icon
        ] }) : null,
        statusLine ? /* @__PURE__ */ jsxs(Text, { color: theme.dim, children: [
          " ",
          statusLine
        ] }) : null,
        wide ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " }),
          /* @__PURE__ */ jsx(Text, { color: theme.dim, children: formatId(me.id) })
        ] }) : null
      ] }) }),
      /* @__PURE__ */ jsxs(Box, { flexShrink: 0, marginLeft: 1, children: [
        updateAvailable ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.accent, bold: true, children: wide ? `\u2B06 ${updateAvailable} available \xB7 /update` : "\u2B06 update" }),
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " })
        ] }) : null,
        wide ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.dim, children: address }),
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " })
        ] }) : null,
        /* @__PURE__ */ jsx(Text, { color: online ? theme.success : theme.faint, children: online ? icons.online : icons.offline }),
        /* @__PURE__ */ jsxs(Text, { color: theme.dim, children: [
          " ",
          online,
          " ",
          onlineLabel(online, wide)
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Text, { color: theme.faint, children: "\u2500".repeat(Math.max(0, width)) })
  ] });
}

// ../termcore/src/ui/components/Panel.tsx
import { Box as Box2, Text as Text2, useInput } from "ink";

// ../termcore/src/ui/text.ts
import chalk2 from "chalk";
import wrapAnsi from "wrap-ansi";
function inline(text) {
  return text.replace(/`([^`]+)`/g, (_m, s) => chalk2.hex(theme.accent)(s)).replace(/\*\*([^*]+)\*\*/g, (_m, s) => chalk2.bold(s)).replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:])/g, (_m, pre, s) => pre + chalk2.hex(theme.dim)(s));
}
function renderText(text, width) {
  const out = [];
  for (const raw of text.split("\n")) {
    const h = /^#{1,6}\s+(.*)$/.exec(raw);
    if (h) {
      out.push(chalk2.bold(inline(h[1])));
      continue;
    }
    const li = /^(\s*)[-*]\s+(.*)$/.exec(raw);
    if (li) {
      const indent = li[1].length;
      const body = wrapAnsi(inline(li[2]), Math.max(10, width - indent - 2), { hard: true }).split("\n");
      body.forEach((l, i) => out.push(" ".repeat(indent) + (i === 0 ? chalk2.hex(theme.dim)("\u2022 ") : "  ") + l));
      continue;
    }
    if (!raw.trim()) {
      out.push("");
      continue;
    }
    out.push(...wrapAnsi(inline(raw), Math.max(10, width), { hard: true }).split("\n"));
  }
  return out;
}

// ../termcore/src/ui/components/Panel.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function Panel({
  text,
  width,
  height,
  onClose,
  render: render2 = renderText
}) {
  useInput(() => onClose());
  const lines = render2(text, width - 6).slice(0, Math.max(1, height - 4));
  return /* @__PURE__ */ jsxs2(Box2, { flexDirection: "column", height, width, children: [
    /* @__PURE__ */ jsx2(Box2, { borderStyle: "round", borderColor: theme.border, paddingX: 2, flexDirection: "column", width, children: lines.map((l, i) => /* @__PURE__ */ jsx2(Text2, { wrap: "truncate-end", children: l || " " }, i)) }),
    /* @__PURE__ */ jsx2(Box2, { paddingX: 1, children: /* @__PURE__ */ jsx2(Text2, { color: theme.dim, children: "press any key to close" }) })
  ] });
}

// ../termcore/src/ui/hooks.ts
import { useStdout } from "ink";
import { useEffect, useState, useSyncExternalStore } from "react";
function useTerminalSize() {
  const { stdout } = useStdout();
  const read = () => ({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  return size;
}
function useStoreVersion(store) {
  return useSyncExternalStore(store.subscribe, store.getVersion);
}

// ../termcore/src/ui/mouse.ts
import { EventEmitter as EventEmitter8 } from "events";
import { PassThrough } from "stream";
import { useEffect as useEffect2, useRef } from "react";
var MOUSE_ON = "\x1B[?1007h\x1B[?1004h\x1B[?2004h";
var MOUSE_OFF = "\x1B[?2004l\x1B[?1004l\x1B[?1007l";
var PASTE_START = "\x1B[200~";
var PASTE_END = "\x1B[201~";
var ESC = "\x1B";
var SGR = /^\u001b\[<(\d+);(\d+);(\d+)([Mm])/;
var SGR_PARTIAL = /^\u001b\[<[\d;]*$/;
var PENDING_MS = 30;
var PASTE_PENDING_MS = 1e3;
function wheelOf(button) {
  if (!(button & 64) || button & 128) return null;
  const low = button & 3;
  return low === 0 ? -1 : low === 1 ? 1 : null;
}
function extractMouse(input, pending = "") {
  const s = pending + input;
  const events = [];
  const focus = [];
  const pastes = [];
  let text = "";
  let i = 0;
  const done = (rest) => finish(text, events, rest, focus, pastes);
  while (i < s.length) {
    const esc = s.indexOf(ESC, i);
    if (esc === -1) {
      text += s.slice(i);
      break;
    }
    text += s.slice(i, esc);
    const rest = s.slice(esc);
    if (rest.startsWith(PASTE_START)) {
      const end = rest.indexOf(PASTE_END);
      if (end === -1) return done(rest);
      pastes.push(rest.slice(PASTE_START.length, end));
      i = esc + end + PASTE_END.length;
      continue;
    }
    if (rest.startsWith(PASTE_END)) {
      i = esc + PASTE_END.length;
      continue;
    }
    if (rest.startsWith(`${ESC}[I`) || rest.startsWith(`${ESC}[O`)) {
      focus.push(rest[2] === "I");
      i = esc + 3;
      continue;
    }
    const sgr = SGR.exec(rest);
    if (sgr) {
      const dir = sgr[4] === "M" ? wheelOf(Number(sgr[1])) : null;
      if (dir) events.push(dir);
      i = esc + sgr[0].length;
      continue;
    }
    if (rest.startsWith(`${ESC}[M`)) {
      if (rest.length < 6) return done(rest);
      const dir = wheelOf(rest.charCodeAt(3) - 32);
      if (dir) events.push(dir);
      i = esc + 6;
      continue;
    }
    if (rest === ESC || rest === `${ESC}[` || SGR_PARTIAL.test(rest) || rest.length < PASTE_START.length && PASTE_START.startsWith(rest)) {
      return done(rest);
    }
    text += ESC;
    i = esc + 1;
  }
  return done("");
}
function finish(text, events, pending, focus, pastes) {
  return { text, events, pending, ...focus.length ? { focus } : {}, ...pastes.length ? { pastes } : {} };
}
var mouse = new EventEmitter8();
var pasteHandlers = [];
function emitPaste(text) {
  for (let i = pasteHandlers.length - 1; i >= 0; i--) if (pasteHandlers[i].cb(text)) return true;
  return false;
}
var MouseFilterStdin = class extends PassThrough {
  constructor(source) {
    super();
    this.source = source;
    source.setEncoding("utf8");
    source.on("data", (chunk) => this.feed(chunk));
  }
  isTTY = true;
  pending = "";
  timer = null;
  feed(chunk) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const r = extractMouse(chunk, this.pending);
    this.pending = r.pending;
    for (const e of r.events) mouse.emit("wheel", e);
    for (const f of r.focus ?? []) mouse.emit("focus", f);
    if (r.text) this.write(r.text);
    for (const p of r.pastes ?? []) this.paste(p);
    if (this.pending) {
      const inPaste = this.pending.startsWith(PASTE_START);
      this.timer = setTimeout(
        () => {
          const p = this.pending;
          this.pending = "";
          if (inPaste) this.paste(p.slice(PASTE_START.length));
          else if (p) this.write(p);
        },
        inPaste ? PASTE_PENDING_MS : PENDING_MS
      );
    }
  }
  paste(text) {
    if (!emitPaste(text) && text) this.write(text);
  }
  setRawMode(mode) {
    this.source.setRawMode(mode);
    return this;
  }
  ref() {
    this.source.ref();
    return this;
  }
  unref() {
    this.source.unref();
    return this;
  }
};
function usePaste(cb, isActive = true) {
  const latest = useRef(cb);
  latest.current = cb;
  useEffect2(() => {
    if (!isActive) return;
    const h = { cb: (text) => latest.current(text) };
    pasteHandlers.push(h);
    return () => {
      pasteHandlers.splice(pasteHandlers.indexOf(h), 1);
    };
  }, [isActive]);
}
function useWheel(cb, isActive = true) {
  const latest = useRef(cb);
  latest.current = cb;
  useEffect2(() => {
    if (!isActive) return;
    const on = (dir) => latest.current(dir);
    mouse.on("wheel", on);
    return () => {
      mouse.off("wheel", on);
    };
  }, [isActive]);
}

// src/ui/screens/Dashboard.tsx
import fs16 from "fs";
import { Box as Box10, Text as Text11, useInput as useInput4 } from "ink";
import { useEffect as useEffect5, useRef as useRef3, useState as useState5 } from "react";

// src/ui/components/Banner.tsx
import { Box as Box3, Text as Text4 } from "ink";
import stringWidth2 from "string-width";

// ../termcore/src/ui/components/Logo.tsx
import { Text as Text3 } from "ink";
import stringWidth from "string-width";

// ../termcore/src/ui/effects.ts
import chalk3 from "chalk";
import { useEffect as useEffect3, useState as useState2 } from "react";
var mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
var WHITE = [255, 255, 255];
var hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
var SHINE_SWEEP = 900;
var SHINE_HALF = 4;
var SHINE_EVERY = 6e3;
function shineColor(base, col, row, width, t) {
  const u = t / SHINE_SWEEP;
  if (u < 0 || u >= 1) return base;
  const center = (width + 2 * SHINE_HALF + 6) * u - SHINE_HALF - 6 + row;
  const strength = Math.max(0, 1 - Math.abs(col + 0.5 - center) / SHINE_HALF);
  return mix(base, WHITE, strength * 0.85);
}
function shineLine(line, row, width, hex, t) {
  if (t < 0 || t >= SHINE_SWEEP) return chalk3.hex(hex)(line);
  const base = hexToRgb(hex);
  let out = "";
  let col = 0;
  for (const ch of line) {
    if (ch === " ") out += ch;
    else {
      const [r, g, b] = shineColor(base, col, row, width, t);
      out += chalk3.rgb(Math.round(r), Math.round(g), Math.round(b))(ch);
    }
    col++;
  }
  return out;
}
var BRIEF_GLINTS = 2;
function useShine(active, mode = "brief", delay = 250) {
  const [t, setT] = useState2(-1);
  useEffect3(() => {
    if (!active || mode === "off") {
      setT(-1);
      return;
    }
    let sweep = null;
    let next = null;
    let played = 0;
    const play = () => {
      const t0 = Date.now();
      played++;
      sweep = setInterval(() => {
        const dt = Date.now() - t0;
        if (dt < SHINE_SWEEP) return setT(dt);
        if (sweep) clearInterval(sweep);
        sweep = null;
        setT(-1);
        if (mode === "nonstop" || played < BRIEF_GLINTS) next = setTimeout(play, SHINE_EVERY - SHINE_SWEEP);
      }, 33);
    };
    next = setTimeout(play, delay);
    return () => {
      if (next) clearTimeout(next);
      if (sweep) clearInterval(sweep);
    };
  }, [active, mode, delay]);
  return t;
}

// ../termcore/src/ui/components/Logo.tsx
import { Fragment as Fragment2, jsx as jsx3 } from "react/jsx-runtime";
function Logo({ lines, animate = true, mode = "brief", color }) {
  const t = useShine(animate, mode);
  const width = Math.max(...lines.map((l) => stringWidth(l)));
  return /* @__PURE__ */ jsx3(Fragment2, { children: lines.map((line, i) => /* @__PURE__ */ jsx3(Text3, { children: shineLine(line, i, width, color ?? theme.accent, t) }, i)) });
}

// src/ui/components/Banner.tsx
import { jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
var LOGO = [
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 ",
  "\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557",
  "   \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2554\u2588\u2588\u2588\u2588\u2554\u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D",
  "   \u2588\u2588\u2551   \u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551\u255A\u2588\u2588\u2554\u255D\u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u255D ",
  "   \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551 \u255A\u2550\u255D \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551  \u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551     ",
  "   \u255A\u2550\u255D   \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D     \u255A\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D  \u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D     "
];
var LOGO_SMALL = ["\u2580\u2588\u2580 \u2588\u2580\u2580 \u2588\u2580\u2588 \u2588\u2580\u2584\u2580\u2588 \u2588\u2580\u2584 \u2588\u2580\u2588 \u2588\u2580\u2588 \u2588\u2580\u2588", " \u2588  \u2588\u2588\u2584 \u2588\u2580\u2584 \u2588 \u2580 \u2588 \u2588\u2584\u2580 \u2588\u2580\u2584 \u2588\u2584\u2588 \u2588\u2580\u2580"];
var LOGO_WIDTH = stringWidth2(LOGO[0]);
function bannerCompact(width, rows) {
  return width < 80 || rows < 24;
}
function bannerHeight(compact2) {
  return (compact2 ? LOGO_SMALL.length : LOGO.length) + 4;
}
function Banner({
  width,
  compact: compact2,
  selected,
  animate = true,
  mode = "brief"
}) {
  return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", width, alignItems: "center", flexShrink: 0, children: [
    /* @__PURE__ */ jsx4(Logo, { lines: compact2 ? LOGO_SMALL : LOGO, animate, mode }),
    /* @__PURE__ */ jsx4(Text4, { children: " " }),
    /* @__PURE__ */ jsxs3(Box3, { children: [
      /* @__PURE__ */ jsx4(Text4, { color: theme.accent, children: selected ? `${icons.pointer} ` : "  " }),
      /* @__PURE__ */ jsx4(Text4, { backgroundColor: selected ? theme.accent : void 0, color: selected ? "#1E1E1E" : theme.accent, bold: true, children: ` ${icons.send} Send files ` }),
      /* @__PURE__ */ jsx4(Text4, { color: theme.dim, children: selected ? " enter" : "      " })
    ] }),
    /* @__PURE__ */ jsx4(Text4, { color: theme.faint, children: "or drag files into this window" }),
    /* @__PURE__ */ jsx4(Text4, { children: " " })
  ] });
}

// ../termcore/src/ui/components/CommandMenu.tsx
import { Box as Box4, Text as Text5 } from "ink";
import { jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
var MENU_MAX = 6;
function menuHeight(count) {
  return count ? Math.min(count, MENU_MAX) : 0;
}
function CommandMenu({ items, selected, width }) {
  if (!items.length) return null;
  const start2 = Math.max(0, Math.min(selected - MENU_MAX + 1, items.length - MENU_MAX));
  const visible = items.slice(start2, start2 + MENU_MAX);
  const nameWidth = Math.min(34, Math.max(...items.map((it) => it.label.length)) + 2);
  return /* @__PURE__ */ jsx5(Box4, { flexDirection: "column", width, paddingX: 2, children: visible.map((item, i) => {
    const active = start2 + i === selected;
    return /* @__PURE__ */ jsxs4(Box4, { children: [
      /* @__PURE__ */ jsx5(Box4, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx5(Text5, { color: active ? theme.accent : void 0, bold: active, wrap: "truncate-end", children: item.label }) }),
      /* @__PURE__ */ jsx5(Text5, { color: active ? void 0 : theme.dim, wrap: "truncate-end", children: item.description })
    ] }, item.key);
  }) });
}

// ../termcore/src/ui/components/Dialog.tsx
import { Box as Box6, Text as Text7, useInput as useInput3 } from "ink";
import { useState as useState3 } from "react";

// ../termcore/src/ui/editor.ts
import stringWidth3 from "string-width";
var emptyEditor = { value: "", cursor: 0 };
var segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
function graphemes(text) {
  return [...segmenter.segment(text)].map((s) => ({ segment: s.segment, index: s.index }));
}
function prevBoundary(value, cursor) {
  let prev = 0;
  for (const g of graphemes(value)) {
    if (g.index >= cursor) break;
    prev = g.index;
  }
  return prev;
}
function nextBoundary(value, cursor) {
  for (const g of graphemes(value)) {
    if (g.index >= cursor) return g.index + g.segment.length;
  }
  return value.length;
}
var isWordChar = (ch) => /[\p{L}\p{N}_]/u.test(ch);
function wordLeft(value, cursor) {
  let i = cursor;
  while (i > 0 && !isWordChar(value[i - 1])) i--;
  while (i > 0 && isWordChar(value[i - 1])) i--;
  return i;
}
function wordRight(value, cursor) {
  let i = cursor;
  while (i < value.length && !isWordChar(value[i])) i++;
  while (i < value.length && isWordChar(value[i])) i++;
  return i;
}
var lineStart = (value, cursor) => value.lastIndexOf("\n", cursor - 1) + 1;
var lineEnd = (value, cursor) => {
  const i = value.indexOf("\n", cursor);
  return i === -1 ? value.length : i;
};
var edit = {
  insert(s, text) {
    return { value: s.value.slice(0, s.cursor) + text + s.value.slice(s.cursor), cursor: s.cursor + text.length };
  },
  backspace(s) {
    if (s.cursor === 0) return s;
    const p = prevBoundary(s.value, s.cursor);
    return { value: s.value.slice(0, p) + s.value.slice(s.cursor), cursor: p };
  },
  deleteForward(s) {
    if (s.cursor >= s.value.length) return s;
    const n = nextBoundary(s.value, s.cursor);
    return { value: s.value.slice(0, s.cursor) + s.value.slice(n), cursor: s.cursor };
  },
  deleteWordBack(s) {
    const p = wordLeft(s.value, s.cursor);
    return { value: s.value.slice(0, p) + s.value.slice(s.cursor), cursor: p };
  },
  killToLineStart(s) {
    const p = lineStart(s.value, s.cursor);
    return { value: s.value.slice(0, p) + s.value.slice(s.cursor), cursor: p };
  },
  killToLineEnd(s) {
    const e = lineEnd(s.value, s.cursor);
    return { value: s.value.slice(0, s.cursor) + s.value.slice(e), cursor: s.cursor };
  },
  left: (s) => ({ ...s, cursor: prevBoundary(s.value, s.cursor) }),
  right: (s) => ({ ...s, cursor: nextBoundary(s.value, s.cursor) }),
  wordLeft: (s) => ({ ...s, cursor: wordLeft(s.value, s.cursor) }),
  wordRight: (s) => ({ ...s, cursor: wordRight(s.value, s.cursor) }),
  home: (s) => ({ ...s, cursor: lineStart(s.value, s.cursor) }),
  end: (s) => ({ ...s, cursor: lineEnd(s.value, s.cursor) }),
  /** One line up/down; `null` if already on the first/last line. */
  vertical(s, dir) {
    const start2 = lineStart(s.value, s.cursor);
    const col = s.cursor - start2;
    if (dir === -1) {
      if (start2 === 0) return null;
      const prevStart = lineStart(s.value, start2 - 1);
      return { ...s, cursor: Math.min(prevStart + col, start2 - 1) };
    }
    const end = lineEnd(s.value, s.cursor);
    if (end === s.value.length) return null;
    const nextEnd = lineEnd(s.value, end + 1);
    return { ...s, cursor: Math.min(end + 1 + col, nextEnd) };
  }
};
function cleanPaste(text) {
  return text.replace(/\u001b\[20[01]~/g, "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "");
}
function layoutEditor(s, width) {
  const w = Math.max(1, width);
  const lines = [];
  let offset = 0;
  for (const logical of s.value.split("\n")) {
    let current = "";
    let currentWidth = 0;
    let cursorAt = null;
    for (const g of graphemes(logical)) {
      const gw = stringWidth3(g.segment);
      if (currentWidth + gw > w) {
        lines.push({ text: current, cursor: cursorAt });
        current = "";
        currentWidth = 0;
        cursorAt = null;
      }
      if (offset + g.index === s.cursor) cursorAt = current.length;
      current += g.segment;
      currentWidth += gw;
    }
    if (offset + logical.length === s.cursor) {
      if (currentWidth >= w) {
        lines.push({ text: current, cursor: cursorAt });
        current = "";
        currentWidth = 0;
        cursorAt = null;
      }
      cursorAt = current.length;
    }
    lines.push({ text: current, cursor: cursorAt });
    offset += logical.length + 1;
  }
  return lines;
}

// ../termcore/src/ui/components/InputBox.tsx
import { Box as Box5, Text as Text6, useInput as useInput2 } from "ink";
import { useRef as useRef2 } from "react";
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
function inputBoxHeight(state, width, maxLines = 8) {
  return Math.min(layoutEditor(state, contentWidth(width)).length, maxLines) + 2;
}
var contentWidth = (width) => Math.max(
  4,
  width - 2 - 2 - 2
  /* Prompt */
);
function InputBox({
  state,
  onChange,
  onSubmit,
  isActive,
  width,
  placeholder,
  maxLines = 8,
  history = [],
  onKey,
  singleLine = false,
  borderColor = theme.border,
  maxLength,
  onPaste,
  afterType
}) {
  const histIndex = useRef2(null);
  const draft = useRef2("");
  const latest = useRef2(state);
  latest.current = state;
  const change = (next) => {
    latest.current = next;
    onChange(next);
  };
  const recall = (dir) => {
    if (!history.length) return false;
    let idx = histIndex.current;
    if (idx === null) {
      if (dir === 1) return false;
      draft.current = latest.current.value;
      idx = history.length;
    }
    idx += dir;
    if (idx < 0) return true;
    if (idx >= history.length) {
      histIndex.current = null;
      change({ value: draft.current, cursor: draft.current.length });
      return true;
    }
    histIndex.current = idx;
    const v = history[idx];
    change({ value: v, cursor: v.length });
    return true;
  };
  const insertText = (raw, typed = false) => {
    let text = cleanPaste(raw);
    if (singleLine) text = text.replace(/\n/g, " ");
    const state2 = latest.current;
    if (!text) return;
    if (maxLength !== void 0 && [...state2.value].length + [...text].length > maxLength) return;
    histIndex.current = null;
    const next = edit.insert(state2, text);
    change(typed && afterType ? afterType(next, raw) : next);
  };
  usePaste((text) => {
    if (!onPaste?.(text)) insertText(text);
    return true;
  }, isActive);
  useInput2(
    (input, key) => {
      if (onKey?.(input, key)) return;
      if (key.ctrl && input === "c") return;
      const state2 = latest.current;
      const set = (next) => {
        histIndex.current = null;
        change(next);
      };
      if (key.return) {
        if (!singleLine && key.meta) return set(edit.insert(state2, "\n"));
        if (!singleLine && state2.value[state2.cursor - 1] === "\\") {
          return set(edit.insert(edit.backspace(state2), "\n"));
        }
        histIndex.current = null;
        onSubmit(state2.value);
        return;
      }
      if (key.escape) return;
      if (key.tab) return;
      if ((key.backspace || key.delete) && key.meta) return set(edit.deleteWordBack(state2));
      if (key.backspace || key.delete) return set(edit.backspace(state2));
      if (key.leftArrow) return set(key.meta || key.ctrl ? edit.wordLeft(state2) : edit.left(state2));
      if (key.rightArrow) return set(key.meta || key.ctrl ? edit.wordRight(state2) : edit.right(state2));
      if (key.home) return set(edit.home(state2));
      if (key.end) return set(edit.end(state2));
      if (key.upArrow) {
        const moved = edit.vertical(state2, -1);
        if (moved) return set(moved);
        recall(-1);
        return;
      }
      if (key.downArrow) {
        const moved = edit.vertical(state2, 1);
        if (moved) return set(moved);
        recall(1);
        return;
      }
      if (key.pageUp || key.pageDown) return;
      if (key.ctrl) {
        switch (input) {
          case "a":
            return set(edit.home(state2));
          case "e":
            return set(edit.end(state2));
          case "u":
            return set(edit.killToLineStart(state2));
          case "k":
            return set(edit.killToLineEnd(state2));
          case "w":
            return set(edit.deleteWordBack(state2));
          case "d":
            return set(edit.deleteForward(state2));
          case "j":
            return singleLine ? void 0 : set(edit.insert(state2, "\n"));
          default:
            return;
        }
      }
      if (key.meta) {
        if (input === "b") return set(edit.wordLeft(state2));
        if (input === "f") return set(edit.wordRight(state2));
        return;
      }
      if (input.length > 1 && onPaste?.(input)) return;
      insertText(input, true);
    },
    { isActive }
  );
  const cw = contentWidth(width);
  const lines = layoutEditor(state, cw);
  const cursorLine = Math.max(0, lines.findIndex((l) => l.cursor !== null));
  const start2 = Math.max(0, Math.min(cursorLine - maxLines + 1, lines.length - maxLines));
  const visible = lines.slice(start2, start2 + maxLines);
  const empty = state.value.length === 0;
  return /* @__PURE__ */ jsx6(Box5, { borderStyle: "round", borderColor, paddingX: 1, width, flexDirection: "column", flexShrink: 0, children: visible.map((line, i) => {
    const prompt = start2 + i === 0 ? `${icons.pointer} ` : "  ";
    if (empty && i === 0) {
      return /* @__PURE__ */ jsxs5(Text6, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: prompt }),
        isActive ? /* @__PURE__ */ jsx6(Text6, { inverse: true, children: " " }) : null,
        /* @__PURE__ */ jsx6(Text6, { color: theme.faint, children: placeholder ?? "" })
      ] }, i);
    }
    const cur = isActive ? line.cursor : null;
    if (cur === null) {
      return /* @__PURE__ */ jsxs5(Text6, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: prompt }),
        line.text
      ] }, i);
    }
    const at = [...new Intl.Segmenter().segment(line.text.slice(cur))][0]?.segment ?? " ";
    return /* @__PURE__ */ jsxs5(Text6, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: prompt }),
      line.text.slice(0, cur),
      /* @__PURE__ */ jsx6(Text6, { inverse: true, children: at }),
      line.text.slice(cur + (at === " " && cur >= line.text.length ? 0 : at.length))
    ] }, i);
  }) });
}

// ../termcore/src/ui/components/Dialog.tsx
import { Fragment as Fragment3, jsx as jsx7, jsxs as jsxs6 } from "react/jsx-runtime";
var PICK_VISIBLE = 8;
function dialogHeight(d) {
  if (d.kind === "confirm") return 4;
  if (d.kind === "prompt") return 7 + (d.hint ? 1 : 0);
  if (d.kind === "custom") return d.height;
  return 4 + Math.min(d.options.length, PICK_VISIBLE);
}
function Dialog({ spec, width }) {
  if (spec.kind === "confirm") return /* @__PURE__ */ jsx7(ConfirmDialog, { spec, width });
  if (spec.kind === "prompt") return /* @__PURE__ */ jsx7(PromptDialog, { spec, width });
  if (spec.kind === "custom") return /* @__PURE__ */ jsx7(Fragment3, { children: spec.render(width) });
  return /* @__PURE__ */ jsx7(PickDialog, { spec, width });
}
function DialogFrame({ width, children }) {
  return /* @__PURE__ */ jsx7(Box6, { borderStyle: "round", borderColor: theme.accent, paddingX: 1, width, flexDirection: "column", flexShrink: 0, children });
}
function ConfirmDialog({ spec, width }) {
  useInput3((input, key) => {
    if (key.return || input === "y") spec.resolve(true);
    else if (key.escape || input === "n") spec.resolve(false);
  });
  return /* @__PURE__ */ jsxs6(DialogFrame, { width, children: [
    /* @__PURE__ */ jsx7(Text7, { bold: true, wrap: "truncate-end", children: spec.title }),
    /* @__PURE__ */ jsxs6(Text7, { color: theme.dim, children: [
      /* @__PURE__ */ jsx7(Text7, { color: theme.accent, children: "enter" }),
      "/",
      /* @__PURE__ */ jsx7(Text7, { color: theme.accent, children: "y" }),
      " yes \xB7 ",
      /* @__PURE__ */ jsx7(Text7, { color: theme.accent, children: "esc" }),
      "/",
      /* @__PURE__ */ jsx7(Text7, { color: theme.accent, children: "n" }),
      " cancel"
    ] })
  ] });
}
function PromptDialog({ spec, width }) {
  const [state, setState] = useState3(
    () => spec.initial ? { value: spec.initial, cursor: spec.initial.length } : emptyEditor
  );
  return /* @__PURE__ */ jsxs6(DialogFrame, { width, children: [
    /* @__PURE__ */ jsx7(Text7, { bold: true, wrap: "truncate-end", children: spec.title }),
    spec.hint ? /* @__PURE__ */ jsx7(Text7, { color: theme.dim, wrap: "truncate-end", children: spec.hint }) : null,
    /* @__PURE__ */ jsx7(
      InputBox,
      {
        state,
        onChange: setState,
        onSubmit: (v) => spec.resolve(v.trim()),
        onKey: (_i, key) => {
          if (key.escape) {
            spec.resolve(null);
            return true;
          }
          return false;
        },
        isActive: true,
        singleLine: true,
        width: width - 4
      }
    ),
    /* @__PURE__ */ jsx7(Text7, { color: theme.dim, wrap: "truncate-end", children: "enter confirm \xB7 esc cancel" })
  ] });
}
function PickDialog({ spec, width }) {
  const [cursor, setCursor] = useState3(0);
  const [chosen, setChosen] = useState3(() => new Set(spec.opts?.preselect ?? []));
  const n = spec.options.length;
  useWheel((dir) => setCursor((c2) => Math.max(0, Math.min(n - 1, c2 + dir))));
  useInput3((input, key) => {
    if (key.escape) return spec.resolve(null);
    if (key.upArrow || input === "k") return setCursor((c2) => (c2 - 1 + n) % n);
    if (key.downArrow || input === "j") return setCursor((c2) => (c2 + 1) % n);
    const current = spec.options[cursor];
    if (input === " " && spec.multi && current) {
      setChosen((s) => {
        const next = new Set(s);
        if (next.has(current.id)) next.delete(current.id);
        else next.add(current.id);
        return next;
      });
      return;
    }
    if (key.return) {
      if (!spec.multi) return spec.resolve(current ? [current.id] : []);
      if (chosen.size) return spec.resolve(spec.options.filter((o) => chosen.has(o.id)).map((o) => o.id));
      spec.resolve(spec.opts?.emptyOk || !current ? [] : [current.id]);
    }
  });
  const start2 = Math.max(0, Math.min(cursor - PICK_VISIBLE + 1, n - PICK_VISIBLE));
  const visible = spec.options.slice(start2, start2 + PICK_VISIBLE);
  return /* @__PURE__ */ jsxs6(DialogFrame, { width, children: [
    /* @__PURE__ */ jsxs6(Text7, { bold: true, wrap: "truncate-end", children: [
      spec.title,
      spec.multi && chosen.size ? /* @__PURE__ */ jsxs6(Text7, { color: theme.dim, children: [
        " \xB7 ",
        chosen.size,
        " selected"
      ] }) : null
    ] }),
    visible.map((o, i) => {
      const active = start2 + i === cursor;
      const box = spec.multi ? chosen.has(o.id) ? "[x] " : "[ ] " : "";
      return /* @__PURE__ */ jsxs6(Text7, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx7(Text7, { color: theme.accent, children: active ? `${icons.pointer} ` : "  " }),
        /* @__PURE__ */ jsx7(Text7, { color: chosen.has(o.id) ? theme.success : theme.dim, children: box }),
        /* @__PURE__ */ jsx7(Text7, { bold: active, color: active ? theme.accent : void 0, children: o.label }),
        o.hint ? /* @__PURE__ */ jsxs6(Text7, { color: theme.faint, children: [
          " \xB7 ",
          o.hint
        ] }) : null
      ] }, o.id);
    }),
    /* @__PURE__ */ jsx7(Text7, { color: theme.dim, wrap: "truncate-end", children: spec.multi ? `\u2191\u2193 move \xB7 space select \xB7 enter confirm${spec.opts?.emptyHint ? ` (${spec.opts.emptyHint})` : ""} \xB7 esc cancel` : "\u2191\u2193 move \xB7 enter choose \xB7 esc cancel" })
  ] });
}

// ../termcore/src/ui/components/Footer.tsx
import { Box as Box7, Text as Text8 } from "ink";
import { jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
var kindStyle = (kind) => kind === "success" ? { color: theme.success, icon: icons.done } : kind === "error" ? { color: theme.error, icon: icons.error } : { color: theme.accent, icon: icons.request };
function Footer({ hints, toast, width }) {
  if (toast) {
    const s = kindStyle(toast.kind);
    return /* @__PURE__ */ jsx8(Box7, { width, paddingX: 1, children: /* @__PURE__ */ jsxs7(Text8, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsxs7(Text8, { color: s.color, children: [
        s.icon,
        " "
      ] }),
      toast.text
    ] }) });
  }
  return /* @__PURE__ */ jsx8(Box7, { width, paddingX: 1, children: /* @__PURE__ */ jsx8(Text8, { color: theme.dim, wrap: "truncate-end", children: hints.join(" \xB7 ") }) });
}

// src/ui/components/OfferDetail.tsx
import { Box as Box8, Text as Text9 } from "ink";
import { jsx as jsx9, jsxs as jsxs8 } from "react/jsx-runtime";
function offerDetailHeight(offer, maxFiles) {
  const shown = Math.min(offer.files.length, maxFiles);
  const more = offer.files.length > shown ? 1 : 0;
  return 2 + 1 + 1 + shown + more + 1 + 1 + 1 + 1 + 1;
}
function OfferDetail({ store, offer, width, maxFiles }) {
  const inner = width - 4;
  const shown = offer.files.slice(0, Math.max(1, maxFiles));
  const dir = store.downloadDir();
  const free = store.freeSpace(dir);
  return /* @__PURE__ */ jsxs8(Box8, { flexDirection: "column", borderStyle: "round", borderColor: theme.accent, paddingX: 1, width, flexShrink: 0, children: [
    /* @__PURE__ */ jsxs8(Text9, { bold: true, wrap: "truncate-end", children: [
      /* @__PURE__ */ jsxs8(Text9, { color: theme.accent, children: [
        icons.request,
        " "
      ] }),
      offer.peerName,
      /* @__PURE__ */ jsx9(Text9, { color: theme.dim, children: " wants to send you" })
    ] }),
    /* @__PURE__ */ jsx9(Text9, { children: " " }),
    shown.map((f, i) => /* @__PURE__ */ jsxs8(Box8, { width: inner, children: [
      /* @__PURE__ */ jsx9(Box8, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx9(Text9, { color: theme.faint, children: icons.file }) }),
      /* @__PURE__ */ jsx9(Box8, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsx9(Text9, { wrap: "truncate-middle", children: f.name }) }),
      /* @__PURE__ */ jsx9(Box8, { flexShrink: 0, marginLeft: 1, children: /* @__PURE__ */ jsx9(Text9, { color: theme.dim, children: formatBytes(f.size) }) })
    ] }, i)),
    offer.files.length > shown.length ? /* @__PURE__ */ jsxs8(Text9, { color: theme.dim, children: [
      "  \u2026 and ",
      plural(offer.files.length - shown.length, "more file")
    ] }) : null,
    /* @__PURE__ */ jsx9(Text9, { children: " " }),
    /* @__PURE__ */ jsxs8(Text9, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx9(Text9, { bold: true, children: plural(offer.files.length, "file") }),
      /* @__PURE__ */ jsx9(Text9, { color: theme.dim, children: " \xB7 " }),
      /* @__PURE__ */ jsx9(Text9, { bold: true, children: formatBytes(offer.total) })
    ] }),
    /* @__PURE__ */ jsxs8(Text9, { color: theme.dim, wrap: "truncate-middle", children: [
      "to ",
      tildify(dir),
      free !== null ? ` \xB7 ${formatBytes(free)} free` : ""
    ] }),
    /* @__PURE__ */ jsx9(Text9, { children: " " }),
    /* @__PURE__ */ jsxs8(Text9, { color: theme.dim, wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx9(Text9, { color: theme.accent, children: "enter" }),
      " accept \xB7 ",
      /* @__PURE__ */ jsx9(Text9, { color: theme.accent, children: "x" }),
      " decline"
    ] })
  ] });
}

// src/ui/components/TransferList.tsx
import { Box as Box9, Text as Text10 } from "ink";
import { Fragment as Fragment4, jsx as jsx10, jsxs as jsxs9 } from "react/jsx-runtime";
var itemKey = (i) => i.kind === "live" ? i.t.xid : i.e.xid;
var RECENT = 5;
function transferItems(store, recent = RECENT) {
  const live = store.transfers.open().map((t) => ({ kind: "live", t }));
  const done = store.history.recent(recent).map((e) => ({ kind: "done", e }));
  return [...live, ...done];
}
var itemRows = (i) => i.kind === "live" && (i.t.status === "active" || i.t.status === "connecting") ? 2 : 1;
function transferPanelHeight(items, compact2) {
  const live = items.filter((i) => i.kind === "live");
  const done = items.filter((i) => i.kind === "done");
  const shownDone = compact2 ? done.slice(0, 2) : done;
  let rows = 2 + 1;
  rows += live.length ? live.reduce((n, i) => n + itemRows(i), 0) : 1;
  if (shownDone.length) rows += 1 + 1 + shownDone.length;
  if (!compact2) rows += 2;
  return rows;
}
var Title = ({ children }) => /* @__PURE__ */ jsx10(Text10, { color: theme.dim, bold: true, children: children.toUpperCase() });
function Bar({ fill, width, color }) {
  const w = Math.max(4, width);
  const full = Math.round(Math.max(0, Math.min(1, fill)) * w);
  return /* @__PURE__ */ jsxs9(Text10, { children: [
    /* @__PURE__ */ jsx10(Text10, { color, children: "\u2501".repeat(full) }),
    /* @__PURE__ */ jsx10(Text10, { color: theme.faint, children: "\u2500".repeat(w - full) })
  ] });
}
var RESULT_LABEL = {
  done: "done",
  declined: "declined",
  cancelled: "cancelled",
  failed: "failed",
  expired: "expired"
};
function Cell({ children, color }) {
  return /* @__PURE__ */ jsx10(Box9, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx10(Text10, { color, children }) });
}
var Arrow = ({ dir }) => /* @__PURE__ */ jsx10(Cell, { color: dir === "out" ? theme.accent : theme.peer, children: dir === "out" ? icons.up : icons.down });
var Pointer = ({ on }) => /* @__PURE__ */ jsx10(Cell, { color: theme.accent, children: on ? icons.pointer : " " });
function LiveRow({ t, width, selected, nameW }) {
  const head = /* @__PURE__ */ jsxs9(Box9, { width, children: [
    /* @__PURE__ */ jsx10(Pointer, { on: selected }),
    /* @__PURE__ */ jsx10(Arrow, { dir: t.dir }),
    /* @__PURE__ */ jsx10(Box9, { width: nameW, flexShrink: 0, children: /* @__PURE__ */ jsx10(Text10, { bold: selected, color: selected ? theme.accent : void 0, wrap: "truncate-end", children: t.peerName }) }),
    /* @__PURE__ */ jsx10(Box9, { flexGrow: 1, flexShrink: 1, minWidth: 0, marginLeft: 1, children: /* @__PURE__ */ jsx10(Text10, { wrap: "truncate-middle", children: t.status === "active" && t.files.length > 1 ? `${t.files[t.fileIndex]?.name ?? ""} \xB7 ${t.fileIndex + 1}/${t.files.length}` : filesLabel(t.files) }) }),
    t.status === "waiting" ? /* @__PURE__ */ jsx10(Box9, { flexShrink: 0, marginLeft: 1, children: /* @__PURE__ */ jsxs9(Text10, { color: theme.warning, children: [
      icons.pending,
      " waiting"
    ] }) }) : null
  ] });
  if (t.status !== "active" && t.status !== "connecting") return head;
  const fill = t.total ? t.bytes / t.total : 1;
  const pct = `${Math.floor(fill * 100)}%`;
  const info = t.status === "connecting" ? "connecting \u2026" : t.speed > 0 ? `${formatSpeed(t.speed)} \xB7 ${formatEta(secondsLeft(t))}` : "starting \u2026";
  const barW = Math.max(6, Math.min(16, width - 4 - 5 - Math.min(info.length, 24) - 1));
  return /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", width, children: [
    head,
    /* @__PURE__ */ jsxs9(Box9, { width, paddingLeft: 4, children: [
      /* @__PURE__ */ jsx10(Box9, { flexShrink: 0, children: /* @__PURE__ */ jsx10(Bar, { fill, width: barW, color: theme.accent }) }),
      /* @__PURE__ */ jsx10(Box9, { width: 5, flexShrink: 0, justifyContent: "flex-end", children: /* @__PURE__ */ jsx10(Text10, { children: pct }) }),
      /* @__PURE__ */ jsx10(Box9, { flexGrow: 1, flexShrink: 1, minWidth: 0, marginLeft: 1, children: /* @__PURE__ */ jsx10(Text10, { color: theme.dim, wrap: "truncate-end", children: info }) })
    ] })
  ] });
}
function DoneRow({ e, width, selected, nameW }) {
  const ok = e.result === "done";
  const right = ok ? formatBytes(e.total) : RESULT_LABEL[e.result];
  return /* @__PURE__ */ jsxs9(Box9, { width, children: [
    /* @__PURE__ */ jsx10(Pointer, { on: selected }),
    /* @__PURE__ */ jsx10(Cell, { color: ok ? theme.success : theme.error, children: ok ? icons.done : icons.error }),
    /* @__PURE__ */ jsx10(Arrow, { dir: e.dir }),
    /* @__PURE__ */ jsx10(Box9, { width: nameW, flexShrink: 0, children: /* @__PURE__ */ jsx10(Text10, { bold: selected, color: selected ? theme.accent : void 0, wrap: "truncate-end", children: e.peerName }) }),
    /* @__PURE__ */ jsx10(Box9, { flexGrow: 1, flexShrink: 1, minWidth: 0, marginLeft: 1, children: /* @__PURE__ */ jsx10(Text10, { color: theme.dim, wrap: "truncate-middle", children: filesLabel(e.files) }) }),
    /* @__PURE__ */ jsx10(Box9, { flexShrink: 0, marginLeft: 1, children: /* @__PURE__ */ jsx10(Text10, { color: ok ? theme.dim : theme.error, children: right }) })
  ] });
}
function TransferList({
  store,
  items,
  width,
  compact: compact2,
  selected,
  focused
}) {
  const inner = width - 4;
  const live = items.filter((i) => i.kind === "live");
  const done = items.filter((i) => i.kind === "done");
  const shownDone = compact2 ? done.slice(0, 2) : done;
  const totals = store.totals();
  const sel = (key) => focused && selected === key;
  const nameW = Math.max(4, Math.min(10, ...items.map((i) => (i.kind === "live" ? i.t.peerName : i.e.peerName).length)));
  return /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", borderStyle: "round", borderColor: focused ? theme.accent : theme.border, paddingX: 1, width, flexShrink: 0, children: [
    /* @__PURE__ */ jsx10(Title, { children: live.length ? `Transfers \xB7 ${live.length}` : "Transfers" }),
    live.length ? live.map((i) => /* @__PURE__ */ jsx10(LiveRow, { t: i.t, width: inner, selected: sel(i.t.xid), nameW }, i.t.xid)) : /* @__PURE__ */ jsx10(Text10, { color: theme.faint, wrap: "truncate-end", children: "Nothing running right now." }),
    shownDone.length ? /* @__PURE__ */ jsxs9(Fragment4, { children: [
      /* @__PURE__ */ jsx10(Text10, { children: " " }),
      /* @__PURE__ */ jsx10(Title, { children: "Recent" }),
      shownDone.map((i) => /* @__PURE__ */ jsx10(DoneRow, { e: i.e, width: inner, selected: sel(i.e.xid), nameW }, i.e.xid))
    ] }) : null,
    !compact2 ? /* @__PURE__ */ jsxs9(Fragment4, { children: [
      /* @__PURE__ */ jsx10(Text10, { children: " " }),
      /* @__PURE__ */ jsxs9(Text10, { color: theme.dim, wrap: "truncate-end", children: [
        icons.up,
        " ",
        formatBytes(totals.sentBytes),
        " sent \xB7 ",
        icons.down,
        " ",
        formatBytes(totals.receivedBytes),
        " received"
      ] })
    ] }) : null
  ] });
}

// src/ui/open.ts
import { execFile as execFile3 } from "child_process";
import fs15 from "fs";
import path18 from "path";
function run(cmd, args) {
  return new Promise((resolve) => {
    try {
      execFile3(cmd, args, { timeout: 1e4 }, (err) => resolve(!err)).on("error", () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}
function openPath(p, platform = process.platform) {
  if (!fs15.existsSync(p)) return Promise.resolve(false);
  if (platform === "darwin") return run("open", [p]);
  if (platform === "win32") return run("explorer", [p]);
  return run("xdg-open", [p]);
}
function revealPath(p, platform = process.platform) {
  const target = fs15.existsSync(p) ? p : path18.dirname(p);
  if (!fs15.existsSync(target)) return Promise.resolve(false);
  if (platform === "darwin") return run("open", target === p ? ["-R", p] : [target]);
  if (platform === "win32") return run("explorer", target === p ? [`/select,${p}`] : [target]);
  return run("xdg-open", [target === p ? path18.dirname(p) : target]);
}

// src/ui/screens/useCommandInput.ts
import { useEffect as useEffect4, useState as useState4 } from "react";
function useCommandInput({ editor, setEditor, onSubmit, onEscape }) {
  const [selected, setSelected] = useState4(0);
  const match = /^\/(\S*)$/.exec(editor.value);
  const filter = match?.[1] ?? null;
  const commands = filter !== null ? registry.suggest(filter) : [];
  const items = commands.map((c2) => ({ key: c2.name, label: `/${c2.name} ${c2.usage ?? ""}`.trimEnd(), description: c2.description }));
  const sel = Math.min(selected, Math.max(0, items.length - 1));
  useEffect4(() => setSelected(0), [filter]);
  const complete = (cmd) => {
    const value = `/${cmd.name} `;
    setEditor({ value, cursor: value.length });
  };
  const onKey = (_input, key) => {
    if (items.length) {
      const n = items.length;
      if (key.upArrow) {
        setSelected((sel - 1 + n) % n);
        return true;
      }
      if (key.downArrow) {
        setSelected((sel + 1) % n);
        return true;
      }
      if (key.tab) {
        complete(commands[sel]);
        return true;
      }
      if (key.return && !key.meta) {
        const exact = filter ? registry.find(filter) : void 0;
        const target = exact ?? (commands.length === 1 ? commands[0] : null);
        if (!target || (target.minArgs ?? 0) > 0) complete(target ?? commands[sel]);
        else onSubmit(`/${target.name}`);
        return true;
      }
    }
    if (key.escape) {
      onEscape();
      return true;
    }
    return false;
  };
  return { items, selected: sel, onKey, submit: onSubmit };
}

// src/ui/screens/Dashboard.tsx
import { Fragment as Fragment5, jsx as jsx11, jsxs as jsxs10 } from "react/jsx-runtime";
var SIDE_BY_SIDE = 84;
var PANEL_WIDTH = 40;
var exists2 = (p) => {
  try {
    fs16.statSync(p);
    return true;
  } catch {
    return false;
  }
};
function friendStatus(f) {
  switch (f.state) {
    case "outgoing":
      return { icon: icons.pending, color: theme.faint, text: "request sent" };
    case "declined":
      return { icon: icons.error, color: theme.faint, text: "declined your request" };
    case "blocked":
      return { icon: icons.error, color: theme.error, text: "blocked" };
    default: {
      if (!f.online) return { icon: icons.offline, color: theme.faint, text: "offline" };
      const status = statusText(f.status, f.statusMsg);
      const dot = presenceDot(f);
      if (f.busy) return { icon: icons.online, color: theme.accent, text: ["transferring", status].filter(Boolean).join(" \xB7 ") };
      if (f.status !== "available") return { ...dot, text: status };
      return { ...dot, text: [f.away ? "away" : "online", status].filter(Boolean).join(" \xB7 ") };
    }
  }
}
function Dashboard(props) {
  const { store, width, height, rows, actions, dialog, selectedKey, onSelect, history, focus, onFocus, transferKey, onTransferKey } = props;
  const data = store.dashboard();
  const sections = {
    banner: [{ type: "banner", key: "banner" }],
    requests: data.requests.map(
      (r) => ({ type: "request", key: r.kind === "offer" ? `o:${r.offer.xid}` : `r:${r.friend.id}`, request: r })
    ),
    friends: data.friends.map((f) => ({ type: "friend", key: `f:${f.id}`, friend: f })),
    nearby: data.nearby.map((p) => ({ type: "nearby", key: `n:${p.id}`, peer: p }))
  };
  const entries = Object.values(sections).flat();
  let selected = entries.findIndex((e) => e.key === selectedKey);
  if (selected === -1) selected = sections.requests.length ? 1 : 0;
  const current = entries[selected];
  const currentOffer = current?.type === "request" && current.request.kind === "offer" ? current.request.offer : null;
  const newestOffer = data.requests.find((r) => r.kind === "offer");
  const newestKey = newestOffer?.kind === "offer" ? `o:${newestOffer.offer.xid}` : null;
  const seenOffer = useRef3(null);
  useEffect5(() => {
    if (newestKey && newestKey !== seenOffer.current && !dialog && !store.dnd) {
      onSelect(newestKey);
      onFocus("list");
    }
    seenOffer.current = newestKey;
  }, [newestKey]);
  const items = transferItems(store);
  const tFocus = focus === "transfers" && items.length > 0;
  let tSel = items.findIndex((i) => itemKey(i) === transferKey);
  if (tSel === -1) tSel = 0;
  const currentItem = tFocus ? items[tSel] : void 0;
  const [commandMode, setCommandMode] = useState5(false);
  const commandRef = useRef3(false);
  const [editor, setEditor] = useState5(emptyEditor);
  const closeCommand = () => {
    commandRef.current = false;
    setCommandMode(false);
    setEditor(emptyEditor);
  };
  const selectedId = current?.type === "friend" ? current.friend.id : null;
  const cmd = useCommandInput({
    editor,
    setEditor,
    onSubmit: async (value) => {
      closeCommand();
      if (value.trim()) await actions.runCommand(value.trim(), selectedId);
    },
    onEscape: closeCommand
  });
  const attempt = (fn) => {
    try {
      fn();
    } catch (err) {
      store.showToast(err.message, "error");
    }
  };
  const onDrop = (text) => {
    const paths = resolvePastedPaths(text, exists2);
    if (!paths) return false;
    actions.sendFiles(paths);
    return true;
  };
  const idle = !dialog && !commandMode;
  usePaste(onDrop, idle);
  const activate = (e) => {
    if (!e) return;
    if (e.type === "banner") return actions.sendFiles();
    if (e.type === "request") {
      const r = e.request;
      if (r.kind === "offer") return attempt(() => store.transfers.accept(r.offer.xid));
      const id = r.friend.id;
      attempt(() => store.accept(id));
      return onSelect(`f:${id}`);
    }
    if (e.type === "nearby") return attempt(() => store.requestNearby(e.peer.id));
    const f = e.friend;
    if (f.state === "accepted") {
      if (!f.online) return store.showToast(`${f.display} is offline`, "error");
      return actions.sendFiles(void 0, { to: f.id });
    }
    if (f.state === "declined") return attempt(() => store.request(f.id));
    if (f.state === "blocked") return store.showToast(`${f.display} is blocked \u2013 /unblock to undo`, "info");
    store.showToast(`Waiting for ${f.display} to accept your friend request`, "info");
  };
  const openItem = (item, reveal) => {
    if (!item) return;
    const saved = item.kind === "done" ? item.e.saved : item.t.saved;
    const local = item.kind === "done" ? item.e.paths : item.t.paths;
    const files = saved?.length ? saved : local;
    if (!files?.length) return store.showToast(item.kind === "live" ? "Still running \u2013 nothing to open yet" : "No files to show", "info");
    const first = files[0];
    const show = reveal || files.length > 1 || !saved?.length;
    void (show ? revealPath(first) : openPath(first)).then((ok) => {
      if (!ok) store.showToast("Couldn't open it \u2013 the file may have been moved", "error");
    });
  };
  useWheel(
    (dir) => {
      if (tFocus) {
        const next2 = Math.max(0, Math.min(items.length - 1, tSel + dir));
        return onTransferKey(itemKey(items[next2]));
      }
      const next = Math.max(0, Math.min(entries.length - 1, selected + dir));
      if (next !== selected) onSelect(entries[next].key);
    },
    idle
  );
  useInput4(
    (input, key) => {
      if (commandRef.current) {
        const text = cleanPaste(input);
        if (text && !key.ctrl && !key.meta) setEditor((e) => edit.insert(e, text));
        return;
      }
      if (input.length > 1 && onDrop(input)) return;
      if (key.tab) {
        if (focus === "transfers" || !items.length) return onFocus("list");
        onFocus("transfers");
        if (!items.some((i) => itemKey(i) === transferKey)) onTransferKey(itemKey(items[0]));
        return;
      }
      if (input.startsWith("/")) {
        commandRef.current = true;
        setCommandMode(true);
        setEditor({ value: input, cursor: input.length });
        return;
      }
      if (input === "?") return void actions.runCommand("/help", null);
      if (input === "q") return void actions.runCommand("/quit", null);
      if (input === "a") {
        void actions.prompt("Add a friend by IP", { hint: "e.g. 192.168.1.20 or 192.168.1.20:5054" }).then((v) => {
          if (v) void actions.runCommand(`/add ${v}`, null);
        });
        return;
      }
      if (tFocus) {
        const moveT = (d) => onTransferKey(itemKey(items[Math.max(0, Math.min(items.length - 1, tSel + d))]));
        if (key.escape) return onFocus("list");
        if (key.upArrow || input === "k") return moveT(-1);
        if (key.downArrow || input === "j") return moveT(1);
        if (key.return) return openItem(currentItem, false);
        if (input === "o") return openItem(currentItem, true);
        if (input === "c" && currentItem?.kind === "live") {
          const t = currentItem.t;
          const what = `${filesLabel(t.files)} ${t.dir === "out" ? "to" : "from"} ${t.peerName}`;
          void actions.confirm(t.status === "waiting" ? `Withdraw the offer of ${what}?` : `Cancel ${what}?`).then((ok) => {
            if (ok) store.transfers.cancel(t.xid);
          });
        }
        return;
      }
      const move = (d) => {
        const next = Math.max(0, Math.min(entries.length - 1, selected + d));
        if (next !== selected) onSelect(entries[next].key);
      };
      if (key.upArrow || input === "k") return move(-1);
      if (key.downArrow || input === "j") return move(1);
      if (key.pageUp) return move(-10);
      if (key.pageDown) return move(10);
      if (key.return) return activate(current);
      if (input === "x" && current?.type === "request") {
        const r = current.request;
        attempt(() => r.kind === "offer" ? store.transfers.decline(r.offer.xid) : store.decline(r.friend.id));
        return;
      }
      if (input === "t" && current?.type === "friend") {
        const f = current.friend;
        if (f.state !== "accepted") return store.showToast("Only friends can be trusted", "info");
        return attempt(() => store.setTrusted(f.id, !f.trusted));
      }
      if (input === "r" && current?.type === "friend") {
        const f = current.friend;
        void actions.prompt(`Nickname for ${f.name}`, { hint: "Leave empty to use the person's own name", initial: f.alias }).then((v) => {
          if (v !== null) store.rename(f.id, v);
        });
        return;
      }
      if (input === "d" && current?.type === "friend") {
        const f = current.friend;
        void actions.confirm(`Remove ${f.display} as a friend?`).then((ok) => ok && store.removeFriend(f.id));
      }
    },
    { isActive: idle }
  );
  const compact2 = bannerCompact(width, rows);
  const banner = bannerHeight(compact2);
  const bottom = dialog ? dialogHeight(dialog) : commandMode ? inputBoxHeight(editor, width) + menuHeight(cmd.items.length) : 0;
  const side = width >= SIDE_BY_SIDE;
  const mainHeight = Math.max(3, height - banner - bottom - 1);
  const panelWidth = side ? PANEL_WIDTH : width;
  let panelRows;
  let panelCompact = false;
  let offerFiles = 0;
  if (currentOffer) {
    offerFiles = Math.max(1, Math.min(currentOffer.files.length, (side ? mainHeight : Math.floor(mainHeight / 2)) - offerDetailHeight(currentOffer, 0)));
    panelRows = offerDetailHeight(currentOffer, offerFiles);
  } else {
    panelCompact = !side || mainHeight < transferPanelHeight(items, false);
    panelRows = transferPanelHeight(items, panelCompact);
  }
  const showPanel = side ? mainHeight >= Math.min(panelRows, 5) : mainHeight - panelRows >= 4;
  const listHeight = Math.max(2, mainHeight - (showPanel && !side ? panelRows : 0));
  const listWidth = side ? width - PANEL_WIDTH - 1 : width;
  const inner = listWidth - 2;
  const lines = [];
  const section = (title, list, showEmpty = false) => {
    if (!list.length && !showEmpty) return;
    if (lines.length) lines.push({ kind: "gap" });
    lines.push({ kind: "section", title });
    for (const e of list) lines.push({ kind: "entry", entry: e, index: entries.indexOf(e) });
  };
  section(`Requests \xB7 ${data.requests.length}`, sections.requests);
  const online = data.friends.filter((f) => f.state === "accepted" && f.online).length;
  section(data.friends.length ? `Friends \xB7 ${online} online` : "Friends", sections.friends, true);
  const scanning = store.me.scanning;
  section(scanning ? "Nearby \xB7 searching the network \u2026" : "Nearby", sections.nearby, scanning);
  const selLine = lines.findIndex((l) => l.kind === "entry" && l.index === selected);
  const start2 = Math.max(0, Math.min(selLine - Math.floor(listHeight / 2), lines.length - listHeight));
  const visible = lines.slice(start2, start2 + listHeight);
  const hints = (() => {
    if (tFocus) {
      const base2 = ["\u2191\u2193 select"];
      if (currentItem?.kind === "live") base2.push("c cancel");
      else base2.push("enter open", "o show in Finder");
      return [...base2, "tab back to friends", "q quit"];
    }
    const base = ["\u2191\u2193 select"];
    if (!current || current.type === "banner") base.push("enter send files");
    else if (current.type === "request") base.push("enter accept", "x decline");
    else if (current.type === "nearby") base.push("enter add friend");
    else {
      if (current.friend.state === "accepted") base.push("enter send", current.friend.trusted ? "t untrust" : "t trust");
      base.push("r rename", "d remove");
    }
    if (items.length) base.push("tab transfers");
    return [...base, "a add by IP", "/ commands", "? help", "q quit"];
  })();
  const empty = data.friends.length === 0 && data.requests.length === 0;
  return /* @__PURE__ */ jsxs10(Box10, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsx11(
      Banner,
      {
        width,
        compact: compact2,
        selected: !tFocus && current?.type === "banner",
        animate: store.isFocused && idle,
        mode: store.settings.animations
      }
    ),
    /* @__PURE__ */ jsxs10(Box10, { flexDirection: side ? "row" : "column", height: mainHeight, width, alignItems: "flex-start", overflow: "hidden", children: [
      /* @__PURE__ */ jsxs10(Box10, { flexDirection: "column", height: listHeight, width: listWidth, paddingX: 1, overflow: "hidden", flexShrink: 0, children: [
        visible.map((l, i) => {
          if (l.kind === "gap") return /* @__PURE__ */ jsx11(Text11, { children: " " }, `g${i}`);
          if (l.kind === "section") {
            return /* @__PURE__ */ jsx11(Text11, { color: theme.dim, bold: true, children: l.title.toUpperCase() }, `s${i}`);
          }
          return /* @__PURE__ */ jsx11(Row, { entry: l.entry, selected: !tFocus && l.index === selected, width: inner }, l.entry.key);
        }),
        empty && listHeight - visible.length >= 3 ? /* @__PURE__ */ jsx11(EmptyHint, { store, width: inner }) : null
      ] }),
      showPanel ? /* @__PURE__ */ jsx11(Box10, { marginLeft: side ? 1 : 0, flexShrink: 0, height: side ? mainHeight : panelRows, overflow: "hidden", alignItems: "flex-start", children: currentOffer && !tFocus ? /* @__PURE__ */ jsx11(OfferDetail, { store, offer: currentOffer, width: panelWidth, maxFiles: offerFiles }) : /* @__PURE__ */ jsx11(
        TransferList,
        {
          store,
          items,
          width: panelWidth,
          compact: panelCompact,
          selected: currentItem ? itemKey(currentItem) : null,
          focused: tFocus
        }
      ) }) : null
    ] }),
    dialog ? /* @__PURE__ */ jsx11(Dialog, { spec: dialog, width }) : commandMode ? /* @__PURE__ */ jsxs10(Fragment5, { children: [
      /* @__PURE__ */ jsx11(
        InputBox,
        {
          state: editor,
          onChange: setEditor,
          onSubmit: cmd.submit,
          onKey: cmd.onKey,
          isActive: true,
          width,
          history,
          borderColor: theme.accent,
          singleLine: true
        }
      ),
      /* @__PURE__ */ jsx11(CommandMenu, { items: cmd.items, selected: cmd.selected, width })
    ] }) : null,
    /* @__PURE__ */ jsx11(Footer, { hints: commandMode ? ["enter run", "tab complete", "esc cancel"] : hints, toast: store.toast, width })
  ] });
}
function Pointer2({ selected }) {
  return /* @__PURE__ */ jsx11(Box10, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx11(Text11, { color: theme.accent, children: selected ? icons.pointer : " " }) });
}
function Row({ entry, selected, width }) {
  const nameWidth = Math.min(20, Math.max(10, Math.floor(width * 0.3)));
  const name = (text, extra) => /* @__PURE__ */ jsxs10(Box10, { width: nameWidth, flexShrink: 0, children: [
    /* @__PURE__ */ jsx11(Text11, { bold: selected, color: selected ? theme.accent : void 0, wrap: "truncate-end", children: text }),
    extra ? /* @__PURE__ */ jsx11(Text11, { color: theme.warning, children: extra }) : null
  ] });
  const dot = (icon, color) => /* @__PURE__ */ jsx11(Box10, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx11(Text11, { color, children: icon }) });
  if (entry.type === "banner") return null;
  if (entry.type === "nearby") {
    const p = entry.peer;
    return /* @__PURE__ */ jsxs10(Box10, { children: [
      /* @__PURE__ */ jsx11(Pointer2, { selected }),
      dot(icons.online, theme.success),
      name(p.name),
      /* @__PURE__ */ jsxs10(Text11, { color: theme.dim, wrap: "truncate-end", children: [
        "on your network \xB7 ",
        p.ip
      ] })
    ] });
  }
  if (entry.type === "request") {
    const r = entry.request;
    const who = r.kind === "offer" ? r.offer.peerName : r.friend.display;
    const text = r.kind === "offer" ? `wants to send ${plural(r.offer.files.length, "file")} \xB7 ${formatBytes(r.offer.total)}` : "wants to be friends";
    return /* @__PURE__ */ jsxs10(Box10, { children: [
      /* @__PURE__ */ jsx11(Pointer2, { selected }),
      dot(icons.request, theme.accent),
      name(who),
      /* @__PURE__ */ jsx11(Text11, { wrap: "truncate-end", children: text })
    ] });
  }
  const f = entry.friend;
  const st = friendStatus(f);
  return /* @__PURE__ */ jsxs10(Box10, { children: [
    /* @__PURE__ */ jsx11(Pointer2, { selected }),
    dot(st.icon, st.color),
    /* @__PURE__ */ jsxs10(Box10, { width: nameWidth, flexShrink: 0, children: [
      /* @__PURE__ */ jsx11(Text11, { bold: selected, color: selected ? theme.accent : f.state === "accepted" ? personHex(f.id, f.color) : void 0, wrap: "truncate-end", children: f.display }),
      f.trusted && f.state === "accepted" ? /* @__PURE__ */ jsxs10(Text11, { color: theme.warning, children: [
        " ",
        icons.star
      ] }) : null
    ] }),
    /* @__PURE__ */ jsx11(Box10, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsx11(Text11, { color: f.state === "accepted" && f.online ? st.color : theme.dim, italic: f.state !== "accepted", wrap: "truncate-end", children: st.text }) })
  ] });
}
function EmptyHint({ store, width }) {
  const me = store.me;
  const addr = me.ips.length ? me.ips.map((ip) => `${ip}:${me.port}`).join(", ") : "no network";
  return /* @__PURE__ */ jsx11(Box10, { paddingLeft: 2, width, children: /* @__PURE__ */ jsxs10(Text11, { color: theme.dim, wrap: "wrap", children: [
    'Other termdrop users on your network show up under "Nearby" \u2013 press enter to send them a friend request. Not showing up? Press ',
    /* @__PURE__ */ jsx11(Text11, { color: theme.accent, children: "a" }),
    " and enter their IP. Yours:",
    " ",
    /* @__PURE__ */ jsx11(Text11, { color: theme.accent, children: addr })
  ] }) });
}

// src/ui/screens/FilePicker.tsx
import fs18 from "fs";
import path20 from "path";
import { Box as Box11, Text as Text12, useInput as useInput5 } from "ink";
import { useState as useState6 } from "react";

// src/ui/complete.ts
import fs17 from "fs";
import os7 from "os";
import path19 from "path";
var MAX_CANDIDATES = 50;
function completePath(input, cwd, home = os7.homedir(), platform = process.platform) {
  const sepAt = Math.max(input.lastIndexOf("/"), platform === "win32" ? input.lastIndexOf("\\") : -1);
  const dirPart = sepAt === -1 ? "" : input.slice(0, sepAt + 1);
  const prefix = input.slice(sepAt + 1);
  if (input === "~") return { value: "~/", candidates: [] };
  const dir = path19.resolve(cwd, expandHome(dirPart || ".", home));
  let entries;
  try {
    entries = fs17.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { value: input, candidates: [] };
  }
  const fold = platform === "darwin" || platform === "win32";
  const norm = (s) => fold ? s.toLowerCase() : s;
  const matches = entries.filter((e) => norm(e.name).startsWith(norm(prefix)) && (prefix.startsWith(".") || !e.name.startsWith("."))).map((e) => {
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) {
      try {
        isDir = fs17.statSync(path19.join(dir, e.name)).isDirectory();
      } catch {
      }
    }
    return isDir ? `${e.name}/` : e.name;
  }).sort((a, b) => a.localeCompare(b));
  if (!matches.length) return { value: input, candidates: [] };
  if (matches.length === 1) return { value: dirPart + matches[0], candidates: [] };
  let common = matches[0];
  for (const m of matches) {
    let i = 0;
    while (i < common.length && i < m.length && norm(common[i]) === norm(m[i])) i++;
    common = common.slice(0, i);
  }
  const value = common.length > prefix.length ? dirPart + common : input;
  return { value, candidates: matches.slice(0, MAX_CANDIDATES) };
}

// src/ui/screens/FilePicker.tsx
import { jsx as jsx12, jsxs as jsxs11 } from "react/jsx-runtime";
var exists3 = (p) => {
  try {
    fs18.statSync(p);
    return true;
  } catch {
    return false;
  }
};
function FilePicker({ store, width, height, files, notices, onChange, onNext, onCancel, cwd = process.cwd() }) {
  const [focus, setFocus] = useState6(files.length ? "list" : "input");
  const [cursor, setCursor] = useState6(0);
  const [editor, setEditor] = useState6(emptyEditor);
  const [candidates, setCandidates] = useState6([]);
  const sel = Math.min(cursor, Math.max(0, files.length - 1));
  const total = files.reduce((n, f) => n + f.size, 0);
  const add = (paths) => {
    const { files: more, rejected } = inspectPaths(
      paths.map((p) => path20.resolve(cwd, expandHome(p))),
      files
    );
    onChange([...files, ...more], rejected.map((r) => r.reason));
    if (more.length) setCursor(files.length + more.length - 1);
    return more.length;
  };
  const submitInput = (value) => {
    const v = value.trim();
    if (!v) {
      if (files.length) onNext();
      return;
    }
    const direct = path20.resolve(cwd, expandHome(v));
    const paths = exists3(direct) ? [direct] : resolvePastedPaths(v, exists3) ?? [direct];
    add(paths);
    setEditor(emptyEditor);
    setCandidates([]);
  };
  const onPaste = (text) => {
    const paths = resolvePastedPaths(text, exists3);
    if (!paths) return false;
    add(paths);
    return true;
  };
  usePaste(onPaste, focus === "list");
  useWheel((dir) => setCursor((c2) => Math.max(0, Math.min(files.length - 1, c2 + dir))), focus === "list");
  useInput5(
    (input, key) => {
      if (key.escape) return onCancel();
      if (input.length > 1 && onPaste(input)) return;
      if (key.upArrow || input === "k") return setCursor(Math.max(0, sel - 1));
      if (key.downArrow || input === "j") return setCursor(Math.min(files.length - 1, sel + 1));
      if (key.return) return files.length ? onNext() : setFocus("input");
      if ((input === "d" || key.delete || key.backspace) && files[sel]) {
        onChange(files.filter((_, i) => i !== sel), []);
        if (files.length === 1) setFocus("input");
        return;
      }
      if (input === "a" || key.tab) return setFocus("input");
      if (input === "/" || input === "~" || input === ".") {
        setEditor({ value: input, cursor: input.length });
        setFocus("input");
      }
    },
    { isActive: focus === "list" }
  );
  const onKey = (_input, key) => {
    if (key.tab) {
      const c2 = completePath(editor.value, cwd);
      setEditor({ value: c2.value, cursor: c2.value.length });
      setCandidates(c2.candidates);
      return true;
    }
    if (key.escape) {
      if (editor.value) {
        setEditor(emptyEditor);
        setCandidates([]);
      } else if (files.length) setFocus("list");
      else onCancel();
      return true;
    }
    if (key.upArrow && files.length && !editor.value) {
      setFocus("list");
      return true;
    }
    return false;
  };
  const inner = width - 4;
  const candRows = focus === "input" && candidates.length ? Math.min(4, Math.ceil(candidates.length / 3)) : 0;
  const noticeRows = Math.min(3, notices.length);
  const listRows = Math.max(2, height - 2 - 1 - noticeRows - 3 - candRows - 1);
  const start2 = Math.max(0, Math.min(sel - Math.floor(listRows / 2), files.length - listRows));
  const visible = files.slice(start2, start2 + listRows);
  const nameW = Math.min(40, Math.max(12, Math.floor(inner * 0.45)));
  const colW = Math.max(12, Math.floor((width - 6) / 3));
  const hints = focus === "list" ? ["enter next: choose friends", "\u2191\u2193 select", "d remove", "a add a path", "esc cancel"] : ["enter add", "tab complete", ...files.length ? ["enter on empty: next", "esc back"] : ["esc cancel"]];
  return /* @__PURE__ */ jsxs11(Box11, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsxs11(Box11, { paddingX: 1, width, children: [
      /* @__PURE__ */ jsx12(Text12, { color: theme.dim, bold: true, children: "SEND FILES" }),
      /* @__PURE__ */ jsx12(Text12, { color: theme.dim, children: files.length ? ` \xB7 ${plural(files.length, "file")} \xB7 ${formatBytes(total)}` : "" })
    ] }),
    /* @__PURE__ */ jsx12(Text12, { children: " " }),
    /* @__PURE__ */ jsx12(Box11, { flexDirection: "column", height: listRows, paddingX: 1, overflow: "hidden", children: files.length === 0 ? /* @__PURE__ */ jsxs11(Text12, { color: theme.dim, wrap: "wrap", children: [
      "Drag files from Finder into this window, or type a path below (",
      /* @__PURE__ */ jsx12(Text12, { color: theme.accent, children: "tab" }),
      " completes). Folders aren't supported yet \u2013 zip them first."
    ] }) : visible.map((f, i) => {
      const active = focus === "list" && start2 + i === sel;
      return /* @__PURE__ */ jsxs11(Box11, { width: inner + 2, children: [
        /* @__PURE__ */ jsx12(Box11, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx12(Text12, { color: theme.accent, children: active ? icons.pointer : " " }) }),
        /* @__PURE__ */ jsx12(Box11, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx12(Text12, { color: theme.faint, children: icons.file }) }),
        /* @__PURE__ */ jsx12(Box11, { width: nameW, flexShrink: 0, children: /* @__PURE__ */ jsx12(Text12, { bold: active, color: active ? theme.accent : void 0, wrap: "truncate-middle", children: showPath(f.name) }) }),
        /* @__PURE__ */ jsx12(Box11, { width: 10, flexShrink: 0, justifyContent: "flex-end", children: /* @__PURE__ */ jsx12(Text12, { children: formatBytes(f.size) }) }),
        /* @__PURE__ */ jsx12(Box11, { flexGrow: 1, flexShrink: 1, minWidth: 0, marginLeft: 2, children: /* @__PURE__ */ jsx12(Text12, { color: theme.faint, wrap: "truncate-start", children: showPath(tildify(path20.dirname(f.path))) }) })
      ] }, f.path);
    }) }),
    /* @__PURE__ */ jsx12(Text12, { children: " " }),
    notices.slice(0, noticeRows).map((n, i) => /* @__PURE__ */ jsx12(Box11, { paddingX: 1, children: /* @__PURE__ */ jsxs11(Text12, { color: theme.error, wrap: "truncate-end", children: [
      icons.error,
      " ",
      n
    ] }) }, i)),
    /* @__PURE__ */ jsx12(
      InputBox,
      {
        state: editor,
        onChange: (s) => {
          setEditor(s);
          if (candidates.length) setCandidates([]);
        },
        onSubmit: submitInput,
        onKey,
        onPaste,
        isActive: focus === "input",
        width,
        singleLine: true,
        placeholder: files.length ? "add another path, or press enter to continue" : "type a path, or drag files here",
        borderColor: focus === "input" ? theme.accent : theme.border
      }
    ),
    candRows ? /* @__PURE__ */ jsx12(Box11, { flexDirection: "column", paddingX: 2, height: candRows, overflow: "hidden", children: Array.from({ length: candRows }, (_, r) => /* @__PURE__ */ jsx12(Box11, { children: candidates.slice(r * 3, r * 3 + 3).map((c2) => /* @__PURE__ */ jsx12(Box11, { width: colW, flexShrink: 0, children: /* @__PURE__ */ jsx12(Text12, { color: c2.endsWith("/") ? theme.peer : theme.dim, wrap: "truncate-end", children: showPath(c2) }) }, c2)) }, r)) }) : null,
    /* @__PURE__ */ jsx12(Footer, { hints, toast: store.toast, width })
  ] });
}

// ../termcore/src/ui/components/Onboarding.tsx
import { Box as Box12, Text as Text13, useInput as useInput6 } from "ink";
import { useState as useState7 } from "react";
import { Fragment as Fragment6, jsx as jsx13, jsxs as jsxs12 } from "react/jsx-runtime";
function Onboarding({ logo, tagline, width, create, onDone, question = "What should your friends see you as?" }) {
  const [editor, setEditor] = useState7(emptyEditor);
  const [created, setCreated] = useState7(null);
  const [error, setError] = useState7(null);
  useInput6((_i, key) => key.return && onDone(), { isActive: created !== null });
  const submit = (value) => {
    const name = value.trim();
    if (!name) {
      setError("Please enter a name.");
      return;
    }
    try {
      setCreated({ name, id: create(name) });
    } catch (err) {
      setError(`Could not create profile: ${err.message}`);
    }
  };
  const boxWidth = Math.min(64, width - 4);
  return /* @__PURE__ */ jsxs12(Box12, { flexDirection: "column", paddingX: 2, paddingY: 1, children: [
    logo.map((l, i) => /* @__PURE__ */ jsx13(Text13, { color: theme.accent, children: l }, i)),
    /* @__PURE__ */ jsx13(Text13, { color: theme.dim, children: tagline }),
    /* @__PURE__ */ jsx13(Text13, { children: " " }),
    created ? /* @__PURE__ */ jsxs12(Fragment6, { children: [
      /* @__PURE__ */ jsxs12(Text13, { children: [
        "Welcome, ",
        /* @__PURE__ */ jsx13(Text13, { bold: true, children: created.name }),
        "!"
      ] }),
      /* @__PURE__ */ jsx13(Text13, { children: " " }),
      /* @__PURE__ */ jsx13(Text13, { color: theme.dim, children: "Your personal ID has been created:" }),
      /* @__PURE__ */ jsxs12(Text13, { color: theme.accent, bold: true, children: [
        "  ",
        formatId(created.id, true)
      ] }),
      /* @__PURE__ */ jsx13(Text13, { children: " " }),
      /* @__PURE__ */ jsx13(Text13, { color: theme.dim, children: "It's tied to a secret key on this device. That's how your friends recognize" }),
      /* @__PURE__ */ jsx13(Text13, { color: theme.dim, children: "you \u2013 even if your name or IP address changes. termchat, keyrace and termdrop" }),
      /* @__PURE__ */ jsx13(Text13, { color: theme.dim, children: "share it, along with your friends. Every connection is end-to-end encrypted." }),
      /* @__PURE__ */ jsx13(Text13, { children: " " }),
      /* @__PURE__ */ jsxs12(Text13, { children: [
        "Press ",
        /* @__PURE__ */ jsx13(Text13, { color: theme.accent, children: "enter" }),
        " to continue"
      ] })
    ] }) : /* @__PURE__ */ jsxs12(Fragment6, { children: [
      /* @__PURE__ */ jsx13(Text13, { bold: true, children: question }),
      /* @__PURE__ */ jsx13(Text13, { color: theme.dim, children: "You can change it later with /name." }),
      /* @__PURE__ */ jsx13(Text13, { children: " " }),
      /* @__PURE__ */ jsx13(
        InputBox,
        {
          state: editor,
          onChange: (s) => {
            setEditor(s);
            setError(null);
          },
          onSubmit: submit,
          isActive: true,
          singleLine: true,
          width: boxWidth,
          placeholder: "Your name",
          borderColor: theme.accent
        }
      ),
      error ? /* @__PURE__ */ jsx13(Text13, { color: theme.error, children: error }) : null
    ] })
  ] });
}

// src/ui/screens/RecipientPicker.tsx
import { Box as Box13, Text as Text14, useInput as useInput7 } from "ink";
import { useEffect as useEffect6, useState as useState8 } from "react";
import { Fragment as Fragment7, jsx as jsx14, jsxs as jsxs13 } from "react/jsx-runtime";
function RecipientPicker({ store, width, height, files, to, onSend, onEditFiles, onCancel }) {
  const friends = store.onlineFriends();
  const [cursor, setCursor] = useState8(0);
  const [chosen, setChosen] = useState8(/* @__PURE__ */ new Set());
  const [preselected, setPreselected] = useState8(false);
  const sel = Math.min(cursor, Math.max(0, friends.length - 1));
  const offline = store.dashboard().friends.filter((f) => f.state === "accepted" && !f.online).length;
  const target = to && !preselected ? store.findFriend(to) : null;
  useEffect6(() => {
    if (!target?.online) return;
    setPreselected(true);
    setChosen((s) => new Set(s).add(target.id));
    const i = friends.findIndex((f) => f.id === target.id);
    if (i >= 0) setCursor(i);
  }, [target?.id, target?.online]);
  useWheel((dir) => setCursor((c2) => Math.max(0, Math.min(friends.length - 1, c2 + dir))));
  useInput7((input, key) => {
    if (key.escape) return onCancel();
    if (key.upArrow || input === "k") return setCursor((sel - 1 + friends.length) % Math.max(1, friends.length));
    if (key.downArrow || input === "j") return setCursor((sel + 1) % Math.max(1, friends.length));
    if (input === "f" || key.tab) return onEditFiles();
    const current = friends[sel];
    if (input === " " && current) {
      setChosen((s) => {
        const next = new Set(s);
        if (next.has(current.id)) next.delete(current.id);
        else next.add(current.id);
        return next;
      });
      return;
    }
    if (input === "a") {
      setChosen(new Set(friends.map((f) => f.id)));
      return;
    }
    if (key.return) {
      const ids = friends.filter((f) => chosen.has(f.id)).map((f) => f.id);
      if (ids.length) onSend(ids);
      else if (current) onSend([current.id]);
    }
  });
  const ticked = friends.filter((f) => chosen.has(f.id));
  const listRows = Math.max(3, height - 2 - 2 - 2 - 1);
  const start2 = Math.max(0, Math.min(sel - listRows + 1, friends.length - listRows));
  const visible = friends.slice(start2, start2 + listRows);
  const total = files.reduce((n, f) => n + f.size, 0);
  const waitingFor = to && !preselected ? to : null;
  return /* @__PURE__ */ jsxs13(Box13, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsxs13(Box13, { paddingX: 1, width, children: [
      /* @__PURE__ */ jsx14(Text14, { color: theme.dim, bold: true, children: "SEND TO" }),
      /* @__PURE__ */ jsxs13(Text14, { color: theme.dim, wrap: "truncate-end", children: [
        " ",
        "\xB7 ",
        filesLabel(files),
        " \xB7 ",
        formatBytes(total),
        ticked.length ? ` \xB7 ${ticked.length} selected` : ""
      ] })
    ] }),
    /* @__PURE__ */ jsx14(Text14, { children: " " }),
    /* @__PURE__ */ jsx14(Box13, { flexDirection: "column", height: listRows, paddingX: 1, overflow: "hidden", children: friends.length === 0 ? /* @__PURE__ */ jsxs13(Fragment7, { children: [
      /* @__PURE__ */ jsxs13(Text14, { color: theme.dim, wrap: "wrap", children: [
        icons.pending,
        " No friends online right now",
        offline ? ` (${plural(offline, "friend")} offline)` : "",
        ". They show up here as soon as they connect."
      ] }),
      /* @__PURE__ */ jsx14(Text14, { color: theme.faint, wrap: "wrap", children: "New friends: press esc, pick someone under Nearby, or press a and enter their IP." })
    ] }) : visible.map((f, i) => {
      const active = start2 + i === sel;
      const on = chosen.has(f.id);
      return /* @__PURE__ */ jsxs13(Box13, { children: [
        /* @__PURE__ */ jsx14(Text14, { color: theme.accent, children: active ? `${icons.pointer} ` : "  " }),
        /* @__PURE__ */ jsx14(Text14, { color: on ? theme.success : theme.dim, children: on ? "[x] " : "[ ] " }),
        /* @__PURE__ */ jsxs13(Text14, { color: theme.success, children: [
          icons.online,
          " "
        ] }),
        /* @__PURE__ */ jsx14(Text14, { bold: active, color: active ? theme.accent : void 0, wrap: "truncate-end", children: f.display }),
        f.trusted ? /* @__PURE__ */ jsxs13(Text14, { color: theme.warning, children: [
          " ",
          icons.star
        ] }) : null,
        f.away ? /* @__PURE__ */ jsx14(Text14, { color: theme.faint, children: " \xB7 away" }) : null
      ] }, f.id);
    }) }),
    /* @__PURE__ */ jsx14(Text14, { children: " " }),
    /* @__PURE__ */ jsx14(Box13, { paddingX: 1, children: /* @__PURE__ */ jsx14(Text14, { color: theme.dim, wrap: "truncate-end", children: waitingFor ? `Waiting for ${waitingFor} to come online \u2026` : ticked.length ? `enter sends to ${ticked.map((f) => f.display).join(", ")}` : friends[sel] ? `enter sends to ${friends[sel].display} \u2013 space ticks more` : "" }) }),
    /* @__PURE__ */ jsx14(Text14, { children: " " }),
    /* @__PURE__ */ jsx14(Footer, { hints: ["enter send", "space select", "a all", "\u2191\u2193 move", "f edit files", "esc cancel"], toast: store.toast, width })
  ] });
}

// src/ui/App.tsx
import { jsx as jsx15, jsxs as jsxs14 } from "react/jsx-runtime";
function Root({
  paths,
  options,
  inbox,
  notice
}) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const [phase, setPhase] = useState9(() => AppStore.hasProfile(paths) ? { name: "starting" } : { name: "onboarding" });
  const storeRef = useRef4(null);
  const quitting = useRef4(false);
  const quit = useCallback(() => {
    if (quitting.current) return;
    quitting.current = true;
    const store = storeRef.current;
    void (store ? store.stop() : Promise.resolve()).finally(() => exit());
  }, [exit]);
  useInput8((input, key) => {
    if (key.ctrl && input === "c") quit();
  });
  useEffect7(() => {
    if (phase.name !== "starting") return;
    let cancelled = false;
    (async () => {
      try {
        const store = new AppStore({ paths, ...options });
        await store.start();
        if (notice) store.showToast(notice, "success");
        if (cancelled) return void store.stop();
        storeRef.current = store;
        setPhase({ name: "ready", store });
      } catch (err) {
        setPhase({ name: "error", message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase.name]);
  const height = Math.max(10, rows - 1);
  if (phase.name === "onboarding") {
    return /* @__PURE__ */ jsx15(
      Onboarding,
      {
        logo: LOGO_SMALL,
        tagline: "encrypted file sharing with friends on your network",
        width: columns,
        create: (name) => AppStore.createProfile(paths, name),
        onDone: () => setPhase({ name: "starting" })
      }
    );
  }
  if (phase.name === "starting") {
    return /* @__PURE__ */ jsx15(Box14, { paddingX: 2, paddingY: 1, children: /* @__PURE__ */ jsx15(Text15, { color: theme.dim, children: "Starting termdrop \u2026" }) });
  }
  if (phase.name === "error") {
    return /* @__PURE__ */ jsxs14(Box14, { paddingX: 2, paddingY: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsx15(Text15, { color: theme.error, bold: true, children: "termdrop could not start" }),
      /* @__PURE__ */ jsx15(Text15, { children: phase.message }),
      /* @__PURE__ */ jsx15(Text15, { color: theme.dim, children: "ctrl+c to quit" })
    ] });
  }
  return /* @__PURE__ */ jsx15(Main, { store: phase.store, width: columns, height, rows, quit, inbox });
}
function Main({
  store,
  width,
  height,
  rows,
  quit,
  inbox,
  initialFlow = null
}) {
  const version = useStoreVersion(store);
  const [dialog, setDialog] = useState9(null);
  const [panel, setPanel] = useState9(null);
  const [selectedKey, setSelectedKey] = useState9(null);
  const [history, setHistory] = useState9([]);
  const [flow, setFlow] = useState9(initialFlow);
  const [focus, setFocus] = useState9("list");
  const [transferKey, setTransferKey] = useState9(null);
  const seenRequest = useRef4(0);
  useEffect7(() => {
    void checkForUpdate().then((v) => v && store.setUpdateAvailable(v));
  }, [store]);
  useEffect7(() => {
    mouse.on("focus", (f) => store.setFocused(f));
    return () => void mouse.removeAllListeners("focus");
  }, [store]);
  useEffect7(() => {
    if (!inbox) return;
    const drain = () => {
      for (let r = inbox.take(); r; r = inbox.take()) store.requestSend(r.paths, r.to, "shell");
    };
    drain();
    inbox.on("request", drain);
    return () => void inbox.off("request", drain);
  }, [store, inbox]);
  useEffect7(() => {
    const req = store.sendRequest;
    if (!req || req.seq === seenRequest.current) return;
    seenRequest.current = req.seq;
    const notices = req.rejected.map((r) => r.reason);
    setPanel(null);
    setFlow((cur) => {
      if (cur) {
        const known = new Set(cur.files.map((f) => f.path));
        const files = [...cur.files, ...req.files.filter((f) => !known.has(f.path))];
        const step2 = req.source === "drop" || !files.length ? cur.step : "recipients";
        return { ...cur, files, notices, step: step2, ...req.to ? { to: req.to } : {} };
      }
      if (!req.files.length && req.source !== "command") {
        if (notices[0]) store.showToast(notices.length > 1 ? `${notices[0]} (and ${notices.length - 1} more)` : notices[0], "error");
        return null;
      }
      const step = req.source === "shell" && req.files.length ? "recipients" : req.recipients && req.files.length ? "recipients" : "files";
      return { step, files: req.files, notices, ...req.to ? { to: req.to } : {} };
    });
  }, [version, store]);
  const actions = useMemo(() => {
    const ask = (make) => new Promise(
      (resolve) => setDialog(
        make((v) => {
          setDialog(null);
          resolve(v);
        })
      )
    );
    const a = {
      quit,
      confirm: (title) => ask((resolve) => ({ kind: "confirm", title, resolve })),
      prompt: (title, opts) => ask((resolve) => ({ kind: "prompt", title, hint: opts?.hint, initial: opts?.initial, resolve })),
      pick: (title, options, multi, opts) => ask((resolve) => ({ kind: "pick", title, options, multi, opts, resolve })),
      sendFiles: (paths, opts) => {
        if (paths?.length) store.requestSend(paths, opts?.to, opts?.recipients ? "command" : "drop", opts?.recipients);
        else {
          setPanel(null);
          setFlow({ step: "files", files: [], notices: [], ...opts?.to ? { to: opts.to } : {} });
        }
      },
      print: (text, kind = "info") => {
        if (text.includes("\n")) setPanel(text);
        else store.showToast(text.replace(/[`*]/g, ""), kind);
      },
      runCommand: async (input, selectedId) => {
        await registry.execute(input, {
          store,
          selectedId,
          ui: {
            print: (text, kind) => a.print(text, kind),
            quit: a.quit,
            confirm: a.confirm,
            pick: a.pick,
            sendFiles: a.sendFiles
          }
        });
        setHistory((h) => h[h.length - 1] === input ? h : [...h.slice(-99), input]);
      }
    };
    return a;
  }, [store, quit]);
  const send = (ids) => {
    if (!flow) return;
    try {
      const out = store.send(flow.files, ids);
      const names = out.map((t) => t.peerName);
      const who = names.length > 2 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names.join(" and ");
      store.showToast(`Offered ${filesLabel(flow.files)} to ${who}`, "success");
      setFlow(null);
      setFocus("transfers");
      setTransferKey(out[0]?.xid ?? null);
    } catch (err) {
      store.showToast(err.message, "error");
    }
  };
  const bodyHeight = height - 2;
  let body;
  if (flow?.step === "files") {
    body = /* @__PURE__ */ jsx15(
      FilePicker,
      {
        store,
        width,
        height: bodyHeight,
        files: flow.files,
        notices: flow.notices,
        onChange: (files, notices) => setFlow((f) => f ? { ...f, files, notices } : f),
        onNext: () => setFlow((f) => f && f.files.length ? { ...f, step: "recipients", notices: [] } : f),
        onCancel: () => setFlow(null)
      }
    );
  } else if (flow?.step === "recipients") {
    body = /* @__PURE__ */ jsx15(
      RecipientPicker,
      {
        store,
        width,
        height: bodyHeight,
        files: flow.files,
        to: flow.to,
        onSend: send,
        onEditFiles: () => setFlow((f) => f ? { ...f, step: "files" } : f),
        onCancel: () => setFlow(null)
      }
    );
  } else if (panel) {
    body = /* @__PURE__ */ jsx15(Panel, { text: panel, width, height: bodyHeight, onClose: () => setPanel(null) });
  } else {
    body = /* @__PURE__ */ jsx15(
      Dashboard,
      {
        store,
        width,
        height: bodyHeight,
        rows,
        actions,
        dialog,
        selectedKey,
        onSelect: setSelectedKey,
        history,
        focus,
        onFocus: setFocus,
        transferKey,
        onTransferKey: setTransferKey
      }
    );
  }
  return /* @__PURE__ */ jsxs14(Box14, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ jsx15(
      Header,
      {
        app: "termdrop",
        version: VERSION,
        width,
        me: store.me,
        address: store.me.ips[0] ? `${store.me.ips[0]}:${store.me.port}` : "no network",
        online: store.onlineCount(),
        updateAvailable: store.updateAvailable
      }
    ),
    body
  ] });
}

// src/cli.tsx
import { jsx as jsx16 } from "react/jsx-runtime";
var HELP = `termdrop \u2013 end-to-end encrypted file sharing with friends on your local network

Usage: termdrop [files\u2026] [--to <name>] [options]
       termdrop update   Install the latest version from GitHub

  files\u2026            Send these files (if termdrop is already open, they go to that window)
  --to <name>       Preselect this friend as the recipient
  --home <dir>      Data directory (default: ~/.termhub shared by all apps plus
                    ~/.termdrop; with --home: <dir> and <dir>/termdrop; or $TERMHUB_HOME)
  --port <port>     TCP port (default: 5054, falls back if taken)
  --no-discovery    Don't search the network automatically
  --debug           Write a connection log to <home>/termdrop.log
  -h, --help        Show this help
  -v, --version     Show the version
`;
var ALT_SCREEN_ON = "\x1B[?1049h\x1B[H";
var ALT_SCREEN_OFF = "\x1B[?1049l";
var SHOW_CURSOR = "\x1B[?25h";
async function update() {
  if (installKind() === "source") {
    process.stdout.write(`${SOURCE_HINT.replace(/`/g, "")}
`);
    return 1;
  }
  if (!REPO_CONFIGURED) {
    process.stderr.write("This build doesn't know its GitHub repo yet (package.json \u2192 repository).\n");
    return 1;
  }
  process.stdout.write("Checking for updates \u2026\n");
  const latest = await fetchLatestVersion();
  if (latest && compareVersions(latest, VERSION) <= 0) {
    process.stdout.write(`termdrop ${VERSION} is up to date.
`);
    return 0;
  }
  process.stdout.write(latest ? `Updating termdrop ${VERSION} \u2192 ${latest} \u2026
` : `Couldn't check the latest version \u2013 installing anyway \u2026
`);
  const res = await runInstall({ inherit: true, version: latest });
  if (res.ok) {
    const installed = await installedVersion();
    if (installed && latest && compareVersions(installed, latest) < 0) {
      process.stderr.write(`
${staleInstallHint(installed).replace(/`/g, "")}
`);
      return 1;
    }
    process.stdout.write(`
Done${installed ? ` \u2013 termdrop ${installed} is installed` : ""}. Start it with: termdrop
`);
    return 0;
  }
  process.stderr.write(`
Update failed. ${installHint(res.output) ?? "See the npm output above."}
`);
  return 1;
}
async function main() {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        to: { type: "string" },
        home: { type: "string" },
        port: { type: "string" },
        "no-discovery": { type: "boolean" },
        debug: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" }
      },
      strict: true
    }));
  } catch (err) {
    process.stderr.write(`${err.message}

${HELP}`);
    process.exit(2);
  }
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    process.stdout.write(`termdrop ${VERSION}
`);
    return;
  }
  if (positionals[0] === "update" && positionals.length === 1) {
    process.exit(await update());
  }
  let port;
  if (values.port !== void 0) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.stderr.write(`Invalid port: ${values.port}
`);
      process.exit(2);
    }
  }
  const paths = resolvePaths(values.home);
  const files = positionals.map((p) => path21.resolve(p));
  const to = values.to?.trim() || void 0;
  const reply = await handOff(paths.socket, { v: 1, paths: files, ...to ? { to } : {} });
  if (reply) {
    for (const r of reply.rejected) process.stderr.write(`Skipped ${r.reason}
`);
    if (!files.length) process.stdout.write("termdrop is already open in another window.\n");
    else if (reply.added) process.stdout.write(`Added ${plural(reply.added, "file")} to the open termdrop window.
`);
    else process.stderr.write("Nothing to send.\n");
    process.exit(files.length && !reply.added ? 1 : 0);
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write("termdrop needs an interactive terminal.\n");
    process.exit(1);
  }
  let lock;
  try {
    const got = await acquireLock(paths.lock, paths.socket);
    if (!("release" in got)) {
      process.stderr.write(`termdrop is already running with this data folder (pid ${got.holder.pid}), but it doesn't answer.
`);
      process.exit(1);
    }
    lock = got;
  } catch (err) {
    process.stderr.write(`Couldn't start termdrop: ${err.message}
`);
    process.exit(1);
  }
  let notice;
  try {
    const report = Hub.prepare(paths.hub);
    if (report.migrated) notice = migrationNotice(report.friends);
  } catch (err) {
    lock.release();
    process.stderr.write(`Couldn't read your profile in ${paths.hub.dir}: ${err.message}
`);
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
  }
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    lock.release();
    if (process.platform !== "win32") fs19.rmSync(paths.socket, { force: true });
    process.stdout.write(MOUSE_OFF + SHOW_CURSOR + ALT_SCREEN_OFF);
  };
  process.stdout.write(ALT_SCREEN_ON + MOUSE_ON);
  process.on("exit", restore);
  const crash = (err) => {
    restore();
    process.stderr.write(`
termdrop crashed: ${err instanceof Error ? err.stack ?? err.message : String(err)}
`);
    process.exit(1);
  };
  process.on("uncaughtException", crash);
  process.on("unhandledRejection", crash);
  for (const sig of ["SIGTERM", "SIGHUP"]) process.on(sig, () => process.exit(0));
  const app = render(
    /* @__PURE__ */ jsx16(Root, { paths, options: { port, discovery: !values["no-discovery"], debug: values.debug }, inbox, notice }),
    { exitOnCtrlC: false, patchConsole: true, stdin: new MouseFilterStdin(process.stdin) }
  );
  app.waitUntilExit().then(
    () => {
      restore();
      if (!restartRequested()) process.exit(0);
      process.stdin.removeAllListeners("data");
      process.stdin.pause();
      const child = spawn2(process.execPath, process.argv.slice(1), { stdio: "inherit" });
      child.on("exit", (code) => process.exit(code ?? 0));
      child.on("error", () => process.exit(0));
    },
    crash
  );
}
async function start() {
  const local = installKind() === "npm" ? newerLocalInstall(fileURLToPath(import.meta.url)) : null;
  if (local) {
    try {
      await import(pathToFileURL(local.cli).href);
      return;
    } catch (err) {
      process.stderr.write(`Couldn't start termdrop ${local.version} (${err.message}) \u2013 starting ${VERSION} instead.
`);
    }
  }
  await main();
}
void start();
