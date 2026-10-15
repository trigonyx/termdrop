import { useCommandInput as useCoreCommandInput } from 'termcore/ui/commands/useCommandInput';
import type { EditorState } from 'termcore/ui/editor';
import { registry } from '../../commands/builtin.js';

/** termcore's suggestion menu for the command input, with this app's commands. */
export function useCommandInput(opts: { editor: EditorState; setEditor(s: EditorState): void; onSubmit(value: string): void; onEscape(): void }) {
  return useCoreCommandInput({ registry, ...opts });
}
