#!/usr/bin/env node

// src/cli.tsx
import fs13 from "fs";
import path13 from "path";
import { render } from "ink";
import { spawn as spawn2 } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import { parseArgs } from "util";

// src/core/paths.ts
import crypto from "crypto";
import os from "os";
import path from "path";
var MAX_SOCKET_PATH = 100;
function socketPath(root, platform = process.platform) {
  const tag = crypto.createHash("sha256").update(root).digest("hex").slice(0, 12);
  if (platform === "win32") return `\\\\.\\pipe\\termdrop-${tag}`;
  const inHome = path.join(root, "termdrop.sock");
  return Buffer.byteLength(inHome) <= MAX_SOCKET_PATH ? inHome : path.join(os.tmpdir(), `termdrop-${tag}.sock`);
}
function resolvePaths(home) {
  const root = path.resolve(home ?? process.env.TERMDROP_HOME ?? path.join(os.homedir(), ".termdrop"));
  return {
    home: root,
    identity: path.join(root, "identity.json"),
    config: path.join(root, "config.json"),
    contacts: path.join(root, "contacts.json"),
    peers: path.join(root, "peers.json"),
    transfers: path.join(root, "transfers.jsonl"),
    log: path.join(root, "termdrop.log"),
    lock: path.join(root, "termdrop.lock"),
    socket: socketPath(root)
  };
}
function defaultDownloadDir() {
  return path.join(os.homedir(), "Downloads");
}
function tildify(p) {
  const home = os.homedir();
  return p === home ? "~" : p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
}

// src/core/update.ts
import { execFile, spawn } from "child_process";
import fs from "fs";
import os2 from "os";
import path2 from "path";

// package.json
var package_default = {
  name: "termdrop",
  version: "1.0.0",
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
    tsup: "8.5.0",
    tsx: "4.20.6",
    typescript: "5.9.3",
    vitest: "4.1.11"
  }
};

// src/core/version.ts
var VERSION = package_default.version;
var REPO = /github\.com[/:]([^/]+\/[^/.]+)/.exec(package_default.repository.url)?.[1] ?? "OWNER/termdrop";
var REPO_CONFIGURED = !REPO.startsWith("OWNER/");
var INSTALL_SPEC = `https://github.com/${REPO}/tarball/main`;
var INSTALL_CMD = `npm i -g ${INSTALL_SPEC}`;

