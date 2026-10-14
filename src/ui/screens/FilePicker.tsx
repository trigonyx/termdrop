import fs from 'node:fs';
import path from 'node:path';
import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import { tildify } from '../../core/paths.js';
import type { AppStore } from '../../core/store.js';
import { inspectPaths, showPath, type LocalFile } from '../../transfer/local.js';
import { expandHome, resolvePastedPaths } from '../../transfer/paste.js';
import { formatBytes, plural } from '../../transfer/units.js';
import { completePath } from '../complete.js';
import { emptyEditor, type EditorState } from '../editor.js';
import { Footer } from '../components/Footer.js';
import { InputBox } from '../components/InputBox.js';
import { usePaste, useWheel } from '../mouse.js';
import { icons, theme } from '../theme.js';

interface Props {
  store: AppStore;
  width: number;
  height: number;
  files: LocalFile[];
  /** why some paths were left out */
  notices: string[];
  onChange(files: LocalFile[], notices: string[]): void;
  onNext(): void;
  onCancel(): void;
  /** folder that relative paths start from */
  cwd?: string;
}

const exists = (p: string) => {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
};

/**
 * Step 1 of sending: the files. Paths can be dropped onto the window (anywhere on this screen),
 * typed with tab completion, or come from the command line; `d` removes the selected one.
 */
