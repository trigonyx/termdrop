import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  finalizePart,
  inside,
  MAX_NAME_BYTES,
  numberedName,
  PART_SUFFIX,
  removePart,
  reservePart,
  safeFileName,
  splitExt,
} from '../src/transfer/filenames.js';
import { inspectPaths } from '../src/transfer/local.js';
import { listDir, tmpDir } from './helpers.js';

describe('file names from the network', () => {
  it('keep only the base name: no path traversal, no absolute paths', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('/etc/passwd')).toBe('passwd');
    expect(safeFileName('..\\..\\Windows\\System32\\evil.dll')).toBe('evil.dll');
    expect(safeFileName('C:\\Users\\me\\a.txt')).toBe('a.txt');
    expect(safeFileName('foo/../../bar.txt')).toBe('bar.txt');
    expect(safeFileName('dir/')).toBe('dir');
    expect(safeFileName('..')).toBe('file');
    expect(safeFileName('.')).toBe('file');
    expect(safeFileName('../..')).toBe('file');
    expect(safeFileName('/')).toBe('file');
    expect(safeFileName('\\\\server\\share\\x.pdf')).toBe('x.pdf');
  });

  it('drop NUL, control characters and escape sequences', () => {
    expect(safeFileName('a\u0000b.txt')).toBe('ab.txt');
    expect(safeFileName('evil\u001b[2J\u001b]0;pwned\u0007.txt')).toBe('evil.txt');
    expect(safeFileName('\u001b[31mred\u001b[0m.png')).toBe('red.png');
    expect(safeFileName('line\nbreak\r.txt')).toBe('linebreak.txt');
    expect(safeFileName('bell\u0007\u009b31m.txt')).toBe('bell31m.txt');
    // a bidi override can make "exe.txt" look like "txt.exe"
    expect(safeFileName('invoice\u202Egpj.exe')).toBe('invoicegpj.exe');
    expect(safeFileName('zero\u200Bwidth.txt')).toBe('zerowidth.txt');
  });

  it('no leading dashes, no trailing dots or spaces, no characters Windows forbids', () => {
    expect(safeFileName('-rf')).toBe('rf');
    expect(safeFileName('--help.txt')).toBe('help.txt');
    expect(safeFileName(' - x')).toBe('x');
    expect(safeFileName('name. . ')).toBe('name');
    expect(safeFileName('what?<>|*:".txt')).toBe('what_______.txt');
    expect(safeFileName('   ')).toBe('file');
    expect(safeFileName('')).toBe('file');
    expect(safeFileName(42)).toBe('file');
    expect(safeFileName(null)).toBe('file');
  });

  it('defuse Windows device names', () => {
    for (const n of ['CON', 'con', 'NUL', 'nul.txt', 'COM1', 'lpt9.log', 'AUX.tar.gz', 'PRN']) {
      expect(safeFileName(n)).toBe(`_${n}`);
    }
    expect(safeFileName('console.txt')).toBe('console.txt');
    expect(safeFileName('nullable.js')).toBe('nullable.js');
  });

  it('keep Unicode and dotfiles, and cut overlong names but keep the extension', () => {
    expect(safeFileName('Größe – Übersicht 📊.xlsx')).toBe('Größe – Übersicht 📊.xlsx');
    expect(safeFileName('写真.jpg')).toBe('写真.jpg');
    expect(safeFileName('.bashrc')).toBe('.bashrc');
    // decomposed umlauts (macOS) become composed ones
    expect(safeFileName('U\u0308ber.txt')).toBe('Über.txt');
    const long = safeFileName(`${'a'.repeat(300)}.pdf`);
    expect(Buffer.byteLength(long)).toBeLessThanOrEqual(MAX_NAME_BYTES);
    expect(long.endsWith('.pdf')).toBe(true);
    const emoji = safeFileName(`${'😀'.repeat(100)}.png`);
    expect(Buffer.byteLength(emoji)).toBeLessThanOrEqual(MAX_NAME_BYTES);
    expect(emoji).toMatch(/^(😀)+\.png$/); // never cut inside a character
  });

  it('whatever comes out stays inside the folder', () => {
    const dir = tmpDir('inside');
    const nasty = ['../../etc/passwd', '..', '/abs', 'a/b/c', '..\\..\\x', '\u0000', '-', '. ', 'CON', `${'x'.repeat(5000)}`];
    for (const raw of nasty) {
      const full = inside(dir, safeFileName(raw));
      expect(path.dirname(full)).toBe(path.resolve(dir));
    }
    expect(() => inside(dir, '../escape')).toThrow();
    expect(() => inside(dir, 'a/b')).toThrow();
  });
});

