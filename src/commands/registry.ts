import type { AppStore, NoteKind } from '../core/store.js';
import { parseCommand } from './parse.js';

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

export interface PickOption {
  id: string;
  label: string;
  hint?: string;
}

export interface PickOpts {
  /** multi: enter with nothing ticked returns [] instead of the highlighted entry */
  emptyOk?: boolean;
  /** ids ticked from the start */
  preselect?: string[];
  /** extra hint in the help line */
  emptyHint?: string;
}

export interface CommandContext {
  store: AppStore;
  /** the friend selected on the dashboard, if any */
  selectedId: string | null;
  ui: CommandUI;
}

export interface Command {
  name: string;
  aliases?: string[];
  usage?: string;
  description: string;
  /** termdrop only has the dashboard, so every command is global (kept for a later merge with termchat) */
  scope: 'global';
  minArgs?: number;
  run(ctx: CommandContext, args: string[], rest: string): void | Promise<void>;
}

export class CommandRegistry {
  constructor(readonly commands: Command[]) {}

  find(name: string): Command | undefined {
    const n = name.toLowerCase();
    return this.commands.find((c) => c.name === n || c.aliases?.includes(n));
  }

  available(): Command[] {
    return this.commands;
  }

  /** Commands filtered by prefix. */
  suggest(prefix: string): Command[] {
    const p = prefix.toLowerCase();
    return this.commands.filter((c) => c.name.startsWith(p) || c.aliases?.some((a) => a.startsWith(p)));
  }

  /**
   * Runs an input as a command. Returns `false` if it isn't a command.
   * Errors always end up as a message in the UI – never as a crash.
   */
  async execute(input: string, ctx: CommandContext): Promise<boolean> {
    const parsed = parseCommand(input);
    if (!parsed) return false;
    const { ui } = ctx;

    if (!parsed.name) {
      ui.print('Type a command, e.g. /help', 'error');
      return true;
    }
    const cmd = this.find(parsed.name);
    if (!cmd) {
      ui.print(`Unknown command /${parsed.name} – all commands: /help`, 'error');
      return true;
    }
    if (parsed.args.length < (cmd.minArgs ?? 0)) {
      ui.print(`Usage: /${cmd.name} ${cmd.usage ?? ''}`.trim(), 'error');
      return true;
    }
    try {
      await cmd.run(ctx, parsed.args, parsed.rest);
    } catch (err) {
      ui.print(`/${cmd.name} failed: ${(err as Error).message}`, 'error');
    }
    return true;
  }
}
