import stringWidth from 'string-width';

/** Input field state. `cursor` is an index into `value` (UTF-16). */
export interface EditorState {
  value: string;
  cursor: number;
}

export const emptyEditor: EditorState = { value: '', cursor: 0 };

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function graphemes(text: string): { segment: string; index: number }[] {
  return [...segmenter.segment(text)].map((s) => ({ segment: s.segment, index: s.index }));
}

function prevBoundary(value: string, cursor: number): number {
  let prev = 0;
  for (const g of graphemes(value)) {
    if (g.index >= cursor) break;
    prev = g.index;
  }
  return prev;
}

function nextBoundary(value: string, cursor: number): number {
  for (const g of graphemes(value)) {
    if (g.index >= cursor) return g.index + g.segment.length;
  }
  return value.length;
}

const isWordChar = (ch: string) => /[\p{L}\p{N}_]/u.test(ch);

function wordLeft(value: string, cursor: number): number {
  let i = cursor;
  while (i > 0 && !isWordChar(value[i - 1]!)) i--;
  while (i > 0 && isWordChar(value[i - 1]!)) i--;
  return i;
}

function wordRight(value: string, cursor: number): number {
  let i = cursor;
  while (i < value.length && !isWordChar(value[i]!)) i++;
  while (i < value.length && isWordChar(value[i]!)) i++;
  return i;
}

const lineStart = (value: string, cursor: number) => value.lastIndexOf('\n', cursor - 1) + 1;
const lineEnd = (value: string, cursor: number) => {
  const i = value.indexOf('\n', cursor);
  return i === -1 ? value.length : i;
};

export const edit = {
  insert(s: EditorState, text: string): EditorState {
    return { value: s.value.slice(0, s.cursor) + text + s.value.slice(s.cursor), cursor: s.cursor + text.length };
  },
  backspace(s: EditorState): EditorState {
    if (s.cursor === 0) return s;
    const p = prevBoundary(s.value, s.cursor);
    return { value: s.value.slice(0, p) + s.value.slice(s.cursor), cursor: p };
  },
  deleteForward(s: EditorState): EditorState {
    if (s.cursor >= s.value.length) return s;
    const n = nextBoundary(s.value, s.cursor);
    return { value: s.value.slice(0, s.cursor) + s.value.slice(n), cursor: s.cursor };
  },
  deleteWordBack(s: EditorState): EditorState {
    const p = wordLeft(s.value, s.cursor);
    return { value: s.value.slice(0, p) + s.value.slice(s.cursor), cursor: p };
  },
  killToLineStart(s: EditorState): EditorState {
    const p = lineStart(s.value, s.cursor);
    return { value: s.value.slice(0, p) + s.value.slice(s.cursor), cursor: p };
  },
  killToLineEnd(s: EditorState): EditorState {
    const e = lineEnd(s.value, s.cursor);
    return { value: s.value.slice(0, s.cursor) + s.value.slice(e), cursor: s.cursor };
  },
  left: (s: EditorState): EditorState => ({ ...s, cursor: prevBoundary(s.value, s.cursor) }),
  right: (s: EditorState): EditorState => ({ ...s, cursor: nextBoundary(s.value, s.cursor) }),
  wordLeft: (s: EditorState): EditorState => ({ ...s, cursor: wordLeft(s.value, s.cursor) }),
  wordRight: (s: EditorState): EditorState => ({ ...s, cursor: wordRight(s.value, s.cursor) }),
  home: (s: EditorState): EditorState => ({ ...s, cursor: lineStart(s.value, s.cursor) }),
  end: (s: EditorState): EditorState => ({ ...s, cursor: lineEnd(s.value, s.cursor) }),
  /** One line up/down; `null` if already on the first/last line. */
  vertical(s: EditorState, dir: -1 | 1): EditorState | null {
    const start = lineStart(s.value, s.cursor);
    const col = s.cursor - start;
    if (dir === -1) {
      if (start === 0) return null;
      const prevStart = lineStart(s.value, start - 1);
      return { ...s, cursor: Math.min(prevStart + col, start - 1) };
    }
    const end = lineEnd(s.value, s.cursor);
    if (end === s.value.length) return null;
    const nextEnd = lineEnd(s.value, end + 1);
    return { ...s, cursor: Math.min(end + 1 + col, nextEnd) };
  },
};

/** Normalizes pasted text: unify line endings, strip control characters. */
export function cleanPaste(text: string): string {
  return text
    .replace(/\u001b\[20[01]~/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '');
}

export interface VisualLine {
  text: string;
  /** Cursor index within `text`, if the cursor is on this line. */
  cursor: number | null;
}

/**
 * Wraps the text to the available width and tracks where the cursor lands.
 * Custom implementation so the cursor stays exact across wraps.
 */
export function layoutEditor(s: EditorState, width: number): VisualLine[] {
  const w = Math.max(1, width);
  const lines: VisualLine[] = [];
  let offset = 0;
  for (const logical of s.value.split('\n')) {
    let current = '';
    let currentWidth = 0;
    let cursorAt: number | null = null;
    for (const g of graphemes(logical)) {
      const gw = stringWidth(g.segment);
      if (currentWidth + gw > w) {
        lines.push({ text: current, cursor: cursorAt });
        current = '';
        currentWidth = 0;
        cursorAt = null;
      }
      if (offset + g.index === s.cursor) cursorAt = current.length;
      current += g.segment;
      currentWidth += gw;
    }
    if (offset + logical.length === s.cursor) {
      // cursor at end of line: if it no longer fits, it moves to a new line
      if (currentWidth >= w) {
        lines.push({ text: current, cursor: cursorAt });
        current = '';
        currentWidth = 0;
        cursorAt = null;
      }
      cursorAt = current.length;
    }
    lines.push({ text: current, cursor: cursorAt });
    offset += logical.length + 1;
  }
  return lines;
}