// src/core/update.ts
var VERSION_RE = /^\d+\.\d+\.\d+$/;
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
var latestUrl = () => process.env.TERMDROP_UPDATE_URL || `https://raw.githubusercontent.com/${REPO}/main/package.json`;
async function fetchLatestVersion(fetchImpl = fetch, timeoutMs = 5e3) {
  if (!REPO_CONFIGURED && !process.env.TERMDROP_UPDATE_URL) return null;
  try {
    const res = await fetchImpl(latestUrl(), { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const version = (await res.json())?.version;
    return typeof version === "string" && VERSION_RE.test(version) ? version : null;
  } catch {
    return null;
  }
}
async function checkForUpdate(fetchImpl) {
  if (process.env.TERMDROP_NO_UPDATE_CHECK === "1") return null;
  const latest = await fetchLatestVersion(fetchImpl);
  return latest && compareVersions(latest, VERSION) > 0 ? latest : null;
}
function installKind(script = process.argv[1] ?? "") {
  let real = script;
  try {
    real = fs.realpathSync(script);
  } catch {
  }
  return real.split(path2.sep).join("/").includes("/node_modules/termdrop/") ? "npm" : "source";
}
var SOURCE_HINT = `This termdrop runs from a source folder, so it doesn't update itself.
Update it there with \`git pull && npm install\`, or install the release with \`${INSTALL_CMD}\`.`;
var releaseSpec = (version) => `https://github.com/${REPO}/tarball/v${version}`;
var appDir = () => process.env.TERMDROP_APP_DIR || path2.join(os2.homedir(), ".termdrop", "app");
var installSpec = (version) => process.env.TERMDROP_INSTALL_SPEC || (version ? releaseSpec(version) : INSTALL_SPEC);
var isRoot = () => process.getuid?.() === 0;
function localInstall(dir = appDir()) {
  const root = path2.join(dir, "node_modules", "termdrop");
  try {
    const pkg = JSON.parse(fs.readFileSync(path2.join(root, "package.json"), "utf8"));
    const cli = path2.join(root, "dist", "cli.js");
    if (pkg?.name !== "termdrop" || typeof pkg.version !== "string" || !VERSION_RE.test(pkg.version)) return null;
    return fs.existsSync(cli) ? { version: pkg.version, cli } : null;
  } catch {
    return null;
  }
}
var realpath = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path2.resolve(p);
  }
};
function newerLocalInstall(self, ownVersion = VERSION) {
  const local = localInstall();
  if (!local || compareVersions(local.version, ownVersion) <= 0) return null;
  return realpath(local.cli) === realpath(self) ? null : local;
}
function installedInto(script) {
  let dir = path2.dirname(realpath(script));
  while (path2.dirname(dir) !== dir) {
    if (path2.basename(dir) === "termdrop" && path2.basename(path2.dirname(dir)) === "node_modules") return path2.dirname(dir);
    dir = path2.dirname(dir);
  }
  return null;
}
function installTarget(script = process.argv[1] ?? "", root = isRoot()) {
  const modules = installedInto(script);
  if (!modules) return "global";
  if (realpath(modules).startsWith(realpath(appDir()) + path2.sep)) return "local";
  if (root) return "global";
  try {
    fs.accessSync(modules, fs.constants.W_OK);
    return "global";
  } catch {
    return "local";
  }
}
function npmInstall(spec, inherit, target) {
  const dir = appDir();
  const args = target === "global" ? ["install", "-g", "--prefer-online", spec] : (
    // own cache: after `sudo npm ...`, ~/.npm often contains root-owned files
    ["install", "--prefix", dir, "--cache", path2.join(dir, ".npm-cache"), "--prefer-online", "--no-audit", "--no-fund", spec]
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
var PERMISSION_RE = /EACCES|EPERM|permission denied/i;
async function runInstall({ inherit, version }) {
  if (!REPO_CONFIGURED && !process.env.TERMDROP_INSTALL_SPEC) return { ok: false, output: "The GitHub repo is not set in package.json yet." };
  const attempt = async (target2) => {
    if (version && !process.env.TERMDROP_INSTALL_SPEC) {
      const res2 = await npmInstall(installSpec(version), inherit, target2);
      if (res2.ok || PERMISSION_RE.test(res2.output)) return res2;
    }
    return npmInstall(installSpec(), inherit, target2);
  };
  const target = installTarget();
  const res = await attempt(target);
  if (!res.ok && target === "global" && !isRoot() && PERMISSION_RE.test(res.output)) return attempt("local");
  return res;
}
function installedVersion(script = process.argv[1] ?? "") {
  return new Promise((resolve) => {
    execFile(process.execPath, [script, "--version"], { timeout: 15e3 }, (err, stdout) => {
      const version = /termdrop (\d+\.\d+\.\d+)/.exec(String(stdout))?.[1];
      resolve(err || !version ? null : version);
    });
  });
}
var staleInstallHint = (installed) => `npm finished, but termdrop ${installed} is still the version that starts. Try \`termdrop update\` again in a few minutes \u2013 GitHub can take a moment after a release.`;
function installHint(output) {
  if (PERMISSION_RE.test(output)) {
    return `npm isn't allowed to write to ${appDir()}. That folder should belong to you \u2013 fix it with \`sudo chown -R "$(whoami)" ~/.termdrop\`, then run /update again.`;
  }
  return null;
}
var restart = false;
var requestRestart = () => void (restart = true);
var restartRequested = () => restart;

// src/transfer/handoff.ts
import { EventEmitter } from "events";
import fs4 from "fs";
import net from "net";
import path5 from "path";

// src/core/storage.ts
import fs2 from "fs";
import path3 from "path";
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
    fs2.renameSync(file, `${file}.corrupt-${Date.now()}`);
    return fallback;
  }
}
function writeJsonAtomic(file, data) {
  ensureDir(path3.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs2.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 384 });
  fs2.renameSync(tmp, file);
}
function appendJsonl(file, entry) {
  ensureDir(path3.dirname(file));
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
function ensureDir(dir) {
  fs2.mkdirSync(dir, { recursive: true, mode: 448 });
}

// src/transfer/filenames.ts
import fs3 from "fs";
import path4 from "path";

// src/core/sanitize.ts
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
function truncateBytes(text, max) {
  if (Buffer.byteLength(text) <= max) return text;
  let out = "";
  let bytes = 0;
  for (const ch of text) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > max) break;
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
  const full = path4.join(dir, name);
  if (path4.dirname(full) !== path4.resolve(dir) || path4.basename(full) !== name) {
    throw new Error(`Refusing to write outside the download folder: ${name}`);
  }
  return full;
}
var exists = (p) => {
  try {
    fs3.lstatSync(p);
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
      const handle = await fs3.promises.open(partPath, "wx", mode);
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
      await fs3.promises.link(partPath, final);
      await fs3.promises.unlink(partPath);
      return final;
    } catch (err) {
      const code = err.code ?? "";
      if (code === "EEXIST") continue;
      if (!NO_LINKS.has(code)) throw err;
      if (exists(final)) continue;
      await fs3.promises.rename(partPath, final);
      return final;
    }
  }
  throw new Error(`No free name for ${name}`);
}
async function removePart(partPath) {
  try {
    await fs3.promises.unlink(partPath);
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
var STARTUP_GRACE = 1e4;
var MAX_REQUEST = 1024 * 1024;
var MAX_PATH = 4096;
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
    const o = JSON.parse(fs4.readFileSync(file, "utf8"));
    return Number.isInteger(o?.pid) && typeof o.startedAt === "number" && typeof o.socket === "string" ? o : null;
  } catch {
    return null;
  }
}
async function acquireLock(lockFile, socket, opts = {}) {
  const isAlive = opts.isAlive ?? pidAlive;
  const probe = opts.probe ?? probeSocket;
  const now = opts.now ?? Date.now;
  ensureDir(path5.dirname(lockFile));
  for (let attempt = 0; attempt < 5; attempt++) {
    const info = { pid: process.pid, startedAt: now(), socket };
    try {
      fs4.writeFileSync(lockFile, JSON.stringify(info), { flag: "wx", mode: 384 });
      return {
        release: () => {
          if (readLock(lockFile)?.pid === process.pid) fs4.rmSync(lockFile, { force: true });
        }
      };
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
    const holder = readLock(lockFile);
    const stale = !holder || holder.pid === process.pid || !isAlive(holder.pid) || !await probe(holder.socket) && now() - holder.startedAt > STARTUP_GRACE;
    if (!stale) return { holder };
    fs4.rmSync(lockFile, { force: true });
  }
  throw new Error(`Couldn't take the lock ${lockFile}`);
}
function parseRequest(raw) {
  let o;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || o.v !== 1 || !Array.isArray(o.paths) || o.paths.length > MAX_FILES) return null;
  if (!o.paths.every((p) => typeof p === "string" && p.length > 0 && p.length <= MAX_PATH && path5.isAbsolute(p))) return null;
  if (o.to !== void 0 && (typeof o.to !== "string" || o.to.length > 64)) return null;
  return { v: 1, paths: o.paths, ...typeof o.to === "string" ? { to: o.to } : {} };
}
async function startHandoffServer(socket, onRequest) {
  if (process.platform !== "win32") fs4.rmSync(socket, { force: true });
  const server = net.createServer((conn) => {
    let buf = "";
    conn.setEncoding("utf8");
    conn.setTimeout(5e3, () => conn.destroy());
    conn.on("error", () => {
    });
    conn.on("data", (chunk) => {
      buf += chunk;
      if (buf.length > MAX_REQUEST) return void conn.destroy();
      const nl = buf.indexOf("\n");
      if (nl === -1) return;
      const req = parseRequest(buf.slice(0, nl));
      let reply = { ok: false, added: 0, rejected: [] };
      if (req) {
        try {
          reply = onRequest(req);
        } catch {
        }
      }
      conn.end(JSON.stringify(reply) + "\n");
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socket, () => {
      server.off("error", reject);
      resolve();
    });
  });
  if (process.platform !== "win32") fs4.chmodSync(socket, 384);
  server.on("error", () => {
  });
  server.unref();
  return server;
}
function handOff(socket, req, timeoutMs = 3e3) {
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
    c2.once("connect", () => c2.write(JSON.stringify(req) + "\n"));
    c2.on("data", (chunk) => {
      buf += chunk;
      const nl = buf.indexOf("\n");
      if (nl === -1) return;
      try {
        const r = JSON.parse(buf.slice(0, nl));
        done({ ok: r.ok === true, added: Number(r.added) || 0, rejected: Array.isArray(r.rejected) ? r.rejected : [] });
      } catch {
        done(null);
      }
    });
    c2.on("error", () => done(null));
    c2.on("close", () => done(null));
  });
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
import path6 from "path";
var showPath = (p) => sanitizeText(p).replace(/\s+/g, " ");
function inspectPaths(paths, already = []) {
  const files = [];
  const rejected = [];
  const seen = new Set(already.map((f) => f.path));
  for (const raw of paths) {
    const p = path6.resolve(raw);
    const label = cleanName(path6.basename(p) || p);
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
    files.push({ path: p, name: path6.basename(p), size: st.size });
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
  const min = Math.round(seconds / 60);
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `~${h} h ${m} min` : `~${h} h`;
}
var plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
function filesLabel(files) {
  return files.length === 1 ? files[0].name : plural(files.length, "file");
}

// src/ui/App.tsx
import { Box as Box14, Text as Text14, useApp, useInput as useInput8 } from "ink";
import { useCallback, useEffect as useEffect7, useMemo, useRef as useRef4, useState as useState9 } from "react";

// src/commands/builtin.ts
import net3 from "net";
import path8 from "path";

// src/core/contacts.ts
function displayName(c2) {
  return c2.alias || c2.name;
}
var ContactBook = class {
  constructor(paths) {
    this.paths = paths;
    const list = readJson(paths.contacts, []);
    for (const c2 of Array.isArray(list) ? list : []) {
      if (c2 && typeof c2.id === "string") this.contacts.set(c2.id, c2);
    }
  }
  contacts = /* @__PURE__ */ new Map();
  get(id) {
    return this.contacts.get(id);
  }
  all() {
    return [...this.contacts.values()];
  }
  upsert(id, patch) {
    const prev = this.contacts.get(id);
    if (!prev && (patch.publicKey === void 0 || !patch.name || !patch.state)) return void 0;
    const now = Date.now();
    const base = prev ?? { lastActivity: now, createdAt: now };
    const next = { ...base, ...patch, id };
    this.contacts.set(id, next);
    this.save();
    return next;
  }
  remove(id) {
    if (this.contacts.delete(id)) this.save();
  }
  save() {
    writeJsonAtomic(this.paths.contacts, this.all());
  }
};

// src/core/identity.ts
import crypto2 from "crypto";
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
function fromFile(file) {
  const publicRaw = Buffer.from(file.publicKey, "base64url");
  const privateKey = crypto2.createPrivateKey({
    key: { kty: "OKP", crv: "Ed25519", x: file.publicKey, d: file.privateKey },
    format: "jwk"
  });
  return { id: fingerprint(publicRaw), publicRaw, publicKey: publicKeyFromRaw(publicRaw), privateKey };
}
function loadOrCreateIdentity(paths) {
  const existing = readJson(paths.identity, null);
  if (existing?.v === 1 && existing.publicKey && existing.privateKey) return fromFile(existing);
  const { privateKey } = crypto2.generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  const file = { v: 1, publicKey: jwk.x, privateKey: jwk.d };
  writeJsonAtomic(paths.identity, file);
  return fromFile(file);
}
function loadConfig(paths) {
  const cfg = readJson(paths.config, null);
  return cfg && typeof cfg.name === "string" && cfg.name ? cfg : null;
}
function saveConfig(paths, cfg) {
  writeJsonAtomic(paths.config, cfg);
}

// src/core/network.ts
import net2 from "net";
import { EventEmitter as EventEmitter5 } from "events";

// src/transfer/link.ts
import { EventEmitter as EventEmitter3 } from "events";

// src/core/framing.ts
import { EventEmitter as EventEmitter2 } from "events";
var MAX_FRAME = 64 * 1024;
var FrameTooLargeError = class extends Error {
  constructor(size) {
    super(`Frame too large (${size} bytes)`);
  }
};
function encodeFrame(payload) {
  if (payload.length > MAX_FRAME) throw new FrameTooLargeError(payload.length);
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
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
var FrameSocket = class extends EventEmitter2 {
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
  send(payload) {
    if (this.closed) return false;
    this.socket.write(encodeFrame(payload));
    return true;
  }
  /**
   * Like send(), for bulk data: header and payload go out without being copied together, and
   * the result is the socket's backpressure signal – `false` means wait for drained().
   */
  write(payload) {
    if (this.closed) return false;
    if (payload.length > MAX_FRAME) throw new FrameTooLargeError(payload.length);
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(payload.length, 0);
    this.socket.cork();
    this.socket.write(header);
    const ok = this.socket.write(payload);
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

// src/core/handshake.ts
import crypto4 from "crypto";

// src/core/channel.ts
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

// src/core/handshake.ts
var PROTOCOL = "termdrop/1";
var HANDSHAKE_TIMEOUT = 5e3;
var XID_RE = /^[A-Za-z0-9_-]{12,32}$/;
var HandshakeError = class extends Error {
};
function parseHello(frame) {
  let obj;
  try {
    obj = JSON.parse(frame.toString("utf8"));
  } catch {
    throw new HandshakeError("Invalid handshake");
  }
  const o = obj;
  if (o?.t !== "hello" || o.p !== PROTOCOL || typeof o.eph !== "string" || typeof o.nonce !== "string") {
    throw new HandshakeError("Not a termdrop peer or incompatible version");
  }
  const eph = Buffer.from(o.eph, "base64url");
  const nonce = Buffer.from(o.nonce, "base64url");
  if (eph.length !== 32 || nonce.length !== 16) throw new HandshakeError("Invalid handshake");
  return { eph, nonce };
}
function authPayload(role, transcript) {
  return Buffer.concat([Buffer.from(`${PROTOCOL} auth ${role}`), transcript]);
}
async function performHandshake(fs14, me, myName, initiator, timeoutMs = HANDSHAKE_TIMEOUT, xid) {
  const { privateKey: ephPriv, publicKey: ephPub } = crypto4.generateKeyPairSync("x25519");
  const ephRaw = Buffer.from(ephPub.export({ format: "jwk" }).x, "base64url");
  const nonce = crypto4.randomBytes(16);
  fs14.send(
    Buffer.from(
      JSON.stringify({ t: "hello", p: PROTOCOL, eph: ephRaw.toString("base64url"), nonce: nonce.toString("base64url") })
    )
  );
  const peer = parseHello(await fs14.read(timeoutMs));
  if (peer.eph.equals(ephRaw)) throw new HandshakeError("Reflected handshake");
  const [i, r] = initiator ? [{ eph: ephRaw, nonce }, peer] : [peer, { eph: ephRaw, nonce }];
  const transcript = crypto4.createHash("sha256").update(PROTOCOL).update(i.eph).update(i.nonce).update(r.eph).update(r.nonce).digest();
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
  const okm = Buffer.from(crypto4.hkdfSync("sha256", shared, transcript, `${PROTOCOL} keys`, 64));
  const i2r = okm.subarray(0, 32);
  const r2i = okm.subarray(32, 64);
  const send = new CipherState(initiator ? i2r : r2i);
  const recv = new CipherState(initiator ? r2i : i2r);
  const myRole = initiator ? "I" : "R";
  const peerRole = initiator ? "R" : "I";
  const sig = crypto4.sign(null, authPayload(myRole, transcript), me.privateKey);
  fs14.send(
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
    auth = JSON.parse(recv.decrypt(await fs14.read(timeoutMs)).toString("utf8"));
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
      authPayload(peerRole, transcript),
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

// src/core/protocol.ts
var REJECT_REASONS = ["declined", "no_space", "busy", "too_large"];
var FAIL_REASONS = ["hash_mismatch", "too_much_data", "file_changed", "disk_error", "read_error", "protocol"];
var SHA256_RE = /^[0-9a-f]{64}$/;
var MAX_INDEX = 1e4;
var isXid = (v) => typeof v === "string" && XID_RE.test(v);
function parseJson(buf) {
  let o;
  try {
    o = JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
  return o && typeof o === "object" && !Array.isArray(o) ? o : null;
}
function parseWire(buf) {
  const o = parseJson(buf);
  if (!o) return null;
  switch (o.t) {
    case "state": {
      const port = Number(o.port);
      if (!REL_STATES.includes(o.state)) return null;
      return {
        t: "state",
        name: cleanName(o.name),
        state: o.state,
        port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 0
      };
    }
    case "presence":
      if (typeof o.away !== "boolean") return null;
      return { t: "presence", away: o.away };
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
    case "decline":
    case "ping":
    case "pong":
    case "bye":
      return { t: o.t };
    default:
      return null;
  }
}
function parseLinkMsg(buf) {
  const o = parseJson(buf);
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
function encodeWire(msg) {
  return Buffer.from(JSON.stringify(msg), "utf8");
}
var REL_STATES = ["accepted", "outgoing", "none"];
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

// src/transfer/link.ts
var TAG_LEN2 = 16;
var DATA = 0;
var MSG = 1;
var CHUNK_SIZE = MAX_FRAME - 1 - TAG_LEN2;
var DataLink = class extends EventEmitter3 {
  constructor(fs14, hs, xid) {
    super();
    this.fs = fs14;
    this.hs = hs;
    this.peerId = hs.peerId;
    this.xid = xid;
    fs14.on("frame", (frame) => this.onFrame(frame));
    fs14.on("close", (err) => this.finish(err ? err.message : "Connection closed"));
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

// src/core/peer.ts
import { EventEmitter as EventEmitter4 } from "events";
var PING_INTERVAL = 15e3;
var IDLE_TIMEOUT = 45e3;
var RATE_WINDOW = 1e3;
var RATE_MAX = 200;
var Session = class extends EventEmitter4 {
  constructor(fs14, hs, initiator, tag) {
    super();
    this.fs = fs14;
    this.hs = hs;
    this.initiator = initiator;
    this.tag = tag;
    this.peerId = hs.peerId;
    this.peerPublicRaw = hs.peerPublicRaw;
    this.peerName = hs.peerName;
    fs14.on("frame", (frame) => this.onFrame(frame));
    fs14.on("close", (err) => this.finish(err ? err.message : "Connection closed"));
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
    return this.fs.send(this.hs.send.encrypt(encodeWire(msg)));
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
    const msg = parseWire(plain);
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

// src/core/network.ts
var DEFAULT_PORT = 5054;
var MAX_PENDING_HANDSHAKES = 32;
var DIAL_TIMEOUT = 4e3;
var Network = class extends EventEmitter5 {
  constructor(me, getName) {
    super();
    this.me = me;
    this.getName = getName;
  }
  server = null;
  pendingHandshakes = 0;
  sessions = /* @__PURE__ */ new Map();
  port = 0;
  /** Listens on the preferred port, or on a free one if it's taken. */
  async start(preferredPort = DEFAULT_PORT) {
    const tryListen = (port) => new Promise((resolve, reject) => {
      const server = net2.createServer((socket) => this.onIncoming(socket));
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
    this.server.on("error", (err) => this.emit("log", `Server-Fehler: ${err.message}`));
    this.port = this.server.address().port;
    return this.port;
  }
  isOnline(id) {
    return this.sessions.get(id)?.isOpen ?? false;
  }
  get(id) {
    return this.sessions.get(id);
  }
  /**
   * Opens a connection. With `expectedId`, verifies that this exact peer is on the
   * other end – otherwise disconnects immediately.
   */
  async dial(host, port, expectedId, tag) {
    const fs14 = new FrameSocket(await this.connect(host, port));
    try {
      const hs = await performHandshake(fs14, this.me, this.getName(), true);
      if (expectedId && hs.peerId !== expectedId) {
        throw new HandshakeError("Someone else is now reachable at this address");
      }
      return this.register(new Session(fs14, hs, true, tag));
    } catch (err) {
      fs14.destroy();
      throw err;
    }
  }
  /** Opens the data connection of transfer `xid` to exactly this peer. */
  async dialData(host, port, expectedId, xid) {
    const fs14 = new FrameSocket(await this.connect(host, port));
    try {
      const hs = await performHandshake(fs14, this.me, this.getName(), true, void 0, xid);
      if (hs.peerId !== expectedId) throw new HandshakeError("Someone else is now reachable at this address");
      return new DataLink(fs14, hs, xid);
    } catch (err) {
      fs14.destroy();
      throw err;
    }
  }
  connect(host, port) {
    return new Promise((resolve, reject) => {
      const s = net2.connect({ host, port });
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
    const fs14 = new FrameSocket(socket);
    try {
      const hs = await performHandshake(fs14, this.me, this.getName(), false);
      if (hs.xid) {
        const link = new DataLink(fs14, hs, hs.xid);
        if (!this.emit("link", link)) link.destroy("Not expected");
      } else {
        this.register(new Session(fs14, hs, false));
      }
    } catch (err) {
      this.emit("log", `Rejected incoming connection from ${fs14.remoteAddress}: ${err.message}`);
      fs14.destroy();
    } finally {
      this.pendingHandshakes--;
    }
  }
  /**
   * If both sides connect at the same time, the connection opened by the peer with
   * the smaller ID wins. Both sides independently reach the same result.
   */
  register(session) {
    const existing = this.sessions.get(session.peerId);
    if (existing?.isOpen) {
      const winner = this.me.id < session.peerId ? this.me.id : session.peerId;
      const initiatorOf = (s) => s.initiator ? this.me.id : s.peerId;
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

// src/transfer/paste.ts
import os3 from "os";
import path7 from "path";
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
function expandHome(p, home = os3.homedir()) {
  if (p === "~") return home;
  if (p.startsWith("~/") || p.startsWith("~\\")) return path7.join(home, p.slice(2));
  return p;
}
function parsePastedPaths(text, home = os3.homedir(), platform = process.platform) {
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
function resolvePastedPaths(text, exists4, home = os3.homedir(), platform = process.platform) {
  const parsed = parsePastedPaths(text, home, platform);
  if (parsed && parsed.every(exists4)) return parsed;
  const whole = expandHome(text.replace(BRACKETS, "").trim(), home);
  if (whole && isAbsolute(whole, platform) && exists4(whole)) return [whole];
  if (parsed && parsed.some(exists4)) return parsed;
  return null;
}

// src/ui/format.ts
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

// src/commands/parse.ts
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

// src/commands/registry.ts
var CommandRegistry = class {
  constructor(commands) {
    this.commands = commands;
  }
  find(name) {
    const n = name.toLowerCase();
    return this.commands.find((c2) => c2.name === n || c2.aliases?.includes(n));
  }
  available() {
    return this.commands;
  }
  /** Commands filtered by prefix. */
  suggest(prefix) {
    const p = prefix.toLowerCase();
    return this.commands.filter((c2) => c2.name.startsWith(p) || c2.aliases?.some((a) => a.startsWith(p)));
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
    const cmd = this.find(parsed.name);
    if (!cmd) {
      ui.print(`Unknown command /${parsed.name} \u2013 all commands: /help`, "error");
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
  const port = m[2] ? Number(m[2]) : DEFAULT_PORT;
  if (port < 1 || port > 65535) throw new Error(`Invalid port: ${m[2]}`);
  if (!net3.isIP(host) && !/^[a-z0-9.-]+$/i.test(host)) throw new Error(`Invalid address: ${input}`);
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
      ctx.ui.sendFiles(words.map((a) => path8.resolve(expandHome(a))), { recipients: true });
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
      ctx.ui.print(
        `### ${me.name}

- **ID** \`${formatId(me.id, true)}\`
- **Reachable at** ${addr}
- **Files are saved to** \`${showPath(tildify(ctx.store.downloadDir()))}\``
      );
    }
  },
  {
    name: "name",
    usage: "<new name>",
    minArgs: 1,
    description: "Change your display name",
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
        `- **Status** ${f.away ? "away" : f.online ? "online" : "offline"} \xB7 ${STATE_LABEL[f.state] ?? f.state}${f.trusted ? " \xB7 \u2605 trusted (files are accepted automatically)" : ""}`,
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
        const where = e.saved?.length ? ` \u2192 \`${showPath(tildify(path8.dirname(e.saved[0])))}\`` : "";
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
    description: "Desktop notifications for incoming files while termdrop is in the background",
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
var registry = new CommandRegistry(builtinCommands);

// src/core/store.ts
import fs8 from "fs";
import path9 from "path";

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

// src/transfer/manager.ts
import crypto7 from "crypto";
import fs7 from "fs";

// src/transfer/receiver.ts
import crypto6 from "crypto";

// src/transfer/sender.ts
import crypto5 from "crypto";
import fs6 from "fs";
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
      const hash = crypto5.createHash("sha256");
      let sent = 0;
      const stream = fs6.createReadStream(file.path, { highWaterMark: CHUNK_SIZE });
      try {
        for await (const chunk of stream) {
          const err2 = stopped();
          if (err2) throw err2;
          sent += chunk.length;
          if (sent > file.size) throw giveUp("file_changed", `${file.name} changed while it was being sent`);
          hash.update(chunk);
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
      link.sendMsg({ t: "eof", i, sha256: hash.digest("hex") });
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
      current = { ...r, hash: crypto6.createHash("sha256") };
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
var newXid = () => crypto7.randomBytes(12).toString("base64url");
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
      fs7.mkdirSync(dir, { recursive: true });
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
    if (this.deps.isTrusted(from)) {
      this.deps.toast(`Receiving ${filesLabel(m.files)} from ${name} (${formatBytes(m.total)})`, "info");
      this.deps.notify("termdrop", `Receiving ${filesLabel(m.files)} from ${name}`);
      this.accept(m.xid, true);
      return;
    }
    this.deps.toast(`${name} wants to send you ${label}`, "info");
    this.deps.notify("termdrop", `${name} wants to send you ${label}`);
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

// src/core/dialer.ts
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
  }
  /** Discovery saw peers (maybe at a new address) – retry them right away. */
  discovered(ids) {
    for (const id of ids) {
      const ds = this.states.get(id);
      if (ds && !ds.inFlight) ds.next = 0;
    }
  }
  /** Where friends were last seen – discovery asks there directly. */
  lastKnownIps() {
    const ips = /* @__PURE__ */ new Set();
    for (const c2 of this.d.contacts.all()) if (c2.lastIp && c2.state !== "blocked") ips.add(c2.lastIp);
    return [...ips];
  }
  wantsConnection(id) {
    if (this.d.network.isOnline(id)) return false;
    const state = this.d.contacts.get(id)?.state;
    return state === "accepted" || state === "outgoing";
  }
  /** Dials, and asks the peer to dial us too – whichever direction the firewalls allow wins. */
  connect(id) {
    this.tryDial(id);
    this.d.discovery()?.callMe(id);
  }
  /** A peer asked us to connect to them, e.g. because they sent us a request but can't reach us. */
  onCallback(id) {
    if (this.d.network.isOnline(id) || this.d.contacts.get(id)?.state === "blocked") return;
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
    for (const c2 of this.d.contacts.all()) {
      if (c2.state === "accepted" || c2.state === "outgoing") this.tryDial(c2.id);
    }
    const now = Date.now();
    for (const [id, at] of this.callbacks) {
      if (now - at >= CALLBACK_TTL) this.callbacks.delete(id);
      else this.tryDial(id);
    }
  }
  target(id) {
    const p = this.d.discovery()?.peers.get(id);
    if (p) return { ip: p.ip, port: p.port, discovered: true };
    const c2 = this.d.contacts.get(id);
    if (c2?.lastIp && c2.lastPort) return { ip: c2.lastIp, port: c2.lastPort, discovered: false };
    return null;
  }
  tryDial(id) {
    const { network, contacts } = this.d;
    if (network.isOnline(id)) return;
    const c2 = contacts.get(id);
    const now = Date.now();
    const wanted = c2?.state === "accepted" || c2?.state === "outgoing";
    const calledBack = c2?.state !== "blocked" && now - (this.callbacks.get(id) ?? -Infinity) < CALLBACK_TTL;
    if (!wanted && !calledBack) return;
    const t = this.target(id);
    if (!t) return;
    const ds = this.states.get(id) ?? { inFlight: false, next: 0, backoff: 1e3 };
    this.states.set(id, ds);
    if (ds.inFlight || now < ds.next) return;
    if (t.discovered && !calledBack && c2?.state !== "outgoing" && this.d.myId > id) {
      ds.deferredSince ??= now;
      if (now - ds.deferredSince < 4e3) return;
    }
    ds.inFlight = true;
    network.dial(t.ip, t.port, id).then(() => {
      this.states.delete(id);
    }).catch((err) => {
      this.d.log(`Connection to ${id} (${t.ip}:${t.port}) failed: ${err.message}`);
      ds.backoff = Math.min(ds.backoff * 2, t.discovered ? MAX_BACKOFF_NEARBY : MAX_BACKOFF);
      ds.next = Date.now() + ds.backoff;
      ds.failures = (ds.failures ?? 0) + 1;
      const friend = contacts.get(id);
      const waiting = friend?.state === "outgoing" || friend?.state === "accepted";
      if (waiting && t.discovered && ds.failures >= 3 && !network.isOnline(id) && !this.warned.has(id)) {
        this.warned.add(id);
        this.d.unreachable(
          id,
          `Can't reach ${displayName(friend)} at ${t.ip}:${t.port} yet \u2013 still trying. A firewall may be blocking termdrop (Windows: allow Node.js for public networks \xB7 macOS: allow incoming connections for node).`
        );
      }
    }).finally(() => {
      ds.inFlight = false;
    });
  }
};

// src/core/discovery.ts
import dgram from "dgram";
import os4 from "os";
import { EventEmitter as EventEmitter6 } from "events";
var DISCOVERY_PORT = 5055;
var ANNOUNCE_INTERVAL = 3e3;
var EXPIRE_AFTER = 1e4;
var ID_RE = /^[A-Z2-7]{20}$/;
var IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
var MAX_PACKET = 2048;
var HINT_INTERVAL = 15e3;
var REPROBE_AFTER = 3e4;
var MAX_GOSSIP = 32;
var SCAN_BATCH = 5;
var SCAN_TICK = 50;
var MIN_SCAN_PREFIX = 16;
var RESCAN_ALONE = 10 * 6e4;
function localIPv4s() {
  const out = [];
  for (const addrs of Object.values(os4.networkInterfaces())) {
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
      send(buf, address) {
        try {
          socket.send(buf, port, address, () => {
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
var Discovery = class extends EventEmitter6 {
  constructor(myId, getName, getPort, opts = {}) {
    super();
    this.myId = myId;
    this.getName = getName;
    this.getPort = getPort;
    this.opts = opts;
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
  /** True while the own subnet is being scanned. */
  get scanning() {
    return this.scanQueue !== null;
  }
  start() {
    const open = this.opts.transport ?? udpTransport(this.opts.udpPort ?? DISCOVERY_PORT);
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
  /** Re-announce immediately, e.g. after a name change. */
  announce(query) {
    const msg = this.message(query);
    for (const target of /* @__PURE__ */ new Set(["255.255.255.255", ...this.interfaces().map((i) => i.broadcast)])) this.sendTo(msg, target);
    for (const p of this.peers.values()) {
      this.sendTo(this.opts.wants?.(p.id) ? { ...msg, c: 1 } : msg, p.ip);
    }
  }
  /** Asks a peer right away to connect to us (e.g. after sending them a request). */
  callMe(id) {
    const p = this.peers.get(id);
    if (p) this.sendTo({ ...this.message(false), c: 1 }, p.ip);
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
    const msg = { app: "termdrop", v: 1, id: this.myId, name: this.getName(), port: this.getPort() };
    if (query) msg.q = 1;
    const ips = [...new Set([...this.peers.values()].map((p) => p.ip))].slice(0, MAX_GOSSIP);
    if (ips.length) msg.ips = ips;
    return msg;
  }
  sendTo(msg, address) {
    this.transport?.send(Buffer.from(JSON.stringify(msg)), address);
  }
  interfaces() {
    return this.opts.interfaces?.() ?? localIPv4s();
  }
  signature() {
    return this.interfaces().map((i) => `${i.address}/${i.netmask}`).sort().join(",");
  }
  /** Asks one address directly whether termdrop runs there (at most every 30 s). */
  probe(ip) {
    if (!IPV4_RE.test(ip) || this.interfaces().some((i) => i.address === ip)) return;
    for (const p of this.peers.values()) if (p.ip === ip) return;
    const last = this.probed.get(ip);
    if (last !== void 0 && Date.now() - last < REPROBE_AFTER) return;
    this.probed.set(ip, Date.now());
    this.sendTo(this.message(true), ip);
  }
  probeHints() {
    this.lastHints = Date.now();
    for (const ip of this.opts.hints?.() ?? []) this.probe(ip);
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
    const msg = this.message(true);
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
      this.sendTo(msg, next.value);
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
    if (!msg || msg.app !== "termdrop" || msg.v !== 1 || typeof msg.id !== "string" || !ID_RE.test(msg.id)) return;
    if (msg.id === this.myId) return;
    const port = Number(msg.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return;
    const prev = this.peers.get(msg.id);
    const peer = { id: msg.id, name: cleanName(msg.name), ip: address, port, lastSeen: Date.now() };
    this.peers.set(msg.id, peer);
    if (!prev || prev.ip !== peer.ip || prev.port !== peer.port || prev.name !== peer.name) this.emit("change");
    if (msg.q) this.sendTo(this.message(false), address);
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

// src/core/notify.ts
import { execFile as execFile2 } from "child_process";
var MAC_SCRIPT = "on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run";
function notify(title, body) {
  const cmd = process.platform === "darwin" ? ["osascript", ["-e", MAC_SCRIPT, title, body]] : process.platform === "linux" ? ["notify-send", ["--app-name=termdrop", "--", title, body]] : null;
  if (!cmd) return;
  try {
    execFile2(cmd[0], [...cmd[1]], () => {
    }).on("error", () => {
    });
  } catch {
  }
}

// src/core/peers.ts
var PeerBook = class {
  constructor(paths) {
    this.paths = paths;
    const list = readJson(paths.peers, []);
    for (const p of Array.isArray(list) ? list : []) {
      if (p && typeof p.id === "string") this.peers.set(p.id, p);
    }
  }
  peers = /* @__PURE__ */ new Map();
  get(id) {
    return this.peers.get(id);
  }
  update(id, patch) {
    const prev = this.peers.get(id) ?? { id, name: patch.name ?? "Unknown" };
    const next = { ...prev, ...patch, id };
    if (JSON.stringify(prev) === JSON.stringify(next) && this.peers.has(id)) return;
    this.peers.set(id, next);
    writeJsonAtomic(this.paths.peers, [...this.peers.values()]);
  }
};

// src/core/toasts.ts
var TOAST_MS = 4e3;
var Toasts = class {
  constructor(changed, ms = TOAST_MS) {
    this.changed = changed;
    this.ms = ms;
  }
  current = null;
  timer = null;
  show(text, kind = "info") {
    this.current = { text, kind };
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

// src/core/store.ts
var UNKNOWN_PEER_TIMEOUT = 15e3;
var FRIEND_ORDER = { accepted: 0, outgoing: 1, declined: 2, incoming: 3, blocked: 4 };
var AppStore = class {
  constructor(opts) {
    this.opts = opts;
    const cfg = loadConfig(opts.paths);
    if (!cfg) throw new Error("No profile found");
    this.paths = opts.paths;
    this.name = cfg.name;
    this.preferredPort = opts.port ?? cfg.port ?? DEFAULT_PORT;
    this.identity = loadOrCreateIdentity(opts.paths);
    this.contacts = new ContactBook(opts.paths);
    this.network = new Network(this.identity, () => this.name);
    this.peerBook = new PeerBook(opts.paths);
    this.history = new HistoryBook(opts.paths);
    this.toasts = new Toasts(() => this.changed());
    this.dialer = new Dialer({
      myId: this.identity.id,
      network: this.network,
      contacts: this.contacts,
      discovery: () => this.discovery,
      log: (l) => this.log(l),
      unreachable: (_id, text) => this.showToast(text, "error")
    });
    this.transfers = new TransferManager({
      send: (id, msg) => this.network.get(id)?.send(msg) ?? false,
      isOnline: (id) => this.network.isOnline(id),
      isFriend: (id) => this.contacts.get(id)?.state === "accepted",
      isTrusted: (id) => this.contacts.get(id)?.trusted === true,
      nameOf: (id) => this.peerName(id),
      dialsData: (id) => this.network.get(id)?.initiator ?? false,
      dialData: async (id, xid) => {
        const s = this.network.get(id);
        if (!s?.isOpen) throw new Error("not connected");
        return this.network.dialData(s.remoteAddress, s.remotePort, id, xid);
      },
      downloadDir: () => this.downloadDir(),
      freeSpace: opts.freeSpace ?? freeSpace,
      changed: () => this.changed(),
      toast: (text, kind) => this.showToast(text, kind),
      notify: (title, body) => this.desktopNotify(title, body),
      record: (entry) => this.record(entry),
      tuning: opts.tuning
    });
    this.network.on("session", (s) => this.onSession(s));
    this.network.on("link", (l) => this.transfers.onLink(l));
    this.network.on("offline", (id) => this.onOffline(id));
    this.network.on("log", (l) => this.log(l));
  }
  identity;
  contacts;
  network;
  transfers;
  history;
  paths;
  peerBook;
  dialer;
  toasts;
  discovery = null;
  name;
  preferredPort;
  listeners = /* @__PURE__ */ new Set();
  notifyQueued = false;
  focused = true;
  /** Peers that reported their terminal is in the background. */
  away = /* @__PURE__ */ new Set();
  sendSeq = 0;
  version = 0;
  /** Newer version on GitHub (checked by the UI at launch), shown in the header. */
  updateAvailable = null;
  /** The latest files handed to the app; the UI opens the send flow for it. */
  sendRequest = null;
  /** Creates the profile and keys on first launch. */
  static createProfile(paths, name) {
    loadOrCreateIdentity(paths);
    saveConfig(paths, { name: cleanName(name) });
  }
  // ───────────── Lifecycle ─────────────
  async start() {
    await this.network.start(this.preferredPort);
    if (this.opts.discovery !== false) {
      this.discovery = new Discovery(this.identity.id, () => this.name, () => this.network.port, {
        ...this.opts.discoveryOptions,
        udpPort: this.opts.discoveryPort,
        hints: () => this.dialer.lastKnownIps(),
        wants: (id) => this.dialer.wantsConnection(id)
      });
      this.discovery.on("change", () => {
        for (const p of this.discovery?.peers.values() ?? []) {
          const c2 = this.contacts.get(p.id);
          if (c2 && (c2.lastIp !== p.ip || c2.lastPort !== p.port)) this.contacts.upsert(p.id, { lastIp: p.ip, lastPort: p.port });
        }
        this.dialer.discovered(this.discovery?.peers.keys() ?? []);
        this.changed();
      });
      this.discovery.on("log", (l) => this.log(l));
      this.discovery.on("callback", (id) => this.dialer.onCallback(id));
      this.discovery.start();
    }
    this.dialer.start(this.opts.dialIntervalMs ?? 1500);
    this.changed();
  }
  async stop() {
    this.transfers.stop();
    this.dialer.stop();
    this.toasts.stop();
    this.discovery?.stop();
    await this.network.stop();
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
  // ───────────── Queries ─────────────
  get me() {
    return {
      id: this.identity.id,
      name: this.name,
      port: this.network.port,
      ips: localIPv4s().map((i) => i.address),
      discovery: this.discovery !== null,
      scanning: this.discovery?.scanning ?? false
    };
  }
  get toast() {
    return this.toasts.current;
  }
  isOnline(id) {
    return this.network.isOnline(id);
  }
  friend(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return void 0;
    const online = this.isOnline(id);
    return { ...c2, display: displayName(c2), online, away: online && this.away.has(id), busy: this.transfers.busyWith(id) };
  }
  /** Best name for any peer: own nickname/friend name, else what we remember. */
  peerName(id) {
    if (id === this.identity.id) return this.name;
    const c2 = this.contacts.get(id);
    if (c2) return displayName(c2);
    return this.peerBook.get(id)?.name ?? "Unknown";
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
    const known = new Set(all.map((f) => f.id));
    const presence = (f) => f.state !== "accepted" ? 4 : f.busy && f.online ? 0 : f.online && !f.away ? 1 : f.away ? 2 : 3;
    const friends = all.filter((f) => f.state !== "incoming").sort(
      (a, b) => FRIEND_ORDER[a.state] - FRIEND_ORDER[b.state] || presence(a) - presence(b) || a.display.localeCompare(b.display)
    );
    const requests = [
      ...this.transfers.incomingOffers().map((offer) => ({ kind: "offer", offer })),
      ...all.filter((f) => f.state === "incoming").sort((a, b) => b.lastActivity - a.lastActivity).map((friend) => ({ kind: "friend", friend }))
    ];
    return {
      requests,
      friends,
      nearby: [...this.discovery?.peers.values() ?? []].filter((p) => !known.has(p.id)).sort((a, b) => a.name.localeCompare(b.name))
    };
  }
  /** Number of accepted friends online. */
  onlineCount() {
    let n = 0;
    for (const id of this.network.sessions.keys()) if (this.contacts.get(id)?.state === "accepted") n++;
    return n;
  }
  totals() {
    return this.history.totals();
  }
  safetyCodeWith(id) {
    const c2 = this.contacts.get(id);
    if (!c2?.publicKey) return null;
    return safetyCode(this.identity.publicRaw, Buffer.from(c2.publicKey, "base64url"));
  }
  // ───────────── Files and folders ─────────────
  downloadDir() {
    return loadConfig(this.opts.paths)?.downloadDir ?? defaultDownloadDir();
  }
  /** Changes where received files go. The folder is created if needed. */
  setDownloadDir(dir) {
    const full = path9.resolve(dir);
    fs8.mkdirSync(full, { recursive: true });
    if (!fs8.statSync(full).isDirectory()) throw new Error(`${full} is not a folder`);
    fs8.accessSync(full, fs8.constants.W_OK);
    saveConfig(this.opts.paths, { ...loadConfig(this.opts.paths), downloadDir: full });
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
    if (!this.contacts.get(entry.peerId)) this.peerBook.update(entry.peerId, { name: entry.peerName, lastSeen: entry.ts });
  }
  // ───────────── UI helpers ─────────────
  showToast(text, kind = "info") {
    this.toasts.show(text, kind);
  }
  log(line) {
    if (!this.opts.debug) return;
    try {
      fs8.appendFileSync(this.opts.paths.log, `${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`);
    } catch {
    }
  }
  // ───────────── Friends ─────────────
  /** Request to a peer from "Nearby". */
  requestNearby(id) {
    const p = this.discovery?.peers.get(id);
    const existing = this.contacts.get(id);
    if (existing) {
      if (existing.state === "incoming") this.accept(id);
      else if (existing.state === "declined" || existing.state === "blocked") this.setState(id, "outgoing");
      this.dialer.connect(id);
      return;
    }
    if (!p) throw new Error("They are no longer nearby");
    this.contacts.upsert(id, { publicKey: "", name: p.name, state: "outgoing", lastIp: p.ip, lastPort: p.port });
    this.showToast(`Friend request sent to ${p.name}`);
    this.dialer.connect(id);
    this.changed();
  }
  /** Ask again (after a decline). */
  request(id) {
    this.setState(id, "outgoing");
    this.showToast("Friend request sent again");
    this.dialer.connect(id);
  }
  /** Add a friend by IP – for networks that block broadcast. */
  async addByAddress(host, port = DEFAULT_PORT) {
    const session = await this.network.dial(host, port, void 0, "request");
    return session.peerId;
  }
  accept(id) {
    const c2 = this.contacts.get(id);
    if (!c2 || c2.state !== "incoming") return;
    this.setState(id, "accepted");
    this.showToast(`You and ${displayName(c2)} are now friends`, "success");
    this.dialer.connect(id);
  }
  decline(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return;
    const s = this.network.get(id);
    if (s) {
      s.send({ t: "decline" });
      s.close("Declined");
    }
    this.contacts.remove(id);
    this.showToast(`Declined ${displayName(c2)}'s request`);
    this.changed();
  }
  block(id) {
    const c2 = this.contacts.get(id);
    if (!c2) return;
    this.contacts.upsert(id, { state: "blocked", trusted: false });
    this.network.get(id)?.close("Blocked");
    this.showToast(`${displayName(c2)} is blocked. No more connections will be accepted.`, "error");
    this.changed();
  }
  unblock(id) {
    const c2 = this.contacts.get(id);
    if (c2?.state !== "blocked") return;
    this.setState(id, "outgoing");
    this.showToast(`Unblocked ${displayName(c2)} \u2013 friend request sent`, "success");
    this.dialer.connect(id);
  }
  removeFriend(id) {
    const c2 = this.contacts.get(id);
    if (c2) this.peerBook.update(id, { name: displayName(c2) });
    this.contacts.remove(id);
    const s = this.network.get(id);
    if (s) {
      s.send({ t: "state", name: this.name, state: "none", port: this.network.port });
      s.close("Friend removed");
    }
    this.changed();
  }
  rename(id, alias) {
    const clean = alias.trim() ? cleanName(alias) : void 0;
    this.contacts.upsert(id, { alias: clean });
    this.changed();
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
  setName(name) {
    this.name = cleanName(name);
    saveConfig(this.opts.paths, { ...loadConfig(this.opts.paths), name: this.name });
    for (const id of this.network.sessions.keys()) this.sendState(id);
    this.discovery?.announce(false);
    this.changed();
    return this.name;
  }
  // ───────────── Presence and notifications ─────────────
  /** Terminal window gained/lost focus. Terminals without focus reporting stay "focused". */
  setFocused(focused) {
    if (this.focused === focused) return;
    this.focused = focused;
    for (const id of this.network.sessions.keys()) this.sendPresence(id);
    this.changed();
  }
  sendPresence(id) {
    this.network.get(id)?.send({ t: "presence", away: !this.focused });
  }
  /** False while the terminal window is in the background (if the terminal reports focus). */
  get isFocused() {
    return this.focused;
  }
  notificationsEnabled() {
    return loadConfig(this.opts.paths)?.notifications !== false;
  }
  setNotifications(on) {
    saveConfig(this.opts.paths, { ...loadConfig(this.opts.paths), notifications: on });
  }
  setUpdateAvailable(version) {
    if (this.updateAvailable === version) return;
    this.updateAvailable = version;
    if (version) this.showToast(`termdrop ${version} is available \u2013 /update installs it`);
    else this.changed();
  }
  desktopNotify(title, body) {
    if (this.focused || !this.notificationsEnabled()) return;
    (this.opts.notify ?? notify)(title, body);
  }
  // ───────────── Network events ─────────────
  setState(id, state) {
    this.contacts.upsert(id, { state, lastActivity: Date.now() });
    this.sendState(id);
    this.changed();
  }
  sendState(id) {
    const s = this.network.get(id);
    const c2 = this.contacts.get(id);
    s?.send({ t: "state", name: this.name, state: relStateFor(c2?.state ?? null), port: this.network.port });
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
        this.showToast(`Friend request sent to ${s.peerName} \u2013 waiting for them to accept`);
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
    if (!c2) {
      setTimeout(() => {
        if (s.isOpen && !this.contacts.get(id)) s.close("No request received");
      }, UNKNOWN_PEER_TIMEOUT).unref();
    }
    this.sendState(id);
    if (!this.focused) this.sendPresence(id);
    this.log(`Connected to ${s.peerName} (${id}) via ${s.remoteAddress}`);
    this.changed();
  }
  onOffline(id) {
    this.away.delete(id);
    this.transfers.onPeerOffline(id);
    this.contacts.upsert(id, { lastSeen: Date.now() });
    this.changed();
  }
  onWire(s, m) {
    if (this.network.get(s.peerId) !== s) return;
    const id = s.peerId;
    switch (m.t) {
      case "state":
        return this.onState(s, m);
      case "decline": {
        const c2 = this.contacts.get(id);
        if (c2?.state === "outgoing") {
          this.contacts.upsert(id, { state: "declined" });
          this.showToast(`${displayName(c2)} declined your friend request`, "error");
        }
        return;
      }
      case "presence": {
        if (!this.contacts.get(id)) return;
        if (m.away === this.away.has(id)) return;
        if (m.away) this.away.add(id);
        else this.away.delete(id);
        this.changed();
        return;
      }
      case "ping":
      case "pong":
      case "bye":
        return;
      default:
        if (this.contacts.get(id)?.state === "blocked") return;
        this.transfers.onWire(id, m);
    }
  }
  onState(s, m) {
    const id = s.peerId;
    const c2 = this.contacts.get(id);
    const prev = c2?.state ?? null;
    const next = reconcile(prev, m.state);
    if (next === null) {
      if (c2) {
        this.contacts.remove(id);
        this.showToast(`${displayName(c2)} withdrew their friend request`);
      }
      s.close("Not a friend");
      this.changed();
      return;
    }
    const updated = this.contacts.upsert(id, {
      publicKey: s.peerPublicRaw.toString("base64url"),
      name: m.name,
      state: next,
      lastIp: s.remoteAddress,
      lastPort: m.port || c2?.lastPort,
      lastSeen: Date.now(),
      ...prev !== next ? { lastActivity: Date.now() } : {},
      // a friendship that has to be confirmed again starts without trust
      ...prev === "accepted" && next !== "accepted" ? { trusted: false } : {}
    });
    const who = displayName(updated);
    if (next === "accepted" && prev !== "accepted") {
      this.showToast(prev === "outgoing" ? `${who} accepted your friend request` : `You and ${who} are now friends`, "success");
    } else if (next === "incoming" && prev !== "incoming") {
      this.showToast(`${who} wants to be friends`, "info");
      this.desktopNotify("termdrop", `${who} wants to be friends`);
    } else if (prev === "accepted" && next === "outgoing") {
      this.showToast(`${who} removed you as a friend \u2013 your request is waiting to be accepted`, "error");
    }
    if (relStateFor(prev) !== relStateFor(next)) this.sendState(id);
    this.changed();
  }
};

// src/ui/components/Header.tsx
import { Box, Text } from "ink";

// src/ui/theme.ts
import chalk from "chalk";
var theme = {
  accent: "#D97757",
  peer: "#7AA2F7",
  dim: "#8C8C8C",
  faint: "#5A5A5A",
  border: "#4E4E4E",
  success: "#8CC08A",
  error: "#E5737B",
  warning: "#E5C07B",
  code: "#C3A6E8"
};
var c = {
  accent: chalk.hex(theme.accent),
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
  send: "\u25B6",
  request: "\u25C6",
  pending: "\u25F7",
  joined: "\u2713",
  done: "\u2713",
  error: "\u2717",
  info: "\xB7",
  star: "\u2605",
  up: "\u2191",
  down: "\u2193",
  file: "\u25AA"
};

// src/ui/components/Header.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function Header({ store, width }) {
  const me = store.me;
  const online = store.onlineCount();
  const ip = me.ips[0] ? `${me.ips[0]}:${me.port}` : "no network";
  const wide = width >= 72;
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width, children: [
    /* @__PURE__ */ jsxs(Box, { paddingX: 1, width, children: [
      /* @__PURE__ */ jsx(Box, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsxs(Text, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx(Text, { backgroundColor: theme.accent, color: "#1E1E1E", bold: true, children: " termdrop " }),
        /* @__PURE__ */ jsxs(Text, { color: theme.faint, children: [
          " v",
          VERSION
        ] }),
        /* @__PURE__ */ jsx(Text, { children: "  " }),
        /* @__PURE__ */ jsx(Text, { bold: true, children: me.name }),
        wide ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " }),
          /* @__PURE__ */ jsx(Text, { color: theme.dim, children: formatId(me.id) })
        ] }) : null
      ] }) }),
      /* @__PURE__ */ jsxs(Box, { flexShrink: 0, marginLeft: 1, children: [
        store.updateAvailable ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.accent, bold: true, children: wide ? `\u2B06 ${store.updateAvailable} available \xB7 /update` : "\u2B06 update" }),
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " })
        ] }) : null,
        wide ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Text, { color: theme.dim, children: ip }),
          /* @__PURE__ */ jsx(Text, { color: theme.faint, children: " \xB7 " })
        ] }) : null,
        /* @__PURE__ */ jsx(Text, { color: online ? theme.success : theme.faint, children: online ? icons.online : icons.offline }),
        /* @__PURE__ */ jsxs(Text, { color: theme.dim, children: [
          " ",
          online,
          " ",
          wide ? online === 1 ? "friend online" : "friends online" : "online"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Text, { color: theme.faint, children: "\u2500".repeat(Math.max(0, width)) })
  ] });
}

// src/ui/components/Panel.tsx
import { Box as Box2, Text as Text2, useInput } from "ink";

// src/ui/text.ts
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

// src/ui/components/Panel.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function Panel({ text, width, height, onClose }) {
  useInput(() => onClose());
  const lines = renderText(text, width - 6).slice(0, Math.max(1, height - 4));
  return /* @__PURE__ */ jsxs2(Box2, { flexDirection: "column", height, width, children: [
    /* @__PURE__ */ jsx2(Box2, { borderStyle: "round", borderColor: theme.border, paddingX: 2, flexDirection: "column", width, children: lines.map((l, i) => /* @__PURE__ */ jsx2(Text2, { wrap: "truncate-end", children: l || " " }, i)) }),
    /* @__PURE__ */ jsx2(Box2, { paddingX: 1, children: /* @__PURE__ */ jsx2(Text2, { color: theme.dim, children: "press any key to close" }) })
  ] });
}

// src/ui/hooks.ts
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

// src/ui/mouse.ts
import { EventEmitter as EventEmitter7 } from "events";
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
var mouse = new EventEmitter7();
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
import fs10 from "fs";
import { Box as Box10, Text as Text10, useInput as useInput4 } from "ink";
import { useEffect as useEffect5, useRef as useRef3, useState as useState5 } from "react";

// src/ui/components/Banner.tsx
import { Box as Box3, Text as Text3 } from "ink";
import stringWidth from "string-width";
import { useEffect as useEffect3, useState as useState2 } from "react";

// src/ui/effects.ts
import chalk3 from "chalk";
var mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
var WHITE = [255, 255, 255];
var hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
var SHINE_SWEEP = 900;
var SHINE_HALF = 4;
function shineColor(base, col, row, width, t) {
  const u = t / SHINE_SWEEP;
  if (u < 0 || u >= 1) return base;
  const center = (width + 2 * SHINE_HALF + 6) * u - SHINE_HALF - 6 + row;
  const strength = Math.max(0, 1 - Math.abs(col + 0.5 - center) / SHINE_HALF);
  return mix(base, WHITE, strength * 0.85);
}
function shineLine(line, row, width, hex, t) {
  const base = hexToRgb(hex);
  if (t < 0 || t >= SHINE_SWEEP) return chalk3.hex(hex)(line);
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

// src/ui/components/Banner.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var LOGO = [
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 ",
  "\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557",
  "   \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2554\u2588\u2588\u2588\u2588\u2554\u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D",
  "   \u2588\u2588\u2551   \u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551\u255A\u2588\u2588\u2554\u255D\u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u255D ",
  "   \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551 \u255A\u2550\u255D \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551  \u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551     ",
  "   \u255A\u2550\u255D   \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D     \u255A\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D  \u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D     "
];
var LOGO_SMALL = ["\u2580\u2588\u2580 \u2588\u2580\u2580 \u2588\u2580\u2588 \u2588\u2580\u2584\u2580\u2588 \u2588\u2580\u2584 \u2588\u2580\u2588 \u2588\u2580\u2588 \u2588\u2580\u2588", " \u2588  \u2588\u2588\u2584 \u2588\u2580\u2584 \u2588 \u2580 \u2588 \u2588\u2584\u2580 \u2588\u2580\u2584 \u2588\u2584\u2588 \u2588\u2580\u2580"];
var LOGO_WIDTH = stringWidth(LOGO[0]);
function bannerCompact(width, rows) {
  return width < 80 || rows < 24;
}
function bannerHeight(compact) {
  return (compact ? LOGO_SMALL.length : LOGO.length) + 4;
}
var SHINE_EVERY = 6e3;
function useShine(active, delay = 250) {
  const [t, setT] = useState2(-1);
  useEffect3(() => {
    if (!active) {
      setT(-1);
      return;
    }
    let sweep = null;
    let next = null;
    const play = () => {
      const t0 = Date.now();
      sweep = setInterval(() => {
        const dt = Date.now() - t0;
        if (dt < SHINE_SWEEP) return setT(dt);
        if (sweep) clearInterval(sweep);
        sweep = null;
        setT(-1);
        next = setTimeout(play, SHINE_EVERY - SHINE_SWEEP);
      }, 33);
    };
    next = setTimeout(play, delay);
    return () => {
      if (next) clearTimeout(next);
      if (sweep) clearInterval(sweep);
    };
  }, [active, delay]);
  return t;
}
function Banner({ width, compact, selected, animate = true }) {
  const t = useShine(animate);
  const logo = compact ? LOGO_SMALL : LOGO;
  const logoWidth = compact ? stringWidth(LOGO_SMALL[0]) : LOGO_WIDTH;
  return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", width, alignItems: "center", flexShrink: 0, children: [
    logo.map((line, i) => /* @__PURE__ */ jsx3(Text3, { children: shineLine(line, i, logoWidth, theme.accent, t) }, i)),
    /* @__PURE__ */ jsx3(Text3, { children: " " }),
    /* @__PURE__ */ jsxs3(Box3, { children: [
      /* @__PURE__ */ jsx3(Text3, { color: theme.accent, children: selected ? `${icons.pointer} ` : "  " }),
      /* @__PURE__ */ jsx3(Text3, { backgroundColor: selected ? theme.accent : void 0, color: selected ? "#1E1E1E" : theme.accent, bold: true, children: ` ${icons.send} Send files ` }),
      /* @__PURE__ */ jsx3(Text3, { color: theme.dim, children: selected ? " enter" : "      " })
    ] }),
    /* @__PURE__ */ jsx3(Text3, { color: theme.faint, children: "or drag files into this window" }),
    /* @__PURE__ */ jsx3(Text3, { children: " " })
  ] });
}

// src/ui/components/CommandMenu.tsx
import { Box as Box4, Text as Text4 } from "ink";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var MENU_MAX = 6;
function menuHeight(count) {
  return count ? Math.min(count, MENU_MAX) : 0;
}
function CommandMenu({ items, selected, width }) {
  if (!items.length) return null;
  const start2 = Math.max(0, Math.min(selected - MENU_MAX + 1, items.length - MENU_MAX));
  const visible = items.slice(start2, start2 + MENU_MAX);
  const nameWidth = Math.min(34, Math.max(...items.map((it) => it.label.length)) + 2);
  return /* @__PURE__ */ jsx4(Box4, { flexDirection: "column", width, paddingX: 2, children: visible.map((item, i) => {
    const active = start2 + i === selected;
    return /* @__PURE__ */ jsxs4(Box4, { children: [
      /* @__PURE__ */ jsx4(Box4, { width: nameWidth, flexShrink: 0, children: /* @__PURE__ */ jsx4(Text4, { color: active ? theme.accent : void 0, bold: active, wrap: "truncate-end", children: item.label }) }),
      /* @__PURE__ */ jsx4(Text4, { color: active ? void 0 : theme.dim, wrap: "truncate-end", children: item.description })
    ] }, item.key);
  }) });
}

// src/ui/components/Dialog.tsx
import { Box as Box6, Text as Text6, useInput as useInput3 } from "ink";
import { useState as useState3 } from "react";

// src/ui/editor.ts
import stringWidth2 from "string-width";
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
      const gw = stringWidth2(g.segment);
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

// src/ui/components/InputBox.tsx
import { Box as Box5, Text as Text5, useInput as useInput2 } from "ink";
import { useRef as useRef2 } from "react";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
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
  onPaste
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
  const insertText = (raw) => {
    let text = cleanPaste(raw);
    if (singleLine) text = text.replace(/\n/g, " ");
    const state2 = latest.current;
    if (!text) return;
    if (maxLength !== void 0 && [...state2.value].length + [...text].length > maxLength) return;
    histIndex.current = null;
    change(edit.insert(state2, text));
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
      insertText(input);
    },
    { isActive }
  );
  const cw = contentWidth(width);
  const lines = layoutEditor(state, cw);
  const cursorLine = Math.max(0, lines.findIndex((l) => l.cursor !== null));
  const start2 = Math.max(0, Math.min(cursorLine - maxLines + 1, lines.length - maxLines));
  const visible = lines.slice(start2, start2 + maxLines);
  const empty = state.value.length === 0;
  return /* @__PURE__ */ jsx5(Box5, { borderStyle: "round", borderColor, paddingX: 1, width, flexDirection: "column", flexShrink: 0, children: visible.map((line, i) => {
    const prompt = start2 + i === 0 ? `${icons.pointer} ` : "  ";
    if (empty && i === 0) {
      return /* @__PURE__ */ jsxs5(Text5, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx5(Text5, { color: theme.accent, children: prompt }),
        isActive ? /* @__PURE__ */ jsx5(Text5, { inverse: true, children: " " }) : null,
        /* @__PURE__ */ jsx5(Text5, { color: theme.faint, children: placeholder ?? "" })
      ] }, i);
    }
    const cur = isActive ? line.cursor : null;
    if (cur === null) {
      return /* @__PURE__ */ jsxs5(Text5, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx5(Text5, { color: theme.accent, children: prompt }),
        line.text
      ] }, i);
    }
    const at = [...new Intl.Segmenter().segment(line.text.slice(cur))][0]?.segment ?? " ";
    return /* @__PURE__ */ jsxs5(Text5, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx5(Text5, { color: theme.accent, children: prompt }),
      line.text.slice(0, cur),
      /* @__PURE__ */ jsx5(Text5, { inverse: true, children: at }),
      line.text.slice(cur + (at === " " && cur >= line.text.length ? 0 : at.length))
    ] }, i);
  }) });
}

// src/ui/components/Dialog.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var PICK_VISIBLE = 8;
function dialogHeight(d) {
  if (d.kind === "confirm") return 4;
  if (d.kind === "prompt") return 7 + (d.hint ? 1 : 0);
  return 4 + Math.min(d.options.length, PICK_VISIBLE);
}
function Dialog({ spec, width }) {
  if (spec.kind === "confirm") return /* @__PURE__ */ jsx6(ConfirmDialog, { spec, width });
  if (spec.kind === "prompt") return /* @__PURE__ */ jsx6(PromptDialog, { spec, width });
  return /* @__PURE__ */ jsx6(PickDialog, { spec, width });
}
function Frame({ width, children }) {
  return /* @__PURE__ */ jsx6(Box6, { borderStyle: "round", borderColor: theme.accent, paddingX: 1, width, flexDirection: "column", flexShrink: 0, children });
}
function ConfirmDialog({ spec, width }) {
  useInput3((input, key) => {
    if (key.return || input === "y") spec.resolve(true);
    else if (key.escape || input === "n") spec.resolve(false);
  });
  return /* @__PURE__ */ jsxs6(Frame, { width, children: [
    /* @__PURE__ */ jsx6(Text6, { bold: true, wrap: "truncate-end", children: spec.title }),
    /* @__PURE__ */ jsxs6(Text6, { color: theme.dim, children: [
      /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: "enter" }),
      "/",
      /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: "y" }),
      " yes \xB7 ",
      /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: "esc" }),
      "/",
      /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: "n" }),
      " cancel"
    ] })
  ] });
}
function PromptDialog({ spec, width }) {
  const [state, setState] = useState3(
    () => spec.initial ? { value: spec.initial, cursor: spec.initial.length } : emptyEditor
  );
  return /* @__PURE__ */ jsxs6(Frame, { width, children: [
    /* @__PURE__ */ jsx6(Text6, { bold: true, wrap: "truncate-end", children: spec.title }),
    spec.hint ? /* @__PURE__ */ jsx6(Text6, { color: theme.dim, wrap: "truncate-end", children: spec.hint }) : null,
    /* @__PURE__ */ jsx6(
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
    /* @__PURE__ */ jsx6(Text6, { color: theme.dim, wrap: "truncate-end", children: "enter confirm \xB7 esc cancel" })
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
  return /* @__PURE__ */ jsxs6(Frame, { width, children: [
    /* @__PURE__ */ jsxs6(Text6, { bold: true, wrap: "truncate-end", children: [
      spec.title,
      spec.multi && chosen.size ? /* @__PURE__ */ jsxs6(Text6, { color: theme.dim, children: [
        " \xB7 ",
        chosen.size,
        " selected"
      ] }) : null
    ] }),
    visible.map((o, i) => {
      const active = start2 + i === cursor;
      const box = spec.multi ? chosen.has(o.id) ? "[x] " : "[ ] " : "";
      return /* @__PURE__ */ jsxs6(Text6, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsx6(Text6, { color: theme.accent, children: active ? `${icons.pointer} ` : "  " }),
        /* @__PURE__ */ jsx6(Text6, { color: chosen.has(o.id) ? theme.success : theme.dim, children: box }),
        /* @__PURE__ */ jsx6(Text6, { bold: active, color: active ? theme.accent : void 0, children: o.label }),
        o.hint ? /* @__PURE__ */ jsxs6(Text6, { color: theme.faint, children: [
          " \xB7 ",
          o.hint
        ] }) : null
      ] }, o.id);
    }),
    /* @__PURE__ */ jsx6(Text6, { color: theme.dim, wrap: "truncate-end", children: spec.multi ? `\u2191\u2193 move \xB7 space select \xB7 enter confirm${spec.opts?.emptyHint ? ` (${spec.opts.emptyHint})` : ""} \xB7 esc cancel` : "\u2191\u2193 move \xB7 enter choose \xB7 esc cancel" })
  ] });
}

// src/ui/components/Footer.tsx
import { Box as Box7, Text as Text7 } from "ink";
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var KIND_STYLE = {
  info: { color: theme.accent, icon: icons.request },
  success: { color: theme.success, icon: icons.joined },
  error: { color: theme.error, icon: icons.error }
};
function Footer({ hints, toast, width }) {
  if (toast) {
    const s = KIND_STYLE[toast.kind];
    return /* @__PURE__ */ jsx7(Box7, { width, paddingX: 1, children: /* @__PURE__ */ jsxs7(Text7, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsxs7(Text7, { color: s.color, children: [
        s.icon,
        " "
      ] }),
      toast.text
    ] }) });
  }
  return /* @__PURE__ */ jsx7(Box7, { width, paddingX: 1, children: /* @__PURE__ */ jsx7(Text7, { color: theme.dim, wrap: "truncate-end", children: hints.join(" \xB7 ") }) });
}

// src/ui/components/OfferDetail.tsx
import { Box as Box8, Text as Text8 } from "ink";
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
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
    /* @__PURE__ */ jsxs8(Text8, { bold: true, wrap: "truncate-end", children: [
      /* @__PURE__ */ jsxs8(Text8, { color: theme.accent, children: [
        icons.request,
        " "
      ] }),
      offer.peerName,
      /* @__PURE__ */ jsx8(Text8, { color: theme.dim, children: " wants to send you" })
    ] }),
    /* @__PURE__ */ jsx8(Text8, { children: " " }),
    shown.map((f, i) => /* @__PURE__ */ jsxs8(Box8, { width: inner, children: [
      /* @__PURE__ */ jsx8(Box8, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx8(Text8, { color: theme.faint, children: icons.file }) }),
      /* @__PURE__ */ jsx8(Box8, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsx8(Text8, { wrap: "truncate-middle", children: f.name }) }),
      /* @__PURE__ */ jsx8(Box8, { flexShrink: 0, marginLeft: 1, children: /* @__PURE__ */ jsx8(Text8, { color: theme.dim, children: formatBytes(f.size) }) })
    ] }, i)),
    offer.files.length > shown.length ? /* @__PURE__ */ jsxs8(Text8, { color: theme.dim, children: [
      "  \u2026 and ",
      plural(offer.files.length - shown.length, "more file")
    ] }) : null,
    /* @__PURE__ */ jsx8(Text8, { children: " " }),
    /* @__PURE__ */ jsxs8(Text8, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx8(Text8, { bold: true, children: plural(offer.files.length, "file") }),
      /* @__PURE__ */ jsx8(Text8, { color: theme.dim, children: " \xB7 " }),
      /* @__PURE__ */ jsx8(Text8, { bold: true, children: formatBytes(offer.total) })
    ] }),
    /* @__PURE__ */ jsxs8(Text8, { color: theme.dim, wrap: "truncate-middle", children: [
      "to ",
      tildify(dir),
      free !== null ? ` \xB7 ${formatBytes(free)} free` : ""
    ] }),
    /* @__PURE__ */ jsx8(Text8, { children: " " }),
    /* @__PURE__ */ jsxs8(Text8, { color: theme.dim, wrap: "truncate-end", children: [
      /* @__PURE__ */ jsx8(Text8, { color: theme.accent, children: "enter" }),
      " accept \xB7 ",
      /* @__PURE__ */ jsx8(Text8, { color: theme.accent, children: "x" }),
      " decline"
    ] })
  ] });
}

