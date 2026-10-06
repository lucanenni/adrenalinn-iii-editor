#!/usr/bin/env node
/**
 * Device-behaviour tests against the fake pedal (test/fakePedal.mjs), which reproduces
 * what a real AdrenaLinn III does — see that file. Usage: node test/device.mjs
 */
import { FakePedal } from './fakePedal.mjs';
import { midi } from '../src/midi/midiManager.js';
import { buildFactoryInit } from '../src/midi/sysex.js';
import { parsePreset, serializePreset } from '../src/midi/presetData.js';
import { presetStore } from '../src/store/presetStore.js';
import { drumbeatStore } from '../src/store/drumbeatStore.js';
import { libraryStore as lib } from '../src/store/libraryStore.js';
import { systemStore } from '../src/store/systemStore.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ name, pass, actual, expected });
}
const pedal = new FakePedal().attach();
const seedLibrary = (slots, tempo = 100) => {
  lib._presets.clear();
  for (const s of slots) lib._presets.set(s, { slot: s, raw: Uint8Array.from(Object.assign(pedal.slotsP[s].slice(), { 30: tempo, 4: 40 + s })) });
};

// ── 1. The editor follows what the pedal does to a single-param edit ────────
{
  presetStore.loadRaw(Uint8Array.from(pedal.presetEdit), 5);
  check('start: delay off, clean', [presetStore.preset.delayOn, presetStore.dirty], [false, false]);
  presetStore.set('delayVolume', 40);
  await sleep(1100);
  check('pedal switched Delay on, editor adopted it', [!!(pedal.presetEdit[9] & 0x08), presetStore.preset.delayOn], [true, true]);
  check('adopting keeps dirty state and slot number', [presetStore.dirty, presetStore.number], [true, 5]);
  presetStore.set('modEffect', 10);
  await sleep(1100);
  check('new effect → pedal loaded its defaults, editor follows',
    JSON.stringify(presetStore.preset) === JSON.stringify(parsePreset(Uint8Array.from(pedal.presetEdit))), true);
  check('depth is the pedal\'s default for the effect (raw 59)', presetStore.preset.depth, 59 - 99);
  check('undo history survived adoption', presetStore.undo(), true);
}

// ── 2. Restore keeps each preset's own tempo (the pedal stamps the drumbeat tempo) ──
{
  pedal.factoryReset(); pedal.sys[0] = 7; pedal.presetEdit = pedal.slotsP[7].slice();
  pedal.drumEdit = pedal.slotsD[0].slice(); const drumBefore = pedal.drumEdit.slice(); const sysBefore = pedal.sys.slice();
  seedLibrary([20, 21, 22], 100);
  const r = await lib.startRestore('preset', 20, 22);
  check('restore reports exact tempo', [r.written, r.exactTempo], [3, true]);
  check('slots written byte-for-byte, tempo included', [20, 21, 22].map(s => JSON.stringify(pedal.slotsP[s]) === JSON.stringify(Array.from(lib._presets.get(s).raw))), [true, true, true]);
  check('"Preset Sets Drumbeat" restored', pedal.sys[5], sysBefore[5]);
  check('drumbeat edit buffer and active drumbeat restored', [pedal.drumEdit, pedal.sys[1]], [drumBefore, sysBefore[1]]);
  check('previously active preset selected again', pedal.sys[0], 7);
}

// ── 3. Whatever the Tempo Source, Restore keeps the tempos and puts the setting back ──
for (const source of [0, 2]) {
  pedal.factoryReset(); pedal.sys[8] = source; pedal.sys[2] = 140;
  seedLibrary([30, 31], 100); lib._presets.get(31).raw[30] = 150;
  const r = await lib.startRestore('preset', 30, 31);
  check(`Tempo Source ${source}: tempos kept (100 and 150)`, [r.exactTempo, pedal.slotsP[30][30], pedal.slotsP[31][30]], [true, 100, 150]);
  check(`Tempo Source ${source}: setting and System tempo put back`, [pedal.sys[8], pedal.sys[2], pedal.sys[5]], [source, 140, 1]);
}
{ // control: the quirk itself — a plain write (no session) really does lose the tempo
  pedal.factoryReset(); pedal.sys[8] = 0; pedal.sys[2] = 140;
  pedal.receive(Array.from((await import('../src/midi/sysex.js')).buildSelectPreset(33)));
  pedal.receive(Array.from((await import('../src/midi/sysex.js')).buildSendPreset(Uint8Array.from(Object.assign(pedal.slotsP[33].slice(), { 30: 100 })))));
  check('control: a plain write under Tempo Source 0 stores the System tempo, not 100', pedal.slotsP[33][30], 140);
}

// ── 4. Save to Slot stores the editor's tempo ───────────────────────────────
{
  pedal.factoryReset(); pedal.presetEdit = pedal.slotsP[3].slice(); // the pedal's edit buffer matches the editor's
  presetStore.loadRaw(Uint8Array.from(pedal.slotsP[3]), 3);
  presetStore.set('presetTempo', 123);
  await presetStore.saveToSlot(40);
  const expected = Array.from(serializePreset(presetStore.preset));
  const differing = expected.map((v, i) => v === pedal.slotsP[40][i] ? null : `b${i}: editor ${v} / saved ${pedal.slotsP[40][i]}`).filter(Boolean);
  check('saved slot equals the editor preset, tempo 123', [pedal.slotsP[40][30], differing], [123, []]);
  check('"Preset Sets Drumbeat" put back after saving', pedal.sys[5], 1);
}

// ── 5. Drumbeat restore is plain (no stamping) ──────────────────────────────
{
  pedal.factoryReset();
  lib._drumbeats.clear();
  const raw = Uint8Array.from(pedal.slotsD[50]); raw[8] = 99;
  lib._drumbeats.set(50, { slot: 50, raw });
  const r = await lib.startRestore('drumbeat', 50, 50);
  check('drumbeat written exactly (tempo 99)', [r.written, pedal.slotsD[50][8]], [1, 99]);
}

// ── 6. Factory Init needs the File Version byte; the editor sends it ────────
{
  pedal.factoryReset();
  pedal.sys[6] = 7; pedal.slotsP[60][4] = 99;
  midi.send(Uint8Array.from([0xF0, 0x00, 0x01, 0x37, 0x03, 0x13, 0xF7])); // the spec's frame
  await sleep(50);
  check('spec frame (no File Version) is ignored', [pedal.sys[6], pedal.slotsP[60][4], pedal.factoryInitsObeyed], [7, 99, 0]);
  check('buildFactoryInit() has the File Version byte', Array.from(buildFactoryInit()), [0xF0, 0x00, 0x01, 0x37, 0x03, 0x01, 0x13, 0xF7]);
  await systemStore.factoryInit();
  check('Factory Init resets System params and slots', [pedal.sys[6], pedal.slotsP[60][4], pedal.factoryInitsObeyed], [2, 60, 1]);
  check('editor re-read the pedal after the reset', [systemStore.get('noiseGate'), JSON.stringify(presetStore.preset) === JSON.stringify(parsePreset(Uint8Array.from(pedal.presetEdit)))], [2, true]);
}

const failed = results.filter(r => !r.pass);
for (const f of failed) console.error(`FAIL ${f.name}\n  expected: ${JSON.stringify(f.expected)}\n  got:      ${JSON.stringify(f.actual)}`);
console.log(`${results.length - failed.length}/${results.length} device checks passed`);
process.exit(failed.length ? 1 : 0);