describe('names for conflicts', () => {
  it('number the stem, keep the extension', () => {
    expect(numberedName('foto.jpg', 0)).toBe('foto.jpg');
    expect(numberedName('foto.jpg', 1)).toBe('foto (1).jpg');
    expect(numberedName('foto.jpg', 2)).toBe('foto (2).jpg');
    expect(numberedName('README', 1)).toBe('README (1)');
    expect(numberedName('.env', 1)).toBe('.env (1)');
    expect(numberedName('archive.tar.gz', 1)).toBe('archive (1).tar.gz');
    expect(numberedName('weird.', 1)).toBe('weird. (1)');
    expect(splitExt('a.b.c')).toEqual(['a.b', '.c']);
  });

  it('never overwrite: part file first, then the next free name', async () => {
    const dir = tmpDir('conflict');
    fs.writeFileSync(path.join(dir, 'foto.jpg'), 'old');
    fs.writeFileSync(path.join(dir, 'foto (1).jpg'), 'old 1');
    const r = await reservePart(dir, 'foto.jpg');
    expect(path.basename(r.partPath)).toBe(`foto (2).jpg${PART_SUFFIX}`);
    await r.handle.write('new');
    await r.handle.close();
    // meanwhile someone creates "foto (2).jpg" too
    fs.writeFileSync(path.join(dir, 'foto (2).jpg'), 'sneaky');
    const final = await finalizePart(dir, r.partPath, 'foto.jpg', r.n);
    expect(path.basename(final)).toBe('foto (3).jpg');
    expect(fs.readFileSync(final, 'utf8')).toBe('new');
    expect(fs.readFileSync(path.join(dir, 'foto.jpg'), 'utf8')).toBe('old');
    expect(fs.readFileSync(path.join(dir, 'foto (2).jpg'), 'utf8')).toBe('sneaky');
    expect(listDir(dir)).toEqual(['foto (1).jpg', 'foto (2).jpg', 'foto (3).jpg', 'foto.jpg']);
  });

  it('files without extension and dotfiles get numbers too', async () => {
    const dir = tmpDir('noext');
    for (const name of ['Makefile', '.env']) {
      fs.writeFileSync(path.join(dir, name), 'x');
      const r = await reservePart(dir, name);
      await r.handle.close();
      expect(path.basename(await finalizePart(dir, r.partPath, name, r.n))).toBe(`${name} (1)`);
    }
  });

  it("doesn't follow a symlink planted where the part file goes", async () => {
    const dir = tmpDir('symlink');
    const victim = path.join(tmpDir('victim'), 'important.txt');
    fs.writeFileSync(victim, 'keep me');
    fs.symlinkSync(victim, path.join(dir, `doc.txt${PART_SUFFIX}`));
    const r = await reservePart(dir, 'doc.txt');
    expect(path.basename(r.partPath)).toBe(`doc (1).txt${PART_SUFFIX}`);
    await r.handle.write('payload');
    await r.handle.close();
    await removePart(r.partPath);
    expect(fs.readFileSync(victim, 'utf8')).toBe('keep me');
    // a dangling symlink with the final name is "taken" as well
    fs.symlinkSync(path.join(dir, 'nowhere'), path.join(dir, 'x.txt'));
    const r2 = await reservePart(dir, 'x.txt');
    expect(path.basename(r2.partPath)).toBe(`x (1).txt${PART_SUFFIX}`);
    await r2.handle.close();
  });
});

describe('picking files to send', () => {
  it('accepts regular files and explains everything else', () => {
    const dir = tmpDir('pick');
    const file = path.join(dir, 'a.txt');
    fs.writeFileSync(file, 'hello');
    const sub = path.join(dir, 'Photos');
    fs.mkdirSync(sub);
    const { files, rejected } = inspectPaths([file, sub, path.join(dir, 'missing.txt'), file]);
    expect(files).toEqual([{ path: file, name: 'a.txt', size: 5 }]);
    expect(rejected.map((r) => r.reason)).toEqual(["Photos: folders aren't supported yet – zip it first", 'missing.txt: no such file']);
    if (process.platform !== 'win32' && process.getuid?.() !== 0) {
      const locked = path.join(dir, 'secret.txt');
      fs.writeFileSync(locked, 'x', { mode: 0o000 });
      expect(inspectPaths([locked]).rejected[0]?.reason).toBe('secret.txt: no permission to read it');
    }
    // already picked ones aren't added twice
    expect(inspectPaths([file], files).files).toEqual([]);
  });
});
