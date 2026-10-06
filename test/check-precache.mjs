#!/usr/bin/env node
/**
 * Keeps sw.js's hand-maintained PRECACHE_URLS honest (CLAUDE.md rule 7): every listed file must
 * exist (a missing one makes the whole Service Worker install fail) and every src/**\/*.js file
 * must be listed (otherwise it is missing offline).
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const sw = readFileSync('sw.js', 'utf8');
const listed = [...sw.slice(sw.indexOf('PRECACHE_URLS')).matchAll(/'(\.\/[^']*)'/g)].map(m => m[1]);
const walk = d => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);
const sources = walk('src').filter(f => f.endsWith('.js')).map(f => './' + f);

let failed = false;
for (const u of listed) {
  if (u !== './' && !existsSync(u)) { console.error(`FAIL sw.js lists a missing file: ${u}`); failed = true; }
}
for (const f of sources) {
  if (!listed.includes(f)) { console.error(`FAIL not in sw.js PRECACHE_URLS: ${f}`); failed = true; }
}
if (failed) process.exit(1);
console.log(`OK   sw.js precache: ${listed.length} entries, ${sources.length} modules all listed`);
