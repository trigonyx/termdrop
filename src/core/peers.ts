import type { Paths } from './paths.js';
import { readJson, writeJsonAtomic } from './storage.js';

/** A peer we exchanged files with who isn't (necessarily) a friend anymore. */
export interface KnownPeer {
  id: string;
  name: string;
  lastIp?: string;
  lastPort?: number;
  lastSeen?: number;
}

/** Small address book: names of former friends, so the transfer history can still name them. */
export class PeerBook {
  private peers = new Map<string, KnownPeer>();

  constructor(private readonly paths: Paths) {
    const list = readJson<KnownPeer[]>(paths.peers, []);
    for (const p of Array.isArray(list) ? list : []) {
      if (p && typeof p.id === 'string') this.peers.set(p.id, p);
    }
  }

  get(id: string): KnownPeer | undefined {
    return this.peers.get(id);
  }

  update(id: string, patch: Partial<KnownPeer>): void {
    const prev = this.peers.get(id) ?? { id, name: patch.name ?? 'Unknown' };
    const next = { ...prev, ...patch, id };
    if (JSON.stringify(prev) === JSON.stringify(next) && this.peers.has(id)) return;
    this.peers.set(id, next);
    writeJsonAtomic(this.paths.peers, [...this.peers.values()]);
  }
}
