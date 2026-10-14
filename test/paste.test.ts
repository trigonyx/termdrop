import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePastedPaths, resolvePastedPaths, splitShellWords } from '../src/transfer/paste.js';
import { tmpDir } from './helpers.js';

const HOME = '/Users/alice';
const parse = (s: string) => parsePastedPaths(s, HOME, 'darwin');

describe('pasted / dropped paths', () => {
  it('Terminal.app and iTerm2: backslash-escaped spaces, a trailing space', () => {
    expect(parse('/Users/alice/Desktop/My\\ File.pdf ')).toEqual(['/Users/alice/Desktop/My File.pdf']);
    expect(parse('/Users/alice/Desktop/a\\ \\(1\\).jpg')).toEqual(['/Users/alice/Desktop/a (1).jpg']);
    expect(parse("/tmp/it\\'s\\ fine.txt")).toEqual(["/tmp/it's fine.txt"]);
    expect(parse('/tmp/back\\\\slash')).toEqual(['/tmp/back\\slash']);
  });

  it('several files at once', () => {
    expect(parse('/tmp/a.txt /tmp/b\\ c.txt /tmp/d.txt ')).toEqual(['/tmp/a.txt', '/tmp/b c.txt', '/tmp/d.txt']);
    expect(parse('/tmp/a.txt\n/tmp/b.txt\n')).toEqual(['/tmp/a.txt', '/tmp/b.txt']);
    // the same file twice counts once
    expect(parse('/tmp/a.txt /tmp/a.txt')).toEqual(['/tmp/a.txt']);
  });

  it('single and double quotes (GNOME Terminal, VS Code …)', () => {
    expect(parse("'/home/bob/My File.pdf' '/home/bob/b.txt'")).toEqual(['/home/bob/My File.pdf', '/home/bob/b.txt']);
    expect(parse('"/tmp/quoted \\"name\\".txt"')).toEqual(['/tmp/quoted "name".txt']);
    expect(parse("'/tmp/half")).toBeNull();
  });

  it('~ and file:// URLs', () => {
    expect(parse('~/Downloads/x.zip')).toEqual(['/Users/alice/Downloads/x.zip']);
    expect(parse('~')).toEqual(['/Users/alice']);
    expect(parse('file:///Users/alice/My%20File.pdf')).toEqual(['/Users/alice/My File.pdf']);
    expect(parse('file://localhost/tmp/a.txt')).toEqual(['/tmp/a.txt']);
    expect(parse('file://evil.example.com/tmp/a.txt')).toBeNull();
  });

  it('umlauts and other non-ASCII names', () => {
    expect(parse('/Users/alice/Bilder/Größe\\ Übersicht.png')).toEqual(['/Users/alice/Bilder/Größe Übersicht.png']);
    expect(parse('/tmp/写真\\ 1.jpg')).toEqual(['/tmp/写真 1.jpg']);
  });

  it('bracketed-paste markers are ignored', () => {
    expect(parse('\u001b[200~/tmp/a.txt \u001b[201~')).toEqual(['/tmp/a.txt']);
  });

  it('ordinary typed text is not taken for paths', () => {
    for (const text of ['hello', 'hello world', 'q', 'x', 'send /tmp/a.txt', '~bob/x', 'Downloads/x.zip', './a.txt', '', '   ', 'C:\\x']) {
      expect(parse(text)).toBeNull();
    }
    // "/help" parses as a path, but nothing exists there – resolvePastedPaths says no
    expect(resolvePastedPaths('/help', () => false, HOME, 'darwin')).toBeNull();
  });

  it('Windows paths with quotes', () => {
    expect(parsePastedPaths('"C:\\Users\\me\\My File.txt" D:\\b.txt', 'C:\\Users\\me', 'win32')).toEqual(['C:\\Users\\me\\My File.txt', 'D:\\b.txt']);
    expect(parsePastedPaths('hello', 'C:\\Users\\me', 'win32')).toBeNull();
  });

  it('checks against the disk, and takes an unescaped single path as a whole', () => {
    const dir = tmpDir('paste');
    const spaced = path.join(dir, 'My File.pdf');
    const other = path.join(dir, 'b.txt');
    fs.writeFileSync(spaced, 'x');
    fs.writeFileSync(other, 'y');
    const exists = (p: string) => fs.existsSync(p);
    expect(resolvePastedPaths(`${spaced.replace(/ /g, '\\ ')} ${other} `, exists)).toEqual([spaced, other]);
    // a terminal that doesn't escape at all
    expect(resolvePastedPaths(spaced, exists)).toEqual([spaced]);
    expect(resolvePastedPaths('hello world', exists)).toBeNull();
    // one of two missing: still a drop, the missing one gets reported later
    expect(resolvePastedPaths(`${other} ${path.join(dir, 'gone.txt')}`, exists)).toEqual([other, path.join(dir, 'gone.txt')]);
  });

  it('splits like a shell', () => {
    expect(splitShellWords('a b\\ c "d e" \'f g\'')).toEqual(['a', 'b c', 'd e', 'f g']);
    expect(splitShellWords('a\\\nb')).toEqual(['ab']);
  });
});
