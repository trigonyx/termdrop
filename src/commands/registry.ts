import { CommandRegistry as Registry, type Command as BaseCommand } from 'termcore/ui/commands/registry';
import type { PickOption, PickOpts } from 'termcore/ui/components/Dialog';
import type { AppStore, NoteKind } from '../core/store.js';

export type { PickOption, PickOpts };

export interface CommandUI {
  /** Output: a toast for one line, a panel for more. */
  print(text: string, kind?: NoteKind): void;
  quit(): void;
  confirm(question: string): Promise<boolean>;
  /** Choose from a list; `null` = cancelled. */
  pick(title: string, options: PickOption[], multi: boolean, opts?: PickOpts): Promise<string[] | null>;
  /** Opens the send flow (file picker, or straight to the recipients with `recipients`). */
  sendFiles(paths?: string[], opts?: { to?: string; recipients?: boolean }): void;
}

export interface CommandContext {
  store: AppStore;
  /** the friend selected on the dashboard, if any */
  selectedId: string | null;
  ui: CommandUI;
}

/** termdrop only has the dashboard, so every command is global. */
export type Command = BaseCommand<CommandContext>;

export class CommandRegistry extends Registry<CommandContext> {}
