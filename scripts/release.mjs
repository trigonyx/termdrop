#!/usr/bin/env node
// npm run release [patch|minor|major]
// Checks, bumps the version, builds dist/, commits + tags and pushes. Everyone running
// termdrop gets told about the new version on their next launch.
//
// dist/ is committed on purpose: the install command (`npm i -g <GitHub tarball of main>`)
// installs it as is, with no build step and no git needed.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const bump = process.argv[2] ?? 'patch';
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error('Usage: npm run release [patch|minor|major]');
  process.exit(2);
}

const win = process.platform === 'win32';
const npm = win ? 'npm.cmd' : 'npm';
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', shell: win });
const out = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

// local builds change dist/ all the time – only real changes have to be committed first
const dirty = out('git', ['status', '--porcelain']).split('\n').filter((l) => l && !l.slice(3).startsWith('dist/'));
if (dirty.length) {
  console.error('Commit your changes first – the working tree is not clean:\n' + dirty.join('\n'));
  process.exit(1);
}

let tagged = false;
try {
  run(npm, ['run', 'typecheck']);
  run(npm, ['test']);
  run(npm, ['version', bump, '--no-git-tag-version']);
  const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  run(npm, ['run', 'build']); // after the bump, so the build knows its new version
  run('git', ['add', 'package.json', 'package-lock.json', 'dist']);
  run('git', ['commit', '-m', `Release v${version}`]);
  run('git', ['tag', '-a', `v${version}`, '-m', `Release v${version}`]); // annotated: pushed by --follow-tags
  tagged = true;
  // the tag matters: updates install the tarball of v<version>, not of main
  run('git', ['push', '--follow-tags']);
  console.log(`\nReleased v${version}. Friends see the update the next time they start termdrop.`);
} catch {
  if (tagged) {
    console.error('\nThe release commit and tag exist, but pushing failed. Publish them with: git push --follow-tags');
    console.error('(a plain `git push` leaves the tag behind, and updates need it)');
    process.exit(1);
  }
  console.error('\nRelease aborted.');
  process.exit(1);
}
