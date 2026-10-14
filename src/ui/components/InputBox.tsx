import { Box, Text, useInput, type Key } from 'ink';
import { useRef } from 'react';
import { cleanPaste, edit, layoutEditor, type EditorState } from '../editor.js';
import { usePaste } from '../mouse.js';
import { icons, theme } from '../theme.js';

export interface InputBoxProps {
  state: EditorState;
  onChange(state: EditorState): void;
  onSubmit(value: string): void;
  isActive: boolean;
  width: number;
  placeholder?: string;
  maxLines?: number;
  /** Earlier inputs (oldest first) for ↑/↓. */
  history?: string[];
  /** Called before default handling; `true` = key was consumed. */
  onKey?(input: string, key: Key): boolean;
  singleLine?: boolean;
  borderColor?: string;
  /** Longest allowed input (characters). */
  maxLength?: number;
  /** Sees a (bracketed) paste first; `true` = handled, don't insert it. */
  onPaste?(text: string): boolean;
}

/** Box height including border – for the screens' layout math. */
export function inputBoxHeight(state: EditorState, width: number, maxLines = 8): number {
  return Math.min(layoutEditor(state, contentWidth(width)).length, maxLines) + 2;
}

const contentWidth = (width: number) => Math.max(4, width - 2 /* border */ - 2 /* Padding */ - 2 /* Prompt */);

export function InputBox({
  state,
  onChange,
  onSubmit,
  isActive,
  width,
  placeholder,
  maxLines = 8,
  history = [],
  onKey,
  singleLine = false,
  borderColor = theme.border,
  maxLength,
  onPaste,
}: InputBoxProps) {
  const histIndex = useRef<number | null>(null);
  const draft = useRef('');
  // Keystrokes can arrive faster than React re-renders – so always work with the
  // most recently set state, not the one from the last render.
  const latest = useRef(state);
  latest.current = state;
  const change = (next: EditorState) => {
    latest.current = next;
    onChange(next);
  };

  const recall = (dir: -1 | 1): boolean => {
    if (!history.length) return false;
    let idx = histIndex.current;
    if (idx === null) {
      if (dir === 1) return false;
      draft.current = latest.current.value;
      idx = history.length;
    }
    idx += dir;
    if (idx < 0) return true;
    if (idx >= history.length) {
      histIndex.current = null;
      change({ value: draft.current, cursor: draft.current.length });
      return true;
    }
    histIndex.current = idx;
    const v = history[idx]!;
    change({ value: v, cursor: v.length });
    return true;
  };

  const insertText = (raw: string) => {
    let text = cleanPaste(raw);
    if (singleLine) text = text.replace(/\n/g, ' ');
    const state = latest.current;
    if (!text) return;
    if (maxLength !== undefined && [...state.value].length + [...text].length > maxLength) return;
    histIndex.current = null;
    change(edit.insert(state, text));
  };

  usePaste((text) => {
    if (!onPaste?.(text)) insertText(text);
    return true;
  }, isActive);

  useInput(
    (input, key) => {
      if (onKey?.(input, key)) return;
      if (key.ctrl && input === 'c') return; // handled globally

      const state = latest.current;
      const set = (next: EditorState) => {
        histIndex.current = null;
        change(next);
      };

      if (key.return) {
        // alt+enter or "\" + enter → new line
        if (!singleLine && key.meta) return set(edit.insert(state, '\n'));
        if (!singleLine && state.value[state.cursor - 1] === '\\') {
          return set(edit.insert(edit.backspace(state), '\n'));
        }
        histIndex.current = null;
        onSubmit(state.value);
        return;
      }
      if (key.escape) return;
      if (key.tab) return;

      if ((key.backspace || key.delete) && key.meta) return set(edit.deleteWordBack(state));
      if (key.backspace || key.delete) return set(edit.backspace(state));
      if (key.leftArrow) return set(key.meta || key.ctrl ? edit.wordLeft(state) : edit.left(state));
      if (key.rightArrow) return set(key.meta || key.ctrl ? edit.wordRight(state) : edit.right(state));
      if (key.home) return set(edit.home(state));
      if (key.end) return set(edit.end(state));
      if (key.upArrow) {
        const moved = edit.vertical(state, -1);
        if (moved) return set(moved);
        recall(-1);
        return;
      }
      if (key.downArrow) {
        const moved = edit.vertical(state, 1);
        if (moved) return set(moved);
        recall(1);
        return;
      }
      if (key.pageUp || key.pageDown) return;

      if (key.ctrl) {
        switch (input) {
          case 'a':
            return set(edit.home(state));
          case 'e':
            return set(edit.end(state));
          case 'u':
            return set(edit.killToLineStart(state));
          case 'k':
            return set(edit.killToLineEnd(state));
          case 'w':
            return set(edit.deleteWordBack(state));
          case 'd':
            return set(edit.deleteForward(state));
          case 'j':
            return singleLine ? undefined : set(edit.insert(state, '\n'));
          default:
            return;
        }
      }
      if (key.meta) {
        if (input === 'b') return set(edit.wordLeft(state));
        if (input === 'f') return set(edit.wordRight(state));
        return;
      }

      // a paste without bracketed-paste support arrives as one long "key"
      if (input.length > 1 && onPaste?.(input)) return;
      insertText(input);
    },
    { isActive },
  );

  const cw = contentWidth(width);
  const lines = layoutEditor(state, cw);
  const cursorLine = Math.max(0, lines.findIndex((l) => l.cursor !== null));
  const start = Math.max(0, Math.min(cursorLine - maxLines + 1, lines.length - maxLines));
  const visible = lines.slice(start, start + maxLines);
  const empty = state.value.length === 0;

  return (
    <Box borderStyle="round" borderColor={borderColor} paddingX={1} width={width} flexDirection="column" flexShrink={0}>
      {visible.map((line, i) => {
        const prompt = start + i === 0 ? `${icons.pointer} ` : '  ';
        if (empty && i === 0) {
          return (
            <Text key={i} wrap="truncate-end">
              <Text color={theme.accent}>{prompt}</Text>
              {isActive ? <Text inverse> </Text> : null}
              <Text color={theme.faint}>{placeholder ?? ''}</Text>
            </Text>
          );
        }
        const cur = isActive ? line.cursor : null;
        if (cur === null) {
          return (
            <Text key={i} wrap="truncate-end">
              <Text color={theme.accent}>{prompt}</Text>
              {line.text}
            </Text>
          );
        }
        const at = [...new Intl.Segmenter().segment(line.text.slice(cur))][0]?.segment ?? ' ';
        return (
          <Text key={i} wrap="truncate-end">
            <Text color={theme.accent}>{prompt}</Text>
            {line.text.slice(0, cur)}
            <Text inverse>{at}</Text>
            {line.text.slice(cur + (at === ' ' && cur >= line.text.length ? 0 : at.length))}
          </Text>
        );
      })}
    </Box>
  );
}
