import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { useEffect, useRef } from 'react';

/**
 * Alternate scroll mode: in the alternate screen the terminal turns wheel / two-finger
 * scrolling into ↑/↓ keys. Unlike mouse reporting it leaves click+drag to the terminal,
 * so text can still be selected and copied. Plus focus reports (notifications) and
 * bracketed paste, so a drop of files is one clearly marked paste, not a burst of keys.
 */
export const MOUSE_ON = '\u001b[?1007h\u001b[?1004h\u001b[?2004h';
export const MOUSE_OFF = '\u001b[?2004l\u001b[?1004l\u001b[?1007l';

const PASTE_START = '\u001b[200~';
const PASTE_END = '\u001b[201~';

const ESC = '\u001b';
const SGR = /^\u001b\[<(\d+);(\d+);(\d+)([Mm])/;
const SGR_PARTIAL = /^\u001b\[<[\d;]*$/;
/** How long an incomplete sequence at the end of a chunk is held back. */
const PENDING_MS = 30;
/** How long an unfinished paste waits for its end marker (big pastes come in many chunks). */
const PASTE_PENDING_MS = 1000;

/** -1 = wheel up, +1 = wheel down, null = anything else (clicks, horizontal scroll …) */
function wheelOf(button: number): -1 | 1 | null {
  if (!(button & 64) || button & 128) return null;
  const low = button & 3;
  return low === 0 ? -1 : low === 1 ? 1 : null;
}

export interface Extracted {
  text: string;
  events: (-1 | 1)[];
  pending: string;
  /** Focus reports (`ESC[I` / `ESC[O`) in order; only present when there were any. */
  focus?: boolean[];
  /** Bracketed pastes (without their markers); only present when there were any. */
  pastes?: string[];
}

/**
 * Pulls mouse sequences out of raw terminal input. Supports SGR (`ESC[<b;x;yM`) and
 * the older X10 encoding (`ESC[M` + 3 bytes). Everything else passes through untouched;
 * an incomplete sequence at the very end is returned as `pending`.
 */
export function extractMouse(input: string, pending = ''): Extracted {
  const s = pending + input;
  const events: (-1 | 1)[] = [];
  const focus: boolean[] = [];
  const pastes: string[] = [];
  let text = '';
  let i = 0;
  const done = (rest: string) => finish(text, events, rest, focus, pastes);
  while (i < s.length) {
    const esc = s.indexOf(ESC, i);
    if (esc === -1) {
      text += s.slice(i);
      break;
    }
    text += s.slice(i, esc);
    const rest = s.slice(esc);

    if (rest.startsWith(PASTE_START)) {
      const end = rest.indexOf(PASTE_END);
      // the rest of the paste is still on its way
      if (end === -1) return done(rest);
      pastes.push(rest.slice(PASTE_START.length, end));
      i = esc + end + PASTE_END.length;
      continue;
    }
    if (rest.startsWith(PASTE_END)) {
      i = esc + PASTE_END.length; // stray end marker
      continue;
    }

    if (rest.startsWith(`${ESC}[I`) || rest.startsWith(`${ESC}[O`)) {
      focus.push(rest[2] === 'I');
      i = esc + 3;
      continue;
    }

    const sgr = SGR.exec(rest);
    if (sgr) {
      const dir = sgr[4] === 'M' ? wheelOf(Number(sgr[1])) : null;
      if (dir) events.push(dir);
      i = esc + sgr[0].length;
      continue;
    }
    if (rest.startsWith(`${ESC}[M`)) {
      if (rest.length < 6) return done(rest);
      const dir = wheelOf(rest.charCodeAt(3) - 32);
      if (dir) events.push(dir);
      i = esc + 6;
      continue;
    }
    // could still become a mouse sequence or a paste marker once the next chunk arrives
    if (rest === ESC || rest === `${ESC}[` || SGR_PARTIAL.test(rest) || (rest.length < PASTE_START.length && PASTE_START.startsWith(rest))) {
      return done(rest);
    }

    text += ESC;
    i = esc + 1;
  }
  return done('');
}

function finish(text: string, events: (-1 | 1)[], pending: string, focus: boolean[], pastes: string[]): Extracted {
  return { text, events, pending, ...(focus.length ? { focus } : {}), ...(pastes.length ? { pastes } : {}) };
}

/** Wheel events from the terminal, emitted outside of Ink. */
export const mouse = new EventEmitter<{ wheel: [-1 | 1]; focus: [boolean] }>();

/** Who gets a paste: the most recently activated handler (usePaste); `true` = taken. */
const pasteHandlers: { cb: (text: string) => boolean }[] = [];

/**
 * Hands a paste to the active handler. Returns false if nobody took it – then it's typed
 * into whatever has the keyboard, like before.
 */
export function emitPaste(text: string): boolean {
  for (let i = pasteHandlers.length - 1; i >= 0; i--) if (pasteHandlers[i]!.cb(text)) return true;
  return false;
}

/**
 * Stands in for `process.stdin` towards Ink: mouse sequences are filtered out and
 * emitted as wheel events, everything else is passed on unchanged. Raw mode and
 * ref/unref are forwarded to the real stdin.
 */
export class MouseFilterStdin extends PassThrough {
  readonly isTTY = true;
  private pending = '';
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly source: NodeJS.ReadStream) {
    super();
    source.setEncoding('utf8');
    source.on('data', (chunk: string) => this.feed(chunk));
  }

  private feed(chunk: string): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const r = extractMouse(chunk, this.pending);
    this.pending = r.pending;
    for (const e of r.events) mouse.emit('wheel', e);
    for (const f of r.focus ?? []) mouse.emit('focus', f);
    if (r.text) this.write(r.text);
    for (const p of r.pastes ?? []) this.paste(p);
    if (this.pending) {
      const inPaste = this.pending.startsWith(PASTE_START);
      this.timer = setTimeout(
        () => {
          const p = this.pending;
          this.pending = '';
          // a paste whose end marker never came: still a paste
          if (inPaste) this.paste(p.slice(PASTE_START.length));
          else if (p) this.write(p);
        },
        inPaste ? PASTE_PENDING_MS : PENDING_MS,
      );
    }
  }

  private paste(text: string): void {
    if (!emitPaste(text) && text) this.write(text);
  }

  setRawMode(mode: boolean): this {
    this.source.setRawMode(mode);
    return this;
  }

  ref(): this {
    this.source.ref();
    return this;
  }

  unref(): this {
    this.source.unref();
    return this;
  }
}

/**
 * Receives bracketed pastes (e.g. files dropped onto the window) while `isActive`. The newest
 * active handler goes first; returning false passes the paste on.
 */
export function usePaste(cb: (text: string) => boolean, isActive = true): void {
  const latest = useRef(cb);
  latest.current = cb;
  useEffect(() => {
    if (!isActive) return;
    const h = { cb: (text: string) => latest.current(text) };
    pasteHandlers.push(h);
    return () => {
      pasteHandlers.splice(pasteHandlers.indexOf(h), 1);
    };
  }, [isActive]);
}

/** Calls `cb(-1 | 1)` for every wheel tick while `isActive`. */
export function useWheel(cb: (dir: -1 | 1) => void, isActive = true): void {
  const latest = useRef(cb);
  latest.current = cb;
  useEffect(() => {
    if (!isActive) return;
    const on = (dir: -1 | 1) => latest.current(dir);
    mouse.on('wheel', on);
    return () => {
      mouse.off('wheel', on);
    };
  }, [isActive]);
}
