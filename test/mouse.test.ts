import { describe, expect, it } from 'vitest';
import { extractMouse } from '../src/ui/mouse.js';

const E = '\u001b';

describe('mouse input', () => {
  it('detects SGR wheel up/down and drops clicks', () => {
    expect(extractMouse(`${E}[<64;10;5M`)).toEqual({ text: '', events: [-1], pending: '' });
    expect(extractMouse(`${E}[<65;10;5M`)).toEqual({ text: '', events: [1], pending: '' });
    // with modifier bits (shift = 4, ctrl = 16)
    expect(extractMouse(`${E}[<84;1;1M${E}[<69;1;1M`).events).toEqual([-1, 1]);
    // left click press + release
    expect(extractMouse(`${E}[<0;3;4M${E}[<0;3;4m`)).toEqual({ text: '', events: [], pending: '' });
  });

  it('detects the old X10 encoding', () => {
    const up = `${E}[M${String.fromCharCode(32 + 64)}!!`;
    const down = `${E}[M${String.fromCharCode(32 + 65)}!!`;
    expect(extractMouse(up + down).events).toEqual([-1, 1]);
  });

  it('keeps text around mouse events in order', () => {
    expect(extractMouse(`ab${E}[<64;1;1Mcd${E}[<65;1;1Mef`)).toEqual({ text: 'abcdef', events: [-1, 1], pending: '' });
  });

  it('reassembles a sequence split across chunks', () => {
    const first = extractMouse(`hi${E}[<64;1`);
    expect(first).toEqual({ text: 'hi', events: [], pending: `${E}[<64;1` });
    expect(extractMouse(';1Mok', first.pending)).toEqual({ text: 'ok', events: [-1], pending: '' });
    const x10 = extractMouse(`${E}[M`);
    expect(x10.pending).toBe(`${E}[M`);
    expect(extractMouse(`${String.fromCharCode(97)}!!`, x10.pending).events).toEqual([1]);
  });

  it('extracts focus reports without leaking them as text', () => {
    expect(extractMouse(`a${E}[Ob${E}[Ic`)).toEqual({ text: 'abc', events: [], pending: '', focus: [false, true] });
    const first = extractMouse(`${E}[`);
    expect(extractMouse('I', first.pending).focus).toEqual([true]);
  });

  it('leaves keys alone', () => {
    for (const key of [`${E}[A`, `${E}[B`, `${E}[5~`, `${E}\r`, `${E}b`, `x${E}[1;2A`]) {
      expect(extractMouse(key)).toEqual({ text: key, events: [], pending: '' });
    }
    // a lone ESC at the very end is held back briefly (it might start a mouse sequence)
    expect(extractMouse(E)).toEqual({ text: '', events: [], pending: E });
  });
});