export function FilePicker({ store, width, height, files, notices, onChange, onNext, onCancel, cwd = process.cwd() }: Props) {
  const [focus, setFocus] = useState<'list' | 'input'>(files.length ? 'list' : 'input');
  const [cursor, setCursor] = useState(0);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [candidates, setCandidates] = useState<string[]>([]);
  const sel = Math.min(cursor, Math.max(0, files.length - 1));
  const total = files.reduce((n, f) => n + f.size, 0);

  /** Adds paths (absolute or relative to cwd); reports what couldn't be added. */
  const add = (paths: string[]) => {
    const { files: more, rejected } = inspectPaths(
      paths.map((p) => path.resolve(cwd, expandHome(p))),
      files,
    );
    onChange([...files, ...more], rejected.map((r) => r.reason));
    if (more.length) setCursor(files.length + more.length - 1);
    return more.length;
  };

  /** What was typed: one path as is if it exists, else read like a paste (escapes, quotes, several). */
  const submitInput = (value: string) => {
    const v = value.trim();
    if (!v) {
      if (files.length) onNext();
      return;
    }
    const direct = path.resolve(cwd, expandHome(v));
    const paths = exists(direct) ? [direct] : (resolvePastedPaths(v, exists) ?? [direct]);
    add(paths);
    setEditor(emptyEditor);
    setCandidates([]);
  };

  /** A drop onto the window: added right away, whatever has the focus. */
  const onPaste = (text: string) => {
    const paths = resolvePastedPaths(text, exists);
    if (!paths) return false;
    add(paths);
    return true;
  };
  usePaste(onPaste, focus === 'list');

  useWheel((dir) => setCursor((c) => Math.max(0, Math.min(files.length - 1, c + dir))), focus === 'list');

  useInput(
    (input, key) => {
      if (key.escape) return onCancel();
      if (input.length > 1 && onPaste(input)) return;
      if (key.upArrow || input === 'k') return setCursor(Math.max(0, sel - 1));
      if (key.downArrow || input === 'j') return setCursor(Math.min(files.length - 1, sel + 1));
      if (key.return) return files.length ? onNext() : setFocus('input');
      if ((input === 'd' || key.delete || key.backspace) && files[sel]) {
        onChange(files.filter((_, i) => i !== sel), []);
        if (files.length === 1) setFocus('input');
        return;
      }
      if (input === 'a' || key.tab) return setFocus('input');
      // typing a path straight away
      if (input === '/' || input === '~' || input === '.') {
        setEditor({ value: input, cursor: input.length });
        setFocus('input');
      }
    },
    { isActive: focus === 'list' },
  );

  const onKey = (_input: string, key: { tab?: boolean; escape?: boolean; upArrow?: boolean }) => {
    if (key.tab) {
      const c = completePath(editor.value, cwd);
      setEditor({ value: c.value, cursor: c.value.length });
      setCandidates(c.candidates);
      return true;
    }
    if (key.escape) {
      if (editor.value) {
        setEditor(emptyEditor);
        setCandidates([]);
      } else if (files.length) setFocus('list');
      else onCancel();
      return true;
    }
    if (key.upArrow && files.length && !editor.value) {
      setFocus('list');
      return true;
    }
    return false;
  };

  // ── Layout ──
  const inner = width - 4;
  const candRows = focus === 'input' && candidates.length ? Math.min(4, Math.ceil(candidates.length / 3)) : 0;
  const noticeRows = Math.min(3, notices.length);
  // header (2) + list + gap + notices + input (3) + candidates + footer
  const listRows = Math.max(2, height - 2 - 1 - noticeRows - 3 - candRows - 1);
  const start = Math.max(0, Math.min(sel - Math.floor(listRows / 2), files.length - listRows));
  const visible = files.slice(start, start + listRows);
  const nameW = Math.min(40, Math.max(12, Math.floor(inner * 0.45)));
  const colW = Math.max(12, Math.floor((width - 6) / 3));

  const hints =
    focus === 'list'
      ? ['enter next: choose friends', '↑↓ select', 'd remove', 'a add a path', 'esc cancel']
      : ['enter add', 'tab complete', ...(files.length ? ['enter on empty: next', 'esc back'] : ['esc cancel'])];

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box paddingX={1} width={width}>
        <Text color={theme.dim} bold>
          SEND FILES
        </Text>
        <Text color={theme.dim}>
          {files.length ? ` · ${plural(files.length, 'file')} · ${formatBytes(total)}` : ''}
        </Text>
      </Box>
      <Text> </Text>
      <Box flexDirection="column" height={listRows} paddingX={1} overflow="hidden">
        {files.length === 0 ? (
          <Text color={theme.dim} wrap="wrap">
            Drag files from Finder into this window, or type a path below (<Text color={theme.accent}>tab</Text> completes). Folders
            aren&apos;t supported yet – zip them first.
          </Text>
        ) : (
          visible.map((f, i) => {
            const active = focus === 'list' && start + i === sel;
            return (
              <Box key={f.path} width={inner + 2}>
                <Box width={2} flexShrink={0}>
                  <Text color={theme.accent}>{active ? icons.pointer : ' '}</Text>
                </Box>
                <Box width={2} flexShrink={0}>
                  <Text color={theme.faint}>{icons.file}</Text>
                </Box>
                <Box width={nameW} flexShrink={0}>
                  <Text bold={active} color={active ? theme.accent : undefined} wrap="truncate-middle">
                    {showPath(f.name)}
                  </Text>
                </Box>
                <Box width={10} flexShrink={0} justifyContent="flex-end">
                  <Text>{formatBytes(f.size)}</Text>
                </Box>
                <Box flexGrow={1} flexShrink={1} minWidth={0} marginLeft={2}>
                  <Text color={theme.faint} wrap="truncate-start">
                    {showPath(tildify(path.dirname(f.path)))}
                  </Text>
                </Box>
              </Box>
            );
          })
        )}
      </Box>
      <Text> </Text>
      {notices.slice(0, noticeRows).map((n, i) => (
        <Box key={i} paddingX={1}>
          <Text color={theme.error} wrap="truncate-end">
            {icons.error} {n}
          </Text>
        </Box>
      ))}
      <InputBox
        state={editor}
        onChange={(s) => {
          setEditor(s);
          if (candidates.length) setCandidates([]);
        }}
        onSubmit={submitInput}
        onKey={onKey}
        onPaste={onPaste}
        isActive={focus === 'input'}
        width={width}
        singleLine
        placeholder={files.length ? 'add another path, or press enter to continue' : 'type a path, or drag files here'}
        borderColor={focus === 'input' ? theme.accent : theme.border}
      />
      {candRows ? (
        <Box flexDirection="column" paddingX={2} height={candRows} overflow="hidden">
          {Array.from({ length: candRows }, (_, r) => (
            <Box key={r}>
              {candidates.slice(r * 3, r * 3 + 3).map((c) => (
                <Box key={c} width={colW} flexShrink={0}>
                  <Text color={c.endsWith('/') ? theme.peer : theme.dim} wrap="truncate-end">
                    {showPath(c)}
                  </Text>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      ) : null}
      <Footer hints={hints} toast={store.toast} width={width} />
    </Box>
  );
}
