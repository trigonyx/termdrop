import fs from 'node:fs';
import path from 'node:path';
import { render } from 'ink-testing-library';
import { createElement } from 'react';
import stringWidth from 'string-width';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAddress, registry } from '../src/commands/builtin.js';
import { parseCommand, tokenize } from 'termcore/ui/commands/parse';
import { resolvePaths } from '../src/core/paths.js';
import { AppStore } from '../src/core/store.js';
import { VERSION } from '../src/core/version.js';
import type { Transfer } from '../src/transfer/session.js';
import type { Actions } from '../src/ui/actions.js';
import { Main } from '../src/ui/App.js';
import { LOGO, LOGO_SMALL } from '../src/ui/components/Banner.js';
import { Header } from 'termcore/ui/components/Header';
import { completePath } from '../src/ui/complete.js';
import { cleanPaste, edit, layoutEditor } from 'termcore/ui/editor';
import { emitPaste, extractMouse } from 'termcore/ui/mouse';
import { Dashboard } from '../src/ui/screens/Dashboard.js';
import { FilePicker } from '../src/ui/screens/FilePicker.js';
import { RecipientPicker } from '../src/ui/screens/RecipientPicker.js';
import { renderText } from 'termcore/ui/text';
import { tmpDir } from './helpers.js';

const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');
const frame = (r: { lastFrame(): string | undefined }) => strip(r.lastFrame() ?? '');
const tick = (ms = 30) => new Promise((res) => setTimeout(res, ms));

const noop = async () => {};
const actions: Actions = {
  quit: () => {},
  confirm: async () => false,
  prompt: async () => null,
  pick: async () => null,
  sendFiles: () => {},
  runCommand: noop,
  print: () => {},
};

const stores: AppStore[] = [];
function store(name = 'Alice'): AppStore {
  const paths = resolvePaths(tmpDir('ui'));
  AppStore.createProfile(paths, name);
  const s = new AppStore({ paths, port: 0, discovery: false, freeSpace: () => 500e9 });
  s.setDownloadDir(tmpDir('ui-dl'));
  stores.push(s);
  return s;
}
afterEach(async () => {
  await Promise.all(stores.splice(0).map((s) => s.stop()));
});

const BOB = 'BOBBOBBOBBOBBOBBOBBO';
const CARL = 'CARLCARLCARLCARLCARL';

/** Pretends Bob and Carl are connected (no sockets needed for rendering). */
function online(s: AppStore, ...ids: string[]): void {
  const fake = { isOpen: true, send: () => true, close: () => {}, initiator: true, remoteAddress: '127.0.0.1', remotePort: 1 };
  for (const id of ids) s.network.sessions.set(id, fake as never);
}

function dashProps(s: AppStore, patch: Record<string, unknown> = {}) {
  return {
    store: s,
    width: 100,
    height: 34,
    rows: 37,
    actions,
    dialog: null,
    selectedKey: null,
    onSelect: () => {},
    history: [],
    focus: 'list' as const,
    onFocus: () => {},
    transferKey: null,
    onTransferKey: () => {},
    ...patch,
  };
}

/** A running upload to Bob, put straight into the manager (the bytes don't matter here). */
function runningTransfer(s: AppStore): Transfer {
  const t: Transfer = {
    xid: 'runningxid0001',
    dir: 'out',
    peerId: BOB,
    peerName: 'Bob',
    files: [{ name: 'holiday.mov', size: 48_200_000 }],
    total: 48_200_000,
    status: 'active',
    createdAt: Date.now() - 5000,
    startedAt: Date.now() - 4000,
    bytes: 30_000_000,
    fileIndex: 0,
    speed: 12_400_000,
  };
  (s.transfers as unknown as { transfers: Map<string, Transfer> }).transfers.set(t.xid, t);
  return t;
}

