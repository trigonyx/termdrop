import type { Paths } from './paths.js';
import type { ContactState } from './protocol.js';
import { readJson, writeJsonAtomic } from './storage.js';

export interface Contact {
  id: string;
  publicKey: string;
  /** Name the peer chose for themselves. */
  name: string;
  /** Your own nickname for this friend (r / /rename). */
  alias?: string;
  state: ContactState;
  /** Offers from trusted friends are accepted automatically (t / /trust). */
  trusted?: boolean;
  lastIp?: string;
  lastPort?: number;
  lastSeen?: number;
  lastActivity: number;
  createdAt: number;
}

export function displayName(c: Pick<Contact, 'name' | 'alias'>): string {
  return c.alias || c.name;
}

export class ContactBook {
  private contacts = new Map<string, Contact>();

  constructor(private readonly paths: Paths) {
    const list = readJson<Contact[]>(paths.contacts, []);
    for (const c of Array.isArray(list) ? list : []) {
      if (c && typeof c.id === 'string') this.contacts.set(c.id, c);
    }
  }

  get(id: string): Contact | undefined {
    return this.contacts.get(id);
  }

  all(): Contact[] {
    return [...this.contacts.values()];
  }

  /** Creates or updates a contact and saves immediately. */
  upsert(id: string, patch: Partial<Contact> & Pick<Contact, 'publicKey' | 'name' | 'state'>): Contact;
  upsert(id: string, patch: Partial<Contact>): Contact | undefined;
  upsert(id: string, patch: Partial<Contact>): Contact | undefined {
    const prev = this.contacts.get(id);
    if (!prev && (patch.publicKey === undefined || !patch.name || !patch.state)) return undefined;
    const now = Date.now();
    const base: Contact = prev ?? ({ lastActivity: now, createdAt: now } as Contact);
    const next: Contact = { ...base, ...patch, id };
    this.contacts.set(id, next);
    this.save();
    return next;
  }

  remove(id: string): void {
    if (this.contacts.delete(id)) this.save();
  }

  private save(): void {
    writeJsonAtomic(this.paths.contacts, this.all());
  }
}
