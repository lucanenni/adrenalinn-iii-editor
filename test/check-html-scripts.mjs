#!/usr/bin/env node
/**
 * Extracts the inline `<script type="module">` block from each entry point
 * and syntax-checks it with `node --check` — the manual technique already
 * documented in CLAUDE.md, wired up here so CI runs it automatically.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const files = ['index.html'];
const dir = mkdtempSync(join(tmpdir(), 'al3-check-'));
let failed = false;

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!match) {
    console.error(`FAIL ${file}: no <script type="module"> block found`);
    failed = true;
    continue;
  }
  const tmpFile = join(dir, file.replace(/[^a-z0-9]/gi, '_') + '.mjs');
  writeFileSync(tmpFile, match[1]);
  try {
    execFileSync(process.execPath, ['--check', tmpFile], { stdio: 'inherit' });
    console.log(`OK   ${file}`);
  } catch {
    console.error(`FAIL ${file}: syntax error above`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
