/**
 * Build the single-file distributable.
 *
 * ESM users import `src/overboard.js` directly — it is real ES module source and
 * runs natively in browsers, so it needs no build at all. This script exists
 * only for the other audience: Anki cards and plain `<script>` tags, where one
 * self-contained file with nothing to fetch is the whole requirement.
 *
 * It is a concatenator, not a general bundler. The module order is declared
 * below, imports between those modules are stripped, and the result is wrapped
 * in an IIFE. That is enough because this project's dependency graph is a
 * handful of files we control, and it keeps the toolchain at zero packages.
 *
 * Run: node build.js
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/** Dependency order — each module may only use the ones above it. */
const MODULES = [
  'position.js',
  'san.js',
  'pgn.js',
  'themes.js',
  'pieces.js',
  'render.js',
  'overboard.js',
];

/** Strip module syntax so the files can share one scope. */
function flatten(source) {
  return source
    // Imports between our own modules; everything ends up in one scope.
    .replace(/^import\s+[^;]*?\s*from\s*['"][^'"]+['"];?[ \t]*$/gm, '')
    .replace(/^export\s+default\s+\w+;?[ \t]*$/gm, '')
    .replace(/^export\s+/gm, '')
    .trim();
}

const banner = `/**
 * Overboard ${JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version}
 * A dependency-free chess board viewer. https://github.com/AleksandarMicovic/Overboard
 * Code: MIT licensed. Built from src/ by build.js — edit the source, not this file.
 * Bundled Cburnett piece art: © Colin M.L. Burnett, CC BY-SA 3.0 — see README Attribution.
 */`;

const body = MODULES.map((name) => {
  const source = readFileSync(join(root, 'src', name), 'utf8');
  return `/* ---- src/${name} ${'-'.repeat(Math.max(0, 60 - name.length))} */\n${flatten(source)}`;
}).join('\n\n');

const bundle = `${banner}
(function (global) {
  'use strict';

${body}

  global.Overboard = Overboard;
  if (typeof module !== 'undefined' && module.exports) module.exports = Overboard;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;

mkdirSync(join(root, 'dist'), { recursive: true });
const target = join(root, 'dist', 'overboard.js');
writeFileSync(target, bundle);

// The single-file promise is the point, so verify it rather than trust it.
const problems = [];
if (/\bfrom\s*['"]\.\//.test(bundle)) problems.push('a module import survived');
if (/\b(fetch|XMLHttpRequest|importScripts)\s*\(/.test(bundle)) problems.push('a runtime fetch');
if (/https?:\/\/(?!www\.w3\.org|github\.com)/.test(bundle)) problems.push('an external URL');
if (problems.length) {
  console.error(`Build produced a file that is not self-contained: ${problems.join(', ')}`);
  process.exit(1);
}

const kb = (bundle.length / 1024).toFixed(1);
console.log(`dist/overboard.js  ${kb} kB  (${MODULES.length} modules, 0 external references)`);
