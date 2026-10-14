#!/usr/bin/env node
// npm run release [patch|minor|major] – checks, bumps the version, builds dist/ (with termcore
// bundled in), adds a CHANGELOG section, commits, tags and pushes. See termcore/release.
import { release } from 'termcore/release';

release({ app: 'termdrop', bump: process.argv[2] ?? 'patch' });