describe('command parser', () => {
  it('splits commands and arguments', () => {
    expect(parseCommand('/name Max Power')).toEqual({ name: 'name', args: ['Max', 'Power'], rest: 'Max Power' });
    expect(parseCommand('not a command')).toBeNull();
    for (const input of ['/"', "/add 'x", '/ / /', '/\u0000']) expect(() => parseCommand(input)).not.toThrow();
    expect(tokenize('a "b c')).toEqual(['a', 'b c']);
  });

  it('knows all commands', () => {
    for (const name of ['help', 'send', 'me', 'name', 'add', 'remove', 'block', 'unblock', 'whois', 'trust', 'untrust', 'folder', 'history', 'notifications', 'update', 'quit']) {
      expect(registry.find(name)?.name).toBe(name);
    }
    expect(registry.find('s')).toBeUndefined();
  });

  it('validates addresses (default port 5054)', () => {
    expect(parseAddress('192.168.1.20')).toEqual({ host: '192.168.1.20', port: 5054 });
    expect(parseAddress('10.0.0.1:6000')).toEqual({ host: '10.0.0.1', port: 6000 });
    expect(() => parseAddress('rm -rf')).toThrow();
  });

  it('/folder changes where files go, /trust needs a friend', async () => {
    const s = store();
    const dir = path.join(tmpDir('folder'), 'new place');
    const printed: string[] = [];
    const ui = { print: (t: string) => void printed.push(t), quit: () => {}, confirm: async () => true, pick: async () => null, sendFiles: () => {} };
    await registry.execute(`/folder ${dir}`, { store: s, selectedId: null, ui });
    expect(s.downloadDir()).toBe(dir);
    expect(fs.statSync(dir).isDirectory()).toBe(true);
    await registry.execute('/trust', { store: s, selectedId: null, ui });
    expect(printed.at(-1)).toContain('No friend to choose from');
    s.contacts.upsert(BOB, { publicKey: '', name: 'Bob', state: 'accepted' });
    await registry.execute('/trust', { store: s, selectedId: BOB, ui });
    expect(s.contacts.get(BOB)?.trusted).toBe(true);
  });
});

describe('editor, text, paste plumbing and completion', () => {
  it('edits text, treating an emoji as one character', () => {
    let st = edit.insert({ value: '', cursor: 0 }, 'hi 👋🏽');
    st = edit.backspace(st);
    expect(st.value).toBe('hi ');
    expect(layoutEditor({ value: 'abcdef', cursor: 6 }, 3).map((l) => l.text)).toEqual(['abc', 'def', '']);
    expect(cleanPaste('a\r\nb\u001b[201~')).toBe('a\nb');
    expect(renderText('### Title\n**bold** and `code`\n- one', 40).map(strip)).toEqual(['Title', 'bold and code', '• one']);
  });

  it('bracketed pastes are pulled out of the input stream, even across chunks', () => {
    expect(extractMouse('a\u001b[200~/tmp/x\\ y.txt \u001b[201~b')).toEqual({ text: 'ab', events: [], pending: '', pastes: ['/tmp/x\\ y.txt '] });
    const first = extractMouse('\u001b[200~/Users/al');
    expect(first.pending).toBe('\u001b[200~/Users/al');
    expect(extractMouse('ice/a.txt\u001b[201~', first.pending).pastes).toEqual(['/Users/alice/a.txt']);
    // a split start marker is held back, not typed
    const split = extractMouse('\u001b[20');
    expect(split).toEqual({ text: '', events: [], pending: '\u001b[20' });
    expect(extractMouse('0~x\u001b[201~', split.pending).pastes).toEqual(['x']);
    expect(emitPaste('nobody listens')).toBe(false);
  });

  it('completes paths with tab', () => {
    const dir = tmpDir('complete');
    fs.writeFileSync(path.join(dir, 'report-2024.pdf'), '');
    fs.writeFileSync(path.join(dir, 'report-2025.pdf'), '');
    fs.mkdirSync(path.join(dir, 'Photos'));
    fs.writeFileSync(path.join(dir, '.hidden'), '');
    expect(completePath('Ph', dir, dir, 'linux')).toEqual({ value: 'Photos/', candidates: [] });
    expect(completePath('rep', dir, dir, 'linux')).toEqual({ value: 'report-202', candidates: ['report-2024.pdf', 'report-2025.pdf'] });
    expect(completePath('report-2025', dir, dir, 'linux').value).toBe('report-2025.pdf');
    expect(completePath('ph', dir, dir, 'darwin').value).toBe('Photos/');
    expect(completePath('ph', dir, dir, 'linux').value).toBe('ph');
    expect(completePath('.h', dir, dir, 'linux').value).toBe('.hidden');
    expect(completePath('', dir, dir, 'linux').candidates).not.toContain('.hidden');
    expect(completePath('~/Ph', '/', dir, 'linux').value).toBe('~/Photos/');
    expect(completePath(`${dir}/Photos/nothing`, '/', dir, 'linux').value).toBe(`${dir}/Photos/nothing`);
  });
});