// src/ui/components/TransferList.tsx
import { Box as Box9, Text as Text9 } from "ink";
import { Fragment as Fragment2, jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
var itemKey = (i) => i.kind === "live" ? i.t.xid : i.e.xid;
var RECENT = 5;
function transferItems(store, recent = RECENT) {
  const live = store.transfers.open().map((t) => ({ kind: "live", t }));
  const done = store.history.recent(recent).map((e) => ({ kind: "done", e }));
  return [...live, ...done];
}
var itemRows = (i) => i.kind === "live" && (i.t.status === "active" || i.t.status === "connecting") ? 2 : 1;
function transferPanelHeight(items, compact) {
  const live = items.filter((i) => i.kind === "live");
  const done = items.filter((i) => i.kind === "done");
  const shownDone = compact ? done.slice(0, 2) : done;
  let rows = 2 + 1;
  rows += live.length ? live.reduce((n, i) => n + itemRows(i), 0) : 1;
  if (shownDone.length) rows += 1 + 1 + shownDone.length;
  if (!compact) rows += 2;
  return rows;
}
var Title = ({ children }) => /* @__PURE__ */ jsx9(Text9, { color: theme.dim, bold: true, children: children.toUpperCase() });
function Bar({ fill, width, color }) {
  const w = Math.max(4, width);
  const full = Math.round(Math.max(0, Math.min(1, fill)) * w);
  return /* @__PURE__ */ jsxs9(Text9, { children: [
    /* @__PURE__ */ jsx9(Text9, { color, children: "\u2501".repeat(full) }),
    /* @__PURE__ */ jsx9(Text9, { color: theme.faint, children: "\u2500".repeat(w - full) })
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
  return /* @__PURE__ */ jsx9(Box9, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx9(Text9, { color, children }) });
}
var Arrow = ({ dir }) => /* @__PURE__ */ jsx9(Cell, { color: dir === "out" ? theme.accent : theme.peer, children: dir === "out" ? icons.up : icons.down });
var Pointer = ({ on }) => /* @__PURE__ */ jsx9(Cell, { color: theme.accent, children: on ? icons.pointer : " " });
function LiveRow({ t, width, selected, nameW }) {
  const head = /* @__PURE__ */ jsxs9(Box9, { width, children: [
    /* @__PURE__ */ jsx9(Pointer, { on: selected }),
    /* @__PURE__ */ jsx9(Arrow, { dir: t.dir }),
    /* @__PURE__ */ jsx9(Box9, { width: nameW, flexShrink: 0, children: /* @__PURE__ */ jsx9(Text9, { bold: selected, color: selected ? theme.accent : void 0, wrap: "truncate-end", children: t.peerName }) }),
    /* @__PURE__ */ jsx9(Box9, { flexGrow: 1, flexShrink: 1, minWidth: 0, marginLeft: 1, children: /* @__PURE__ */ jsx9(Text9, { wrap: "truncate-middle", children: t.status === "active" && t.files.length > 1 ? `${t.files[t.fileIndex]?.name ?? ""} \xB7 ${t.fileIndex + 1}/${t.files.length}` : filesLabel(t.files) }) }),
    t.status === "waiting" ? /* @__PURE__ */ jsx9(Box9, { flexShrink: 0, marginLeft: 1, children: /* @__PURE__ */ jsxs9(Text9, { color: theme.warning, children: [
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
      /* @__PURE__ */ jsx9(Box9, { flexShrink: 0, children: /* @__PURE__ */ jsx9(Bar, { fill, width: barW, color: theme.accent }) }),
      /* @__PURE__ */ jsx9(Box9, { width: 5, flexShrink: 0, justifyContent: "flex-end", children: /* @__PURE__ */ jsx9(Text9, { children: pct }) }),
      /* @__PURE__ */ jsx9(Box9, { flexGrow: 1, flexShrink: 1, minWidth: 0, marginLeft: 1, children: /* @__PURE__ */ jsx9(Text9, { color: theme.dim, wrap: "truncate-end", children: info }) })
    ] })
  ] });
}
function DoneRow({ e, width, selected, nameW }) {
  const ok = e.result === "done";
  const right = ok ? formatBytes(e.total) : RESULT_LABEL[e.result];
  return /* @__PURE__ */ jsxs9(Box9, { width, children: [
    /* @__PURE__ */ jsx9(Pointer, { on: selected }),
    /* @__PURE__ */ jsx9(Cell, { color: ok ? theme.success : theme.error, children: ok ? icons.done : icons.error }),
    /* @__PURE__ */ jsx9(Arrow, { dir: e.dir }),
    /* @__PURE__ */ jsx9(Box9, { width: nameW, flexShrink: 0, children: /* @__PURE__ */ jsx9(Text9, { bold: selected, color: selected ? theme.accent : void 0, wrap: "truncate-end", children: e.peerName }) }),
    /* @__PURE__ */ jsx9(Box9, { flexGrow: 1, flexShrink: 1, minWidth: 0, marginLeft: 1, children: /* @__PURE__ */ jsx9(Text9, { color: theme.dim, wrap: "truncate-middle", children: filesLabel(e.files) }) }),
    /* @__PURE__ */ jsx9(Box9, { flexShrink: 0, marginLeft: 1, children: /* @__PURE__ */ jsx9(Text9, { color: ok ? theme.dim : theme.error, children: right }) })
  ] });
}
function TransferList({
  store,
  items,
  width,
  compact,
  selected,
  focused
}) {
  const inner = width - 4;
  const live = items.filter((i) => i.kind === "live");
  const done = items.filter((i) => i.kind === "done");
  const shownDone = compact ? done.slice(0, 2) : done;
  const totals = store.totals();
  const sel = (key) => focused && selected === key;
  const nameW = Math.max(4, Math.min(10, ...items.map((i) => (i.kind === "live" ? i.t.peerName : i.e.peerName).length)));
  return /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", borderStyle: "round", borderColor: focused ? theme.accent : theme.border, paddingX: 1, width, flexShrink: 0, children: [
    /* @__PURE__ */ jsx9(Title, { children: live.length ? `Transfers \xB7 ${live.length}` : "Transfers" }),
    live.length ? live.map((i) => /* @__PURE__ */ jsx9(LiveRow, { t: i.t, width: inner, selected: sel(i.t.xid), nameW }, i.t.xid)) : /* @__PURE__ */ jsx9(Text9, { color: theme.faint, wrap: "truncate-end", children: "Nothing running right now." }),
    shownDone.length ? /* @__PURE__ */ jsxs9(Fragment2, { children: [
      /* @__PURE__ */ jsx9(Text9, { children: " " }),
      /* @__PURE__ */ jsx9(Title, { children: "Recent" }),
      shownDone.map((i) => /* @__PURE__ */ jsx9(DoneRow, { e: i.e, width: inner, selected: sel(i.e.xid), nameW }, i.e.xid))
    ] }) : null,
    !compact ? /* @__PURE__ */ jsxs9(Fragment2, { children: [
      /* @__PURE__ */ jsx9(Text9, { children: " " }),
      /* @__PURE__ */ jsxs9(Text9, { color: theme.dim, wrap: "truncate-end", children: [
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
import fs9 from "fs";
import path10 from "path";
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
  if (!fs9.existsSync(p)) return Promise.resolve(false);
  if (platform === "darwin") return run("open", [p]);
  if (platform === "win32") return run("explorer", [p]);
  return run("xdg-open", [p]);
}
function revealPath(p, platform = process.platform) {
  const target = fs9.existsSync(p) ? p : path10.dirname(p);
  if (!fs9.existsSync(target)) return Promise.resolve(false);
  if (platform === "darwin") return run("open", target === p ? ["-R", p] : [target]);
  if (platform === "win32") return run("explorer", target === p ? [`/select,${p}`] : [target]);
  return run("xdg-open", [target === p ? path10.dirname(p) : target]);
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
import { Fragment as Fragment3, jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
var SIDE_BY_SIDE = 84;
var PANEL_WIDTH = 40;
var exists2 = (p) => {
  try {
    fs10.statSync(p);
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
    default:
      if (f.online && f.busy) return { icon: icons.online, color: theme.accent, text: "transferring" };
      if (f.away) return { icon: icons.away, color: theme.warning, text: "away" };
      if (f.online) return { icon: icons.online, color: theme.success, text: "online" };
      return { icon: icons.offline, color: theme.faint, text: "offline" };
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
    if (newestKey && newestKey !== seenOffer.current && !dialog) {
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
  const compact = bannerCompact(width, rows);
  const banner = bannerHeight(compact);
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
    /* @__PURE__ */ jsx10(Banner, { width, compact, selected: !tFocus && current?.type === "banner", animate: store.isFocused && idle }),
    /* @__PURE__ */ jsxs10(Box10, { flexDirection: side ? "row" : "column", height: mainHeight, width, alignItems: "flex-start", overflow: "hidden", children: [
      /* @__PURE__ */ jsxs10(Box10, { flexDirection: "column", height: listHeight, width: listWidth, paddingX: 1, overflow: "hidden", flexShrink: 0, children: [
        visible.map((l, i) => {
          if (l.kind === "gap") return /* @__PURE__ */ jsx10(Text10, { children: " " }, `g${i}`);
          if (l.kind === "section") {
            return /* @__PURE__ */ jsx10(Text10, { color: theme.dim, bold: true, children: l.title.toUpperCase() }, `s${i}`);
          }
          return /* @__PURE__ */ jsx10(Row, { entry: l.entry, selected: !tFocus && l.index === selected, width: inner }, l.entry.key);
        }),
        empty && listHeight - visible.length >= 3 ? /* @__PURE__ */ jsx10(EmptyHint, { store, width: inner }) : null
      ] }),
      showPanel ? /* @__PURE__ */ jsx10(Box10, { marginLeft: side ? 1 : 0, flexShrink: 0, height: side ? mainHeight : panelRows, overflow: "hidden", alignItems: "flex-start", children: currentOffer && !tFocus ? /* @__PURE__ */ jsx10(OfferDetail, { store, offer: currentOffer, width: panelWidth, maxFiles: offerFiles }) : /* @__PURE__ */ jsx10(
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
    dialog ? /* @__PURE__ */ jsx10(Dialog, { spec: dialog, width }) : commandMode ? /* @__PURE__ */ jsxs10(Fragment3, { children: [
      /* @__PURE__ */ jsx10(
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
      /* @__PURE__ */ jsx10(CommandMenu, { items: cmd.items, selected: cmd.selected, width })
    ] }) : null,
    /* @__PURE__ */ jsx10(Footer, { hints: commandMode ? ["enter run", "tab complete", "esc cancel"] : hints, toast: store.toast, width })
  ] });
}
function Pointer2({ selected }) {
  return /* @__PURE__ */ jsx10(Box10, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx10(Text10, { color: theme.accent, children: selected ? icons.pointer : " " }) });
}
function Row({ entry, selected, width }) {
  const nameWidth = Math.min(20, Math.max(10, Math.floor(width * 0.3)));
  const name = (text, extra) => /* @__PURE__ */ jsxs10(Box10, { width: nameWidth, flexShrink: 0, children: [
    /* @__PURE__ */ jsx10(Text10, { bold: selected, color: selected ? theme.accent : void 0, wrap: "truncate-end", children: text }),
    extra ? /* @__PURE__ */ jsx10(Text10, { color: theme.warning, children: extra }) : null
  ] });
  const dot = (icon, color) => /* @__PURE__ */ jsx10(Box10, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx10(Text10, { color, children: icon }) });
  if (entry.type === "banner") return null;
  if (entry.type === "nearby") {
    const p = entry.peer;
    return /* @__PURE__ */ jsxs10(Box10, { children: [
      /* @__PURE__ */ jsx10(Pointer2, { selected }),
      dot(icons.online, theme.success),
      name(p.name),
      /* @__PURE__ */ jsxs10(Text10, { color: theme.dim, wrap: "truncate-end", children: [
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
      /* @__PURE__ */ jsx10(Pointer2, { selected }),
      dot(icons.request, theme.accent),
      name(who),
      /* @__PURE__ */ jsx10(Text10, { wrap: "truncate-end", children: text })
    ] });
  }
  const f = entry.friend;
  const st = friendStatus(f);
  return /* @__PURE__ */ jsxs10(Box10, { children: [
    /* @__PURE__ */ jsx10(Pointer2, { selected }),
    dot(st.icon, st.color),
    /* @__PURE__ */ jsxs10(Box10, { width: nameWidth, flexShrink: 0, children: [
      /* @__PURE__ */ jsx10(Text10, { bold: selected, color: selected ? theme.accent : void 0, wrap: "truncate-end", children: f.display }),
      f.trusted && f.state === "accepted" ? /* @__PURE__ */ jsxs10(Text10, { color: theme.warning, children: [
        " ",
        icons.star
      ] }) : null
    ] }),
    /* @__PURE__ */ jsx10(Box10, { flexGrow: 1, flexShrink: 1, minWidth: 0, children: /* @__PURE__ */ jsx10(Text10, { color: f.state === "accepted" && f.online ? st.color : theme.dim, italic: f.state !== "accepted", wrap: "truncate-end", children: st.text }) })
  ] });
}
function EmptyHint({ store, width }) {
  const me = store.me;
  const addr = me.ips.length ? me.ips.map((ip) => `${ip}:${me.port}`).join(", ") : "no network";
  return /* @__PURE__ */ jsx10(Box10, { paddingLeft: 2, width, children: /* @__PURE__ */ jsxs10(Text10, { color: theme.dim, wrap: "wrap", children: [
    'Other termdrop users on your network show up under "Nearby" \u2013 press enter to send them a friend request. Not showing up? Press ',
    /* @__PURE__ */ jsx10(Text10, { color: theme.accent, children: "a" }),
    " and enter their IP. Yours:",
    " ",
    /* @__PURE__ */ jsx10(Text10, { color: theme.accent, children: addr })
  ] }) });
}

// src/ui/screens/FilePicker.tsx
import fs12 from "fs";
import path12 from "path";
import { Box as Box11, Text as Text11, useInput as useInput5 } from "ink";
import { useState as useState6 } from "react";

// src/ui/complete.ts
import fs11 from "fs";
import os5 from "os";
import path11 from "path";
var MAX_CANDIDATES = 50;
function completePath(input, cwd, home = os5.homedir(), platform = process.platform) {
  const sepAt = Math.max(input.lastIndexOf("/"), platform === "win32" ? input.lastIndexOf("\\") : -1);
  const dirPart = sepAt === -1 ? "" : input.slice(0, sepAt + 1);
  const prefix = input.slice(sepAt + 1);
  if (input === "~") return { value: "~/", candidates: [] };
  const dir = path11.resolve(cwd, expandHome(dirPart || ".", home));
  let entries;
  try {
    entries = fs11.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { value: input, candidates: [] };
  }
  const fold = platform === "darwin" || platform === "win32";
  const norm = (s) => fold ? s.toLowerCase() : s;
  const matches = entries.filter((e) => norm(e.name).startsWith(norm(prefix)) && (prefix.startsWith(".") || !e.name.startsWith("."))).map((e) => {
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) {
      try {
        isDir = fs11.statSync(path11.join(dir, e.name)).isDirectory();
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
import { jsx as jsx11, jsxs as jsxs11 } from "react/jsx-runtime";
var exists3 = (p) => {
  try {
    fs12.statSync(p);
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
      paths.map((p) => path12.resolve(cwd, expandHome(p))),
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
    const direct = path12.resolve(cwd, expandHome(v));
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
      /* @__PURE__ */ jsx11(Text11, { color: theme.dim, bold: true, children: "SEND FILES" }),
      /* @__PURE__ */ jsx11(Text11, { color: theme.dim, children: files.length ? ` \xB7 ${plural(files.length, "file")} \xB7 ${formatBytes(total)}` : "" })
    ] }),
    /* @__PURE__ */ jsx11(Text11, { children: " " }),
    /* @__PURE__ */ jsx11(Box11, { flexDirection: "column", height: listRows, paddingX: 1, overflow: "hidden", children: files.length === 0 ? /* @__PURE__ */ jsxs11(Text11, { color: theme.dim, wrap: "wrap", children: [
      "Drag files from Finder into this window, or type a path below (",
      /* @__PURE__ */ jsx11(Text11, { color: theme.accent, children: "tab" }),
      " completes). Folders aren't supported yet \u2013 zip them first."
    ] }) : visible.map((f, i) => {
      const active = focus === "list" && start2 + i === sel;
      return /* @__PURE__ */ jsxs11(Box11, { width: inner + 2, children: [
        /* @__PURE__ */ jsx11(Box11, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx11(Text11, { color: theme.accent, children: active ? icons.pointer : " " }) }),
        /* @__PURE__ */ jsx11(Box11, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx11(Text11, { color: theme.faint, children: icons.file }) }),
        /* @__PURE__ */ jsx11(Box11, { width: nameW, flexShrink: 0, children: /* @__PURE__ */ jsx11(Text11, { bold: active, color: active ? theme.accent : void 0, wrap: "truncate-middle", children: showPath(f.name) }) }),
        /* @__PURE__ */ jsx11(Box11, { width: 10, flexShrink: 0, justifyContent: "flex-end", children: /* @__PURE__ */ jsx11(Text11, { children: formatBytes(f.size) }) }),
        /* @__PURE__ */ jsx11(Box11, { flexGrow: 1, flexShrink: 1, minWidth: 0, marginLeft: 2, children: /* @__PURE__ */ jsx11(Text11, { color: theme.faint, wrap: "truncate-start", children: showPath(tildify(path12.dirname(f.path))) }) })
      ] }, f.path);
    }) }),
    /* @__PURE__ */ jsx11(Text11, { children: " " }),
    notices.slice(0, noticeRows).map((n, i) => /* @__PURE__ */ jsx11(Box11, { paddingX: 1, children: /* @__PURE__ */ jsxs11(Text11, { color: theme.error, wrap: "truncate-end", children: [
      icons.error,
      " ",
      n
    ] }) }, i)),
    /* @__PURE__ */ jsx11(
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
    candRows ? /* @__PURE__ */ jsx11(Box11, { flexDirection: "column", paddingX: 2, height: candRows, overflow: "hidden", children: Array.from({ length: candRows }, (_, r) => /* @__PURE__ */ jsx11(Box11, { children: candidates.slice(r * 3, r * 3 + 3).map((c2) => /* @__PURE__ */ jsx11(Box11, { width: colW, flexShrink: 0, children: /* @__PURE__ */ jsx11(Text11, { color: c2.endsWith("/") ? theme.peer : theme.dim, wrap: "truncate-end", children: showPath(c2) }) }, c2)) }, r)) }) : null,
    /* @__PURE__ */ jsx11(Footer, { hints, toast: store.toast, width })
  ] });
}

// src/ui/screens/Onboarding.tsx
import { Box as Box12, Text as Text12, useInput as useInput6 } from "ink";
import { useState as useState7 } from "react";
import { Fragment as Fragment4, jsx as jsx12, jsxs as jsxs12 } from "react/jsx-runtime";
function Onboarding({ paths, width, onDone }) {
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
      AppStore.createProfile(paths, name);
      setCreated({ name, id: loadOrCreateIdentity(paths).id });
    } catch (err) {
      setError(`Could not create profile: ${err.message}`);
    }
  };
  const boxWidth = Math.min(64, width - 4);
  return /* @__PURE__ */ jsxs12(Box12, { flexDirection: "column", paddingX: 2, paddingY: 1, children: [
    LOGO_SMALL.map((l, i) => /* @__PURE__ */ jsx12(Text12, { color: theme.accent, children: l }, i)),
    /* @__PURE__ */ jsx12(Text12, { color: theme.dim, children: "encrypted file sharing with friends on your network" }),
    /* @__PURE__ */ jsx12(Text12, { children: " " }),
    created ? /* @__PURE__ */ jsxs12(Fragment4, { children: [
      /* @__PURE__ */ jsxs12(Text12, { children: [
        "Welcome, ",
        /* @__PURE__ */ jsx12(Text12, { bold: true, children: created.name }),
        "!"
      ] }),
      /* @__PURE__ */ jsx12(Text12, { children: " " }),
      /* @__PURE__ */ jsx12(Text12, { color: theme.dim, children: "Your personal ID has been created:" }),
      /* @__PURE__ */ jsxs12(Text12, { color: theme.accent, bold: true, children: [
        "  ",
        formatId(created.id, true)
      ] }),
      /* @__PURE__ */ jsx12(Text12, { children: " " }),
      /* @__PURE__ */ jsx12(Text12, { color: theme.dim, children: "It's tied to a secret key on this device. That's how your friends recognize" }),
      /* @__PURE__ */ jsx12(Text12, { color: theme.dim, children: "you \u2013 even if your name or IP address changes." }),
      /* @__PURE__ */ jsx12(Text12, { color: theme.dim, children: "Every connection is end-to-end encrypted." }),
      /* @__PURE__ */ jsx12(Text12, { children: " " }),
      /* @__PURE__ */ jsxs12(Text12, { children: [
        "Press ",
        /* @__PURE__ */ jsx12(Text12, { color: theme.accent, children: "enter" }),
        " to continue"
      ] })
    ] }) : /* @__PURE__ */ jsxs12(Fragment4, { children: [
      /* @__PURE__ */ jsx12(Text12, { bold: true, children: "What should your friends see you as?" }),
      /* @__PURE__ */ jsx12(Text12, { color: theme.dim, children: "You can change it later with /name." }),
      /* @__PURE__ */ jsx12(Text12, { children: " " }),
      /* @__PURE__ */ jsx12(
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
      error ? /* @__PURE__ */ jsx12(Text12, { color: theme.error, children: error }) : null
    ] })
  ] });
}

// src/ui/screens/RecipientPicker.tsx
import { Box as Box13, Text as Text13, useInput as useInput7 } from "ink";
import { useEffect as useEffect6, useState as useState8 } from "react";
import { Fragment as Fragment5, jsx as jsx13, jsxs as jsxs13 } from "react/jsx-runtime";
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
      /* @__PURE__ */ jsx13(Text13, { color: theme.dim, bold: true, children: "SEND TO" }),
      /* @__PURE__ */ jsxs13(Text13, { color: theme.dim, wrap: "truncate-end", children: [
        " ",
        "\xB7 ",
        filesLabel(files),
        " \xB7 ",
        formatBytes(total),
        ticked.length ? ` \xB7 ${ticked.length} selected` : ""
      ] })
    ] }),
    /* @__PURE__ */ jsx13(Text13, { children: " " }),
    /* @__PURE__ */ jsx13(Box13, { flexDirection: "column", height: listRows, paddingX: 1, overflow: "hidden", children: friends.length === 0 ? /* @__PURE__ */ jsxs13(Fragment5, { children: [
      /* @__PURE__ */ jsxs13(Text13, { color: theme.dim, wrap: "wrap", children: [
        icons.pending,
        " No friends online right now",
        offline ? ` (${plural(offline, "friend")} offline)` : "",
        ". They show up here as soon as they connect."
      ] }),
      /* @__PURE__ */ jsx13(Text13, { color: theme.faint, wrap: "wrap", children: "New friends: press esc, pick someone under Nearby, or press a and enter their IP." })
    ] }) : visible.map((f, i) => {
      const active = start2 + i === sel;
      const on = chosen.has(f.id);
      return /* @__PURE__ */ jsxs13(Box13, { children: [
        /* @__PURE__ */ jsx13(Text13, { color: theme.accent, children: active ? `${icons.pointer} ` : "  " }),
        /* @__PURE__ */ jsx13(Text13, { color: on ? theme.success : theme.dim, children: on ? "[x] " : "[ ] " }),
        /* @__PURE__ */ jsxs13(Text13, { color: theme.success, children: [
          icons.online,
          " "
        ] }),
        /* @__PURE__ */ jsx13(Text13, { bold: active, color: active ? theme.accent : void 0, wrap: "truncate-end", children: f.display }),
        f.trusted ? /* @__PURE__ */ jsxs13(Text13, { color: theme.warning, children: [
          " ",
          icons.star
        ] }) : null,
        f.away ? /* @__PURE__ */ jsx13(Text13, { color: theme.faint, children: " \xB7 away" }) : null
      ] }, f.id);
    }) }),
    /* @__PURE__ */ jsx13(Text13, { children: " " }),
    /* @__PURE__ */ jsx13(Box13, { paddingX: 1, children: /* @__PURE__ */ jsx13(Text13, { color: theme.dim, wrap: "truncate-end", children: waitingFor ? `Waiting for ${waitingFor} to come online \u2026` : ticked.length ? `enter sends to ${ticked.map((f) => f.display).join(", ")}` : friends[sel] ? `enter sends to ${friends[sel].display} \u2013 space ticks more` : "" }) }),
    /* @__PURE__ */ jsx13(Text13, { children: " " }),
    /* @__PURE__ */ jsx13(Footer, { hints: ["enter send", "space select", "a all", "\u2191\u2193 move", "f edit files", "esc cancel"], toast: store.toast, width })
  ] });
}

// src/ui/App.tsx
import { jsx as jsx14, jsxs as jsxs14 } from "react/jsx-runtime";
function Root({ paths, options, inbox }) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const [phase, setPhase] = useState9(() => loadConfig(paths) ? { name: "starting" } : { name: "onboarding" });
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
    return /* @__PURE__ */ jsx14(Onboarding, { paths, width: columns, onDone: () => setPhase({ name: "starting" }) });
  }
  if (phase.name === "starting") {
    return /* @__PURE__ */ jsx14(Box14, { paddingX: 2, paddingY: 1, children: /* @__PURE__ */ jsx14(Text14, { color: theme.dim, children: "Starting termdrop \u2026" }) });
  }
  if (phase.name === "error") {
    return /* @__PURE__ */ jsxs14(Box14, { paddingX: 2, paddingY: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsx14(Text14, { color: theme.error, bold: true, children: "termdrop could not start" }),
      /* @__PURE__ */ jsx14(Text14, { children: phase.message }),
      /* @__PURE__ */ jsx14(Text14, { color: theme.dim, children: "ctrl+c to quit" })
    ] });
  }
  return /* @__PURE__ */ jsx14(Main, { store: phase.store, width: columns, height, rows, quit, inbox });
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
    body = /* @__PURE__ */ jsx14(
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
    body = /* @__PURE__ */ jsx14(
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
    body = /* @__PURE__ */ jsx14(Panel, { text: panel, width, height: bodyHeight, onClose: () => setPanel(null) });
  } else {
    body = /* @__PURE__ */ jsx14(
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
    /* @__PURE__ */ jsx14(Header, { store, width }),
    body
  ] });
}

// src/cli.tsx
import { jsx as jsx15 } from "react/jsx-runtime";
var HELP = `termdrop \u2013 end-to-end encrypted file sharing with friends on your local network

Usage: termdrop [files\u2026] [--to <name>] [options]
       termdrop update   Install the latest version from GitHub

  files\u2026            Send these files (if termdrop is already open, they go to that window)
  --to <name>       Preselect this friend as the recipient
  --home <dir>      Data directory (default: ~/.termdrop, or $TERMDROP_HOME)
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
  const files = positionals.map((p) => path13.resolve(p));
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
    if (process.platform !== "win32") fs13.rmSync(paths.socket, { force: true });
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
    /* @__PURE__ */ jsx15(Root, { paths, options: { port, discovery: !values["no-discovery"], debug: values.debug }, inbox }),
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
