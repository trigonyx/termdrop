import type { PickOption, PickOpts } from '../commands/registry.js';
import type { NoteKind } from '../core/store.js';

/** What the screens need from the app (prompts, commands, the send flow). */
export interface Actions {
  quit(): void;
  confirm(title: string): Promise<boolean>;
  prompt(title: string, opts?: { hint?: string; initial?: string }): Promise<string | null>;
  pick(title: string, options: PickOption[], multi: boolean, opts?: PickOpts): Promise<string[] | null>;
  /** Opens the file picker – empty, or with these paths (dropped, typed after /send …). */
  sendFiles(paths?: string[], opts?: { to?: string; recipients?: boolean }): void;
  runCommand(input: string, selectedId: string | null): Promise<void>;
  print(text: string, kind?: NoteKind): void;
}