describe('logo', () => {
  it('all rows of the logos have the same width', () => {
    for (const block of [LOGO, LOGO_SMALL]) expect(new Set(block.map((l) => stringWidth(l))).size).toBe(1);
    expect(stringWidth(LOGO[0]!)).toBeLessThanOrEqual(72);
  });
});

describe('screens', () => {
  it('header shows the app version, name and friends online', () => {
    const s = store('Max');
    for (const width of [100, 50]) {
      const r = render(createElement(Header, { app: 'termdrop', version: VERSION, me: s.me, address: '10.0.0.1:5054', online: s.onlineCount(), width }));
      expect(frame(r)).toContain(`termdrop  v${VERSION}`);
      expect(frame(r)).toContain('Max');
      r.unmount();
    }
  });

  it('dashboard: banner, sections and the transfers panel', () => {
    const s = store();
    s.contacts.upsert(BOB, { publicKey: '', name: 'Bob', state: 'accepted', trusted: true });
    s.contacts.upsert(CARL, { publicKey: '', name: 'Carl', state: 'incoming' });
    for (const [width, rows] of [[100, 36], [64, 30]] as const) {
      const r = render(createElement(Dashboard, dashProps(s, { width, rows, height: rows - 3 })));
      const out = frame(r);
      expect(out).toContain('Send files');
      expect(out).toContain('or drag files into this window');
      expect(out).toContain('REQUESTS · 1');
      expect(out).toMatch(/Carl\s+wants to be friends/);
      expect(out).toContain('FRIENDS');
      expect(out).toMatch(/Bob ★\s+offline/);
      expect(out).toContain('TRANSFERS');
      expect(out).toContain('Nothing running right now.');
      // the big logo only where it fits, a compact one otherwise
      expect(out.includes('╚═╝')).toBe(width >= 80);
      expect(out.split('\n').every((l) => stringWidth(l) <= width)).toBe(true);
      r.unmount();
    }
  });

  it('dashboard: an incoming offer is a request, and its details show while selected', async () => {
    const s = store();
    s.contacts.upsert(BOB, { publicKey: '', name: 'Bob', state: 'accepted' });
    online(s, BOB);
    s.transfers.onWire(BOB, {
      t: 'offer',
      xid: 'offerxid000001',
      files: [{ name: 'a.jpg', size: 2_100_000 }, { name: 'b.pdf', size: 46_100_000 }, { name: 'c.txt', size: 1000 }],
      total: 48_201_000,
    });
    let key: string | null = null;
    const r = render(createElement(Dashboard, dashProps(s, { selectedKey: key, onSelect: (k: string | null) => void (key = k) })));
    const out = frame(r);
    expect(out).toMatch(/◆ Bob\s+wants to send 3 files · 48.2 MB/);
    // selected by default (requests first) → the panel shows the offer
    expect(out).toContain('Bob wants to send you');
    expect(out).toMatch(/a\.jpg\s+2\.1 MB/);
    expect(out).toContain('3 files · 48.2 MB');
    expect(out).toContain('enter accept · x decline');
    r.stdin.write('x');
    await tick();
    expect(s.transfers.incomingOffers()).toHaveLength(0);
    r.unmount();
  });

  it('dashboard: a running transfer with bar, percent, speed and time left', () => {
    const s = store();
    s.contacts.upsert(BOB, { publicKey: '', name: 'Bob', state: 'accepted' });
    runningTransfer(s);
    const r = render(createElement(Dashboard, dashProps(s, { focus: 'transfers', transferKey: 'runningxid0001' })));
    const out = frame(r);
    expect(out).toContain('TRANSFERS · 1');
    expect(out).toMatch(/❯ ↑ Bob\s+holiday\.mov/);
    expect(out).toMatch(/━+─+\s+62% 12\.4 MB\/s · <10s/);
    expect(out).toContain('c cancel');
    r.unmount();
  });

  it('dashboard: files dropped onto the window open the file picker', async () => {
    const s = store();
    const dir = tmpDir('drop');
    const file = path.join(dir, 'My File.pdf');
    fs.writeFileSync(file, 'x');
    const opened: string[][] = [];
    const r = render(createElement(Dashboard, dashProps(s, { actions: { ...actions, sendFiles: (p?: string[]) => void opened.push(p ?? []) } })));
    await tick();
    // with bracketed paste (Terminal.app / iTerm2 escape the space)
    expect(emitPaste(`${file.replace(/ /g, '\\ ')} `)).toBe(true);
    // and without: one long "keypress"
    r.stdin.write(`'${file}' `);
    await tick();
    expect(opened).toEqual([[file], [file]]);
    // ordinary keys are still keys
    r.stdin.write('j');
    await tick();
    expect(opened).toHaveLength(2);
    r.unmount();
  });

  it('file picker: sizes, total, removing with d, folders refused', async () => {
    const s = store();
    const dir = tmpDir('picker');
    const a = path.join(dir, 'foto.jpg');
    const b = path.join(dir, 'bericht.pdf');
    fs.writeFileSync(a, Buffer.alloc(2_100_000));
    fs.writeFileSync(b, Buffer.alloc(46_100_000));
    fs.mkdirSync(path.join(dir, 'Album'));
    let state = { files: s.requestSend([a, b, path.join(dir, 'Album')]).files, notices: ["Album: folders aren't supported yet – zip it first"] };
    let next = 0;
    const props = () => ({
      store: s,
      width: 90,
      height: 22,
      files: state.files,
      notices: state.notices,
      onChange: (files: typeof state.files, notices: string[]) => void (state = { files, notices }),
      onNext: () => void next++,
      onCancel: () => {},
      cwd: dir,
    });
    const r = render(createElement(FilePicker, props()));
    let out = frame(r);
    expect(out).toContain('SEND FILES · 2 files · 48.2 MB');
    expect(out).toMatch(/❯ ▪ foto\.jpg\s+2\.1 MB/);
    expect(out).toMatch(/▪ bericht\.pdf\s+46\.1 MB/);
    expect(out).toContain("✗ Album: folders aren't supported yet – zip it first");
    expect(out).toContain('enter next: choose friends');
    await tick();
    r.stdin.write('d');
    await tick();
    expect(state.files.map((f) => f.name)).toEqual(['bericht.pdf']);
    r.rerender(createElement(FilePicker, props()));
    out = frame(r);
    expect(out).toContain('SEND FILES · 1 file · 46.1 MB');
    r.stdin.write('\r');
    await tick();
    expect(next).toBe(1);
    r.unmount();
  });

  it('recipient picker: online friends to tick, --to preselected', async () => {
    const s = store();
    s.contacts.upsert(BOB, { publicKey: '', name: 'Bob', state: 'accepted' });
    s.contacts.upsert(CARL, { publicKey: '', name: 'Carl', state: 'accepted' });
    s.contacts.upsert('DANADANADANADANADANA', { publicKey: '', name: 'Dana', state: 'accepted' });
    online(s, BOB, CARL);
    const files = [{ path: '/tmp/x.bin', name: 'x.bin', size: 1000 }];
    let sent: string[] | null = null;
    const r = render(
      createElement(RecipientPicker, { store: s, width: 80, height: 20, files, to: 'carl', onSend: (ids: string[]) => void (sent = ids), onEditFiles: () => {}, onCancel: () => {} }),
    );
    await tick();
    const out = frame(r);
    expect(out).toContain('SEND TO · x.bin · 1.0 kB');
    expect(out).toMatch(/\[ \] ● Bob/);
    expect(out).toMatch(/❯ \[x\] ● Carl/);
    expect(out).not.toContain('Dana');
    expect(out).toContain('enter sends to Carl');
    r.stdin.write('\u001b[A'); // ↑ to Bob
    await tick();
    r.stdin.write(' ');
    await tick();
    r.stdin.write('\r');
    await tick();
    expect(sent).toEqual([BOB, CARL]);
    r.unmount();
  });

  it('the whole flow: files from the shell go straight to the recipients, enter offers them', async () => {
    const s = store();
    s.contacts.upsert(BOB, { publicKey: '', name: 'Bob', state: 'accepted' });
    online(s, BOB);
    const file = path.join(tmpDir('flow'), 'notes.txt');
    fs.writeFileSync(file, 'hello');
    const r = render(createElement(Main, { store: s, width: 100, height: 36, rows: 37, quit: () => {} }));
    await tick();
    s.requestSend([file], 'Bob', 'shell');
    await tick();
    expect(frame(r)).toContain('SEND TO · notes.txt');
    expect(frame(r)).toMatch(/\[x\] ● Bob/);
    r.stdin.write('\r');
    await tick();
    const out = frame(r);
    expect(out).toContain('Offered notes.txt to Bob');
    expect(out).toMatch(/↑ Bob\s+notes\.txt\s+◷ waiting/);
    r.unmount();
  });
});
