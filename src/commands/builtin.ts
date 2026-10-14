import net from 'node:net';
import path from 'node:path';
import { displayName } from '../core/contacts.js';
import { formatId } from '../core/identity.js';
import { DEFAULT_PORT } from '../core/network.js';
import { tildify } from '../core/paths.js';
import {
  compareVersions,
  fetchLatestVersion,
  installedVersion,
  installHint,
  installKind,
  requestRestart,
  runInstall,
  SOURCE_HINT,
  staleInstallHint,
} from '../core/update.js';
import { VERSION } from '../core/version.js';
import { showPath } from '../transfer/local.js';
import { expandHome, splitShellWords } from '../transfer/paste.js';
import { filesLabel, formatBytes } from '../transfer/units.js';
import { duration, shortTime } from '../ui/format.js';
import { CommandRegistry, type Command, type CommandContext } from './registry.js';

const STATE_LABEL: Record<string, string> = {
  accepted: 'friend',
  outgoing: 'request sent',
  incoming: 'wants to be friends',
  declined: 'declined your request',
  blocked: 'blocked',
};

/**
 * The friend a command is about: the one selected on the dashboard, or else picked from a
 * list. `filter` limits which friends qualify.
 */
async function friendOf(
  ctx: CommandContext,
  title: string,
  filter: (state: string, trusted: boolean) => boolean = () => true,
): Promise<string | null> {
  const sel = ctx.selectedId ? ctx.store.contacts.get(ctx.selectedId) : undefined;
  if (sel && filter(sel.state, sel.trusted === true)) return sel.id;
  const options = ctx.store.contacts
    .all()
    .filter((c) => filter(c.state, c.trusted === true))
    .map((c) => ({ id: c.id, label: displayName(c), hint: STATE_LABEL[c.state] }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (!options.length) throw new Error('No friend to choose from');
  const ids = await ctx.ui.pick(title, options, false);
  return ids?.[0] ?? null;
}

export function parseAddress(input: string): { host: string; port: number } {
  const m = /^\[?([^\]]+?)\]?(?::(\d{1,5}))?$/.exec(input.trim());
  if (!m) throw new Error(`Invalid address: ${input}`);
  const host = m[1]!;
  const port = m[2] ? Number(m[2]) : DEFAULT_PORT;
  if (port < 1 || port > 65535) throw new Error(`Invalid port: ${m[2]}`);
  if (!net.isIP(host) && !/^[a-z0-9.-]+$/i.test(host)) throw new Error(`Invalid address: ${input}`);
  return { host, port };
}

const RESULT_TEXT = { done: 'done', declined: 'declined', cancelled: 'cancelled', failed: 'failed', expired: 'expired' } as const;

export const builtinCommands: Command[] = [
  {
    name: 'help',
    aliases: ['?'],
    description: 'Show all commands and shortcuts',
    scope: 'global',
    run(ctx) {
      const cmds = registry.available();
      const width = Math.max(...cmds.map((c) => `/${c.name} ${c.usage ?? ''}`.length));
      const lines = cmds.map((c) => `\`${`/${c.name} ${c.usage ?? ''}`.trimEnd().padEnd(width)}\`  ${c.description}`);
      ctx.ui.print(
        [
          '### Commands',
          '',
          ...lines.map((l) => `- ${l}`),
          '',
          '**Keys:** `↑↓` select · `enter` send / accept · `x` decline · `t` trust · `a` add by IP · `r` rename · `d` remove · `tab` transfers · `/` command · `q` quit',
          '**Transfers** (`tab`): `c` cancel · `enter` open · `o` show in Finder',
          '**Sending:** drag files into the window, or run `termdrop <files>` in another terminal.',
        ].join('\n'),
      );
    },
  },
  {
    name: 'send',
    usage: '[paths…]',
    description: 'Send files (no paths: open the file picker)',
    scope: 'global',
    run(ctx, _args, rest) {
      // like a shell: "My\ File.pdf", 'quoted names', ~/…
      const words = splitShellWords(rest) ?? [];
      if (!words.length) return ctx.ui.sendFiles();
      ctx.ui.sendFiles(words.map((a) => path.resolve(expandHome(a))), { recipients: true });
    },
  },
  {
    name: 'me',
    aliases: ['id'],
    description: 'Show your name, ID and address',
    scope: 'global',
    run(ctx) {
      const me = ctx.store.me;
      const addr = me.ips.length ? me.ips.map((ip) => `\`${ip}:${me.port}\``).join(', ') : 'no network';
      ctx.ui.print(
        `### ${me.name}\n\n- **ID** \`${formatId(me.id, true)}\`\n- **Reachable at** ${addr}\n- **Files are saved to** \`${showPath(tildify(ctx.store.downloadDir()))}\``,
      );
    },
  },
  {
    name: 'name',
    usage: '<new name>',
    minArgs: 1,
    description: 'Change your display name',
    scope: 'global',
    run(ctx, _args, rest) {
      const name = ctx.store.setName(rest);
      ctx.ui.print(`You are now ${name}`, 'success');
    },
  },
  {
    name: 'add',
    usage: '<ip[:port]>',
    minArgs: 1,
    description: "Add a friend by IP (if they don't show up under Nearby)",
    scope: 'global',
    async run(ctx, args) {
      const { host, port } = parseAddress(args[0]!);
      ctx.ui.print(`Connecting to ${host}:${port} …`);
      await ctx.store.addByAddress(host, port);
    },
  },
  {
    name: 'rename',
    usage: '[nickname]',
    description: 'Your own nickname for the selected friend (empty = their own name)',
    scope: 'global',
    async run(ctx, _args, rest) {
      const id = await friendOf(ctx, 'Rename which friend?');
      if (!id) return;
      ctx.store.rename(id, rest);
      ctx.ui.print(rest ? `Now shown as ${ctx.store.friend(id)?.display}` : 'Nickname removed', 'success');
    },
  },
  {
    name: 'remove',
    description: 'Remove the selected friend',
    scope: 'global',
    async run(ctx) {
      const id = await friendOf(ctx, 'Remove which friend?');
      if (!id) return;
      const f = ctx.store.friend(id)!;
      if (await ctx.ui.confirm(`Remove ${f.display} as a friend?`)) ctx.store.removeFriend(id);
    },
  },
  {
    name: 'block',
    description: 'Block the selected friend',
    scope: 'global',
    async run(ctx) {
      const id = await friendOf(ctx, 'Block whom?', (s) => s !== 'blocked');
      if (!id) return;
      const f = ctx.store.friend(id)!;
      if (await ctx.ui.confirm(`Block ${f.display}?`)) ctx.store.block(id);
    },
  },
  {
    name: 'unblock',
    description: 'Unblock someone you blocked',
    scope: 'global',
    async run(ctx) {
      const id = await friendOf(ctx, 'Unblock whom?', (s) => s === 'blocked');
      if (id) ctx.store.unblock(id);
    },
  },
  {
    name: 'whois',
    aliases: ['info'],
    description: 'Friend details and safety code',
    scope: 'global',
    async run(ctx) {
      const id = await friendOf(ctx, 'Show whom?');
      if (!id) return;
      const f = ctx.store.friend(id)!;
      const code = ctx.store.safetyCodeWith(id);
      const lines = [
        `### ${f.display}${f.alias ? ` _(calls themselves ${f.name})_` : ''}`,
        '',
        `- **ID** \`${formatId(f.id, true)}\``,
        `- **Status** ${f.away ? 'away' : f.online ? 'online' : 'offline'} · ${STATE_LABEL[f.state] ?? f.state}${f.trusted ? ' · ★ trusted (files are accepted automatically)' : ''}`,
        `- **Address** ${f.lastIp ? `\`${f.lastIp}:${f.lastPort ?? '?'}\`` : 'unknown'}`,
        `- **Safety code** ${code ? `\`${code}\`` : 'not connected yet'}`,
        '',
        '_Compare the safety code in person. If it matches, nobody is sitting in the middle._',
      ];
      ctx.ui.print(lines.join('\n'));
    },
  },
  {
    name: 'trust',
    description: "Accept the selected friend's files automatically",
    scope: 'global',
    async run(ctx) {
      const id = await friendOf(ctx, 'Trust whom?', (s, t) => s === 'accepted' && !t);
      if (id) ctx.store.setTrusted(id, true);
    },
  },
  {
    name: 'untrust',
    description: "Ask again before accepting the selected friend's files",
    scope: 'global',
    async run(ctx) {
      const id = await friendOf(ctx, 'Stop trusting whom?', (s, t) => s === 'accepted' && t);
      if (id) ctx.store.setTrusted(id, false);
    },
  },
  {
    name: 'folder',
    aliases: ['downloads'],
    usage: '[path]',
    description: 'Show or change where received files are saved',
    scope: 'global',
    run(ctx, _args, rest) {
      const arg = rest.replace(/^(["'])(.*)\1$/, '$2').trim();
      if (!arg) {
        const free = ctx.store.freeSpace();
        ctx.ui.print(`Files are saved to ${showPath(tildify(ctx.store.downloadDir()))}${free !== null ? ` · ${formatBytes(free)} free` : ''}`);
        return;
      }
      const dir = ctx.store.setDownloadDir(expandHome(arg));
      ctx.ui.print(`Received files now go to ${showPath(tildify(dir))}`, 'success');
    },
  },
  {
    name: 'history',
    aliases: ['log'],
    description: 'All past transfers',
    scope: 'global',
    run(ctx) {
      const all = ctx.store.history.recent(200);
      const t = ctx.store.totals();
      const lines = [
        '### Transfers',
        '',
        `**Sent** ${formatBytes(t.sentBytes)} in ${t.sentFiles} files · **received** ${formatBytes(t.receivedBytes)} in ${t.receivedFiles} files`,
        '',
      ];
      if (!all.length) lines.push('_Nothing yet – drag a file into this window to send it._');
      for (const e of all) {
        const arrow = e.dir === 'out' ? '↑' : '↓';
        const where = e.saved?.length ? ` → \`${showPath(tildify(path.dirname(e.saved[0]!)))}\`` : '';
        lines.push(
          `- ${arrow} **${e.peerName}** ${showPath(filesLabel(e.files))} · ${formatBytes(e.total)} · ${RESULT_TEXT[e.result]}` +
            `${e.result === 'done' && e.ms ? ` in ${duration(e.ms)}` : e.reason ? ` (${e.reason})` : ''}${where} _${shortTime(e.ts)}_`,
        );
      }
      ctx.ui.print(lines.join('\n'));
    },
  },
  {
    name: 'notifications',
    aliases: ['notify'],
    usage: '[on|off]',
    description: 'Desktop notifications for incoming files while termdrop is in the background',
    scope: 'global',
    run(ctx, args) {
      const arg = args[0]?.toLowerCase();
      if (arg && arg !== 'on' && arg !== 'off') throw new Error('Usage: /notifications on|off');
      if (arg) ctx.store.setNotifications(arg === 'on');
      ctx.ui.print(`Notifications are ${ctx.store.notificationsEnabled() ? 'on' : 'off'}`, 'info');
    },
  },
  {
    name: 'update',
    description: 'Install the latest termdrop version from GitHub',
    scope: 'global',
    async run(ctx) {
      if (installKind() === 'source') return ctx.ui.print(SOURCE_HINT);
      ctx.ui.print('Checking for updates …');
      const latest = await fetchLatestVersion();
      if (!latest) throw new Error("Couldn't reach GitHub – are you online?");
      if (compareVersions(latest, VERSION) <= 0) {
        ctx.store.setUpdateAvailable(null);
        ctx.ui.print(`termdrop ${VERSION} is up to date`, 'success');
        return;
      }
      if (ctx.store.transfers.open().length && !(await ctx.ui.confirm('Transfers are running – updating restarts termdrop and stops them. Go on?'))) return;
      if (!(await ctx.ui.confirm(`Update termdrop ${VERSION} → ${latest}?`))) return;
      ctx.ui.print(`Installing termdrop ${latest} … (this can take a minute)`);
      const res = await runInstall({ inherit: false, version: latest });
      if (!res.ok) {
        const tail = res.output.trim().split('\n').slice(-6).join('\n');
        const hint = installHint(res.output);
        throw new Error(hint ?? `npm reported:\n${tail}`);
      }
      // don't claim success before the new version is really there
      const installed = await installedVersion();
      if (installed && compareVersions(installed, latest) < 0) throw new Error(staleInstallHint(installed));
      ctx.store.setUpdateAvailable(null);
      if (await ctx.ui.confirm(`Updated to ${latest}. Restart termdrop now?`)) {
        requestRestart();
        ctx.ui.quit();
      } else {
        ctx.ui.print(`Updated – restart termdrop to use ${latest}`, 'success');
      }
    },
  },
  {
    name: 'quit',
    aliases: ['exit', 'q'],
    description: 'Quit termdrop',
    scope: 'global',
    async run(ctx) {
      if (ctx.store.transfers.open().length && !(await ctx.ui.confirm('Transfers are still running – quit and stop them?'))) return;
      ctx.ui.quit();
    },
  },
];

export const registry = new CommandRegistry(builtinCommands);
