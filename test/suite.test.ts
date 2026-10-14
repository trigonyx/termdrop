import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Hub } from 'termcore/store/hub';
import { resolvePaths } from '../src/core/paths.js';
import { AppStore } from '../src/core/store.js';
import { inspectPaths } from '../src/transfer/local.js';
import { tmpDir, until } from './helpers.js';

/** Real data of termchat 1.4.0, keyrace 1.1.0 and termdrop 1.0.0 (see termcore/test/fixtures/legacy). */
const FIXTURES = path.resolve(import.meta.dirname, '../../termcore/test/fixtures/legacy');
const OLD = {
  alice: { termchat: 'NKISSPLQRD3ILGYERG7P', termdrop: 'MIH6CMJTWLI6TQ4PLJI6' },
  bob: { termchat: 'DFUXKKL7GTQ4QMMLE3NA', termdrop: 'NZUO32UP3W375QSZTMYO' },
};

const stores: AppStore[] = [];
afterEach(async () => {
  await Promise.all(stores.splice(0).map((s) => s.stop()));
});

/** A person's home with their old termchat and termdrop data, started like the app does. */
async function legacy(who: 'alice' | 'bob', opts: { notify?: (t: string, b: string) => void } = {}): Promise<AppStore> {
  const home = tmpDir(who);
  for (const app of ['termchat', 'termdrop']) fs.cpSync(path.join(FIXTURES, who, app), path.join(home, app), { recursive: true });
  const paths = resolvePaths(home, {});
  expect(Hub.prepare(paths.hub).migrated).toBe(true);
  const s = new AppStore({ paths, port: 0, discovery: false, dialIntervalMs: 100, ...opts });
  s.setDownloadDir(tmpDir(`${who}-dl`));
  await s.start();
  stores.push(s);
  return s;
}

describe('termdrop 2.0 with the data of 1.0', { timeout: 30_000 }, () => {
  it('migrates, finds the friend under the new id and keeps trust and history', async () => {
    const alice = await legacy('alice');
    const bob = await legacy('bob');
    // the shared id is termchat's; termdrop's own data still knows Bob's old termdrop id
    expect(alice.identity.id).toBe(OLD.alice.termchat);
    expect(alice.history.all()[0]!.peerId).toBe(OLD.bob.termdrop);
    expect(alice.friend(OLD.bob.termdrop)).toMatchObject({ state: 'accepted', trusted: true });

    await alice.addByAddress('127.0.0.1', bob.network.port);
    await until(() => !alice.contacts.get(OLD.bob.termdrop) && !bob.contacts.get(OLD.alice.termdrop), 6000, 'links applied');
    // one Bob: termchat's nickname, termdrop's trust
    const b = alice.friend(OLD.bob.termchat)!;
    expect(b).toMatchObject({ state: 'accepted', alias: 'Bobby', trusted: true, online: true });
    expect(alice.dashboard().friends.filter((f) => f.state === 'accepted').map((f) => f.display)).toEqual(['Bobby']);
    // the history moved with him, on disk too
    expect(alice.history.all().map((e) => e.peerId)).toEqual([OLD.bob.termchat]);
    expect(fs.readFileSync(alice.paths.transfers, 'utf8')).toContain(OLD.bob.termchat);
    expect(bob.history.all().map((e) => e.peerId)).toEqual([OLD.alice.termchat]);

    // and trust still works: Bob's files are accepted without asking
    const src = tmpDir('src');
    fs.writeFileSync(path.join(src, 'hi.txt'), 'hello');
    const [t] = bob.send(inspectPaths([path.join(src, 'hi.txt')]).files, [alice.identity.id]);
    await until(() => alice.transfers.get(t!.xid)?.status === 'done', 6000, 'auto-accepted');
  });

  it('do not disturb: offers wait, even from trusted friends, and nothing pops up', async () => {
    const notes: string[] = [];
    const alice = await legacy('alice', { notify: (_t, b) => notes.push(b) });
    const bob = await legacy('bob');
    await alice.addByAddress('127.0.0.1', bob.network.port);
    await until(() => alice.friend(OLD.bob.termchat)?.online === true && alice.friend(OLD.bob.termchat)?.trusted === true, 6000, 'friends');
    alice.hub.setProfile({ status: 'dnd' });
    await until(() => bob.friend(OLD.alice.termchat)?.status === 'dnd', 4000, 'status');
    alice.setFocused(false);

    const src = tmpDir('src');
    fs.writeFileSync(path.join(src, 'later.txt'), 'later');
    const [t] = bob.send(inspectPaths([path.join(src, 'later.txt')]).files, [alice.identity.id]);
    await until(() => alice.dashboard().requests.some((r) => r.kind === 'offer'), 4000, 'offer parked');
    expect(alice.transfers.get(t!.xid)?.status).toBe('offered');
    expect(alice.toast?.text ?? '').not.toContain('wants to send');
    expect(notes).toEqual([]);
    // back to available: it's still there, waiting for an answer
    alice.hub.setProfile({ status: 'available' });
    alice.transfers.accept(t!.xid);
    await until(() => alice.transfers.get(t!.xid)?.status === 'done', 6000, 'accepted later');
  });
});
