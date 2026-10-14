import type { Key } from 'ink';
import { useEffect, useState } from 'react';
import { registry } from '../../commands/builtin.js';
import type { Command } from '../../commands/registry.js';
import type { MenuItem } from 'termcore/ui/components/CommandMenu';
import type { EditorState } from 'termcore/ui/editor';

interface Options {
  editor: EditorState;
  setEditor(s: EditorState): void;
  onSubmit(value: string): void;
  onEscape(): void;
}

/** Suggestion menu below the input: "/" lists commands (enter runs if unambiguous). ↑↓ pick, tab completes. */
export function useCommandInput({ editor, setEditor, onSubmit, onEscape }: Options) {
  const [selected, setSelected] = useState(0);
  const match = /^\/(\S*)$/.exec(editor.value);
  const filter = match?.[1] ?? null;
  const commands: Command[] = filter !== null ? registry.suggest(filter) : [];
  const items: MenuItem[] = commands.map((c) => ({ key: c.name, label: `/${c.name} ${c.usage ?? ''}`.trimEnd(), description: c.description }));
  const sel = Math.min(selected, Math.max(0, items.length - 1));

  useEffect(() => setSelected(0), [filter]);

  const complete = (cmd: Command) => {
    const value = `/${cmd.name} `;
    setEditor({ value, cursor: value.length });
  };

  const onKey = (_input: string, key: Key): boolean => {
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
        complete(commands[sel]!);
        return true;
      }
      if (key.return && !key.meta) {
        // Only an exact match or a single suggestion is executed. Otherwise complete
        // first – "/s" must not unexpectedly trigger /solo.
        const exact = filter ? registry.find(filter) : undefined;
        const target = exact ?? (commands.length === 1 ? commands[0]! : null);
        if (!target || (target.minArgs ?? 0) > 0) complete(target ?? commands[sel]!);
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
