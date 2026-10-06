/**
 * Data round-trip checks for presetData.js / drumbeatData.js.
 *
 * Pure ESM, no DOM — runnable both under Node (see run.mjs, used by CI) and
 * from a browser module (see ../self-test.html, which renders this visually).
 *
 * Independently re-derives the expected value for every packed byte/nibble
 * and checks it against what parsePreset/serializePreset and
 * parseDrumbeat/serializeDrumbeat actually produce, instead of just
 * round-tripping the code against itself (which wouldn't have caught the
 * real ampBoost bug this suite is named after — a wrong-but-stable decode
 * round-trips fine).
 */
import { parsePreset, serializePreset, defaultPreset, filterTypeOptions, FILTER_TYPE_LABELS, MOD_EFFECTS, EFFECT_SWITCH_OPTS, AMP_MODELS, MOD_EFFECT_NAMES, AMP_MODEL_NAMES, EFFECT_SWITCH_NAMES,
  FX_ORDER, MOD_SOURCES, LFO_WAVES, FX_ORDER_NAMES, MOD_SOURCE_NAMES, LFO_WAVE_NAMES, FILTER_TYPE_NAMES } from '../src/midi/presetData.js';
import { parseDrumbeat, serializeDrumbeat, defaultDrumbeat } from '../src/midi/drumbeatData.js';
import { parseSystem, clampSystemValue, buildSystemParam, balanceLabel, SYSTEM_FIELDS, FOOT_SWITCH_FIELDS, FOOT_DESTINATIONS } from '../src/midi/systemData.js';
import { parseSysEx, pack7bit, unpack7bit, buildFactoryInit, buildRequestSystem, buildSendPresetEditBuf, buildSendDrumbeat, parseIdentityReply, MSG } from '../src/midi/sysex.js';
import { splitSysEx, buildSyxFile, readSyxFile, buildDumpSyx, formatBytes } from '../src/midi/syxFile.js';
import { FAMOUS_SONGS } from '../src/midi/famousPresets.js';

// Order-independent deep-equal (JSON.stringify would false-fail on two
// objects with the same fields in a different key order).
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every(k => deepEqual(a[k], b[k]));
}

export function runRoundTripTests() {
  const groups = [];
  let current = null;
  function group(name) { current = { name, checks: [] }; groups.push(current); }
  function check(name, actual, expected) {
    current.checks.push({ name, pass: deepEqual(actual, expected), actual, expected });
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRESET — one packed byte at a time, everything else held at defaults
  // ══════════════════════════════════════════════════════════════════════
  group('preset · byte 3 — filterType (hi) / stereo (lo×10)');
  for (let n = 0; n <= 15; n++) {
    const raw = serializePreset({ ...defaultPreset(), filterType: n });
    check(`filterType=${n}`, parsePreset(raw).filterType, n);
  }
  for (let n = 0; n <= 9; n++) {
    const raw = serializePreset({ ...defaultPreset(), stereo: n * 10 });
    check(`stereo=${n * 10}`, parsePreset(raw).stereo, n * 10);
  }

  group('preset · byte 8 — modSource (lo) / lfoWave (hi)');
  for (let n = 0; n <= 10; n++) {
    const raw = serializePreset({ ...defaultPreset(), modSource: n });
    check(`modSource=${n}`, parsePreset(raw).modSource, n);
  }
  for (let n = 0; n <= 4; n++) {
    const raw = serializePreset({ ...defaultPreset(), lfoWave: n });
    check(`lfoWave=${n}`, parsePreset(raw).lfoWave, n);
  }

  group('preset · byte 9 — on/off flags + fxOrder (all 128 combinations)');
  {
    let bad = 0;
    for (let flags = 0; flags < 32; flags++) {
      for (let fxOrder = 0; fxOrder < 4; fxOrder++) {
        const p = {
          ...defaultPreset(),
          modOn: !!(flags & 1), ampOn: !!(flags & 2), comprOn: !!(flags & 4),
          delayOn: !!(flags & 8), reverbOn: !!(flags & 16), fxOrder,
        };
        const p2 = parsePreset(serializePreset(p));
        const ok = p2.modOn === p.modOn && p2.ampOn === p.ampOn && p2.comprOn === p.comprOn &&
                   p2.delayOn === p.delayOn && p2.reverbOn === p.reverbOn && p2.fxOrder === p.fxOrder;
        if (!ok) {
          bad++;
          check(`flags=${flags} fxOrder=${fxOrder}`,
            [p2.modOn, p2.ampOn, p2.comprOn, p2.delayOn, p2.reverbOn, p2.fxOrder],
            [p.modOn, p.ampOn, p.comprOn, p.delayOn, p.reverbOn, p.fxOrder]);
        }
      }
    }
    if (!bad) check('all 128 flag/fxOrder combinations round-trip', true, true);
  }

  group('preset · byte 16 — postTreble (hi×10) / comprVolume (lo×10)');
  for (let n = 0; n <= 9; n++) {
    const raw = serializePreset({ ...defaultPreset(), postTreble: n * 10 });
    check(`postTreble=${n * 10}`, parsePreset(raw).postTreble, n * 10);
  }
  for (let n = 0; n <= 9; n++) {
    const raw = serializePreset({ ...defaultPreset(), comprVolume: n * 10 });
    check(`comprVolume=${n * 10}`, parsePreset(raw).comprVolume, n * 10);
  }

  group('preset · byte 18 — ampBoost (hi, +1)×10 / comprDrive (lo×10)');
  // This is the byte that had the operator-precedence bug (fixed to
  // ((b[18]>>4) & 0x0F) + 1) — kept as an explicit regression check.
  for (let n = 0; n <= 8; n++) {
    const expected = (n + 1) * 10;
    const raw = serializePreset({ ...defaultPreset(), ampBoost: expected });
    check(`ampBoost=${expected}`, parsePreset(raw).ampBoost, expected);
  }
  for (let n = 0; n <= 9; n++) {
    const raw = serializePreset({ ...defaultPreset(), comprDrive: n * 10 });
    check(`comprDrive=${n * 10}`, parsePreset(raw).comprDrive, n * 10);
  }

  group('preset · byte 22 — delayTreble (hi×10) / delayStereo (lo×10)');
  for (let n = 0; n <= 9; n++) {
    const raw = serializePreset({ ...defaultPreset(), delayTreble: n * 10 });
    check(`delayTreble=${n * 10}`, parsePreset(raw).delayTreble, n * 10);
  }
  for (let n = 0; n <= 9; n++) {
    const raw = serializePreset({ ...defaultPreset(), delayStereo: n * 10 });
    check(`delayStereo=${n * 10}`, parsePreset(raw).delayStereo, n * 10);
  }

  group('preset · byte 24 — reverbTreble (hi×10) / reverbTime (lo)');
  for (let n = 0; n <= 9; n++) {
    const raw = serializePreset({ ...defaultPreset(), reverbTreble: n * 10 });
    check(`reverbTreble=${n * 10}`, parsePreset(raw).reverbTreble, n * 10);
  }
  for (let n = 0; n <= 15; n++) {
    const raw = serializePreset({ ...defaultPreset(), reverbTime: n });
    check(`reverbTime=${n}`, parsePreset(raw).reverbTime, n);
  }

  group('preset · pedal amounts (incl. SCA sentinel)');
  for (const v of [-99, -50, 0, 50, 99, 'SCA']) {
    const raw = serializePreset({ ...defaultPreset(), pedal1Amount: v, pedal2Amount: v });
    const p2 = parsePreset(raw);
    check(`pedal1Amount=${v}`, p2.pedal1Amount, v);
    check(`pedal2Amount=${v}`, p2.pedal2Amount, v);
  }

  group('preset · variation (1-based) / depth (bipolar, byte-99)');
  for (const v of [1, 2, 8, 21, 100, 256]) {
    const raw = serializePreset({ ...defaultPreset(), variation: v });
    check(`variation=${v}`, parsePreset(raw).variation, v);
  }
  for (const v of [-99, -50, 0, 50, 99, 156]) {
    const raw = serializePreset({ ...defaultPreset(), depth: v });
    check(`depth=${v}`, parsePreset(raw).depth, v);
  }

  group('preset · sequence steps (bytes 32-63) + full identity round-trip');
  {
    const steps = Array.from({ length: 32 }, (_, i) => ({ level: (i * 4) % 128, envelope: i % 2 === 0 }));
    const raw = serializePreset({ ...defaultPreset(), sequenceSteps: steps });
    check('32-step level+envelope sample', parsePreset(raw).sequenceSteps, steps);
  }
  {
    const p = defaultPreset();
    check('defaultPreset() full round-trip', parsePreset(serializePreset(p)), p);
  }

  // ══════════════════════════════════════════════════════════════════════
  // DRUMBEAT
  // ══════════════════════════════════════════════════════════════════════
  group('drumbeat · byte 2 — treble/distortion mode+value');
  for (const [mode, value] of [['off', 0], ['treble', 0], ['treble', 50], ['treble', 90], ['dist', 0], ['dist', 50], ['dist', 90]]) {
    const raw = serializeDrumbeat({ ...defaultDrumbeat(), trebleDistMode: mode, trebleDistValue: value });
    const d2 = parseDrumbeat(raw);
    check(`${mode}/${value}`, [d2.trebleDistMode, d2.trebleDistValue], [mode, mode === 'off' ? 0 : value]);
  }

  group('drumbeat · bytes 4-7 — bass/snare/hihat/perc BCD sound-vol');
  for (const voice of ['bass', 'snare', 'hihat', 'perc']) {
    for (let sound = 1; sound <= 9; sound++) {
      for (const volume of [0, 5, 9]) {
        const raw = serializeDrumbeat({ ...defaultDrumbeat(), [voice]: { sound, volume } });
        const d2 = parseDrumbeat(raw);
        check(`${voice} sound=${sound} vol=${volume}`, d2[voice], { sound, volume });
      }
    }
  }

  group('drumbeat · byte 3 — timebase');
  for (let tb = 0; tb <= 4; tb++) {
    const raw = serializeDrumbeat({ ...defaultDrumbeat(), timebase: tb });
    check(`timebase=${tb}`, parseDrumbeat(raw).timebase, tb);
  }

  group('drumbeat · bytes 9-11 ("unused") survive a round-trip (a real device holds 16, 32, 16 there)');
  {
    const raw = serializeDrumbeat({ ...defaultDrumbeat(), unused: [16, 32, 16] });
    check('bytes 9-11 written back', [raw[9], raw[10], raw[11]], [16, 32, 16]);
    check('parse keeps them', parseDrumbeat(raw).unused, [16, 32, 16]);
    check('default stays zero', Array.from(serializeDrumbeat(defaultDrumbeat()).slice(9, 12)), [0, 0, 0]);
  }

  group('drumbeat · steps (bytes 12-43) + full identity round-trip');
  {
    const steps = Array.from({ length: 32 }, (_, i) => ({
      bass: i % 4, snare: (i + 1) % 4, hihat: (i + 2) % 4, perc: (i + 3) % 4,
    }));
    const raw = serializeDrumbeat({ ...defaultDrumbeat(), steps });
    check('32-step 4-voice sample', parseDrumbeat(raw).steps, steps);
  }
  {
    const d = defaultDrumbeat();
    check('defaultDrumbeat() full round-trip', parseDrumbeat(serializeDrumbeat(d)), d);
  }

  // ══════════════════════════════════════════════════════════════════════
  // SYSTEM PARAMETERS + message framing — expected values taken from the
  // spec tables (MIDI Implementation, pp. 7-8, 11), not from the code.
  // ══════════════════════════════════════════════════════════════════════
  group('system · 14-byte dump parse (byte positions per spec)');
  {
    const dump = [150, 7, 133, 77, 0, 1, 5, 101, 2, 1, 16, 2, 4, 2];
    const p = parseSystem(dump);
    const expected = {
      activePreset: 150, activeDrumbeat: 7, globalTempo: 133, masterVolume: 77,
      presetSetsDmbt: 1, noiseGate: 5, balance: 101, tempoSource: 2, directAmp: 1,
      midiChannel: 16, sync: 2, progChangeBank: 4, midiDumpMode: 2,
    };
    for (const [k, v] of Object.entries(expected)) check(`${k}=${v}`, p[k], v);
    check('bytes 14+ stay undefined for a short 14-byte dump',
      ['pedal1Source', 'pedal2Source', 'midiDrums', 'footLeft', 'footCC83'].map(k => p[k]),
      [undefined, undefined, undefined, undefined, undefined]);
  }

  group('system · full 46-byte dump (what the device really sends)');
  {
    const dump = Array.from({ length: 46 }, (_, i) => i < 14 ? [150, 7, 133, 77, 0, 1, 5, 101, 2, 1, 16, 2, 4, 2][i] : 100 + i);
    const packed = pack7bit(dump);
    check('46 bytes pack to 53', packed.length, 53);
    const p = parseSystem(unpack7bit(packed));
    check('pedal sources / MIDI drums (bytes 14-16)', [p.pedal1Source, p.pedal2Source, p.midiDrums], [114, 115, 116]);
    check('foot switch bytes 32-45', [p.footLeft, p.footLeftHold, p.footRight, p.footRightHold, p.footCC64, p.footCC83], [132, 133, 134, 135, 136, 145]);
  }

  group('system · 7-bit packing of the 14-byte dump (14 → 16 bytes)');
  {
    const dump = [199, 255, 128, 99, 0, 1, 9, 101, 2, 1, 16, 2, 4, 2]; // includes bytes with the MS bit set
    const packed = pack7bit(dump);
    check('packed length', packed.length, 16);
    check('all packed bytes are 7-bit', packed.every(b => b <= 0x7F), true);
    check('unpack(pack(x)) identity', unpack7bit(packed), dump);
  }

  group('system · Single Parameter messages (buffer 2)');
  {
    const msg = buildSystemParam('masterVolume', 77); // addr 3, 77 = 0x4D → LS nibble 0xD, MS nibble 0x4
    check('masterVolume=77 frame', Array.from(msg), [0xF0, 0x00, 0x01, 0x37, 0x03, 0x01, 0x01, 0x02, 0x03, 0x0D, 0x04, 0xF7]);
    const fs = buildSystemParam('footCC83', 51); // addr 45, 51 = 0x33 (Last drumbeat)
    check('footCC83=51 frame', Array.from(fs), [0xF0, 0x00, 0x01, 0x37, 0x03, 0x01, 0x01, 0x02, 0x2D, 0x03, 0x03, 0xF7]);
    let threw = false;
    try { buildSystemParam('activePreset', 5); } catch { threw = true; }
    check('read-only field rejected', threw, true);
  }

  group('system · foot switch destinations (14 factory defaults confirmed on hardware)');
  {
    const byKey = Object.fromEntries(FOOT_SWITCH_FIELDS.map(f => [f.key, f]));
    const confirmed = {
      footLeft: 'Start/Stop drumbeat', footLeftHold: 'Preset decrement', footRight: 'Effect Switch (per preset)',
      footRightHold: 'Preset increment', footCC64: 'Amp Boost on/off', footCC65: 'Amp on/off', footCC66: 'Mod FX on/off',
      footCC67: 'Compression on/off', footCC68: 'Delay on/off', footCC69: 'Reverb on/off', footCC80: 'Start/Stop drumbeat',
      footCC81: 'Intro/End', footCC82: 'Tap tempo', footCC83: 'Last drumbeat',
    };
    for (const [k, name] of Object.entries(confirmed)) check(`${k} default = ${name}`, FOOT_DESTINATIONS[byKey[k].def], name);
    check('all 14 foot switch bytes at addresses 32-45', FOOT_SWITCH_FIELDS.map(f => f.addr), Array.from({ length: 14 }, (_, i) => 32 + i));
    check('destination count (57)', FOOT_DESTINATIONS.length, 57);
    check('count matches the preset Effect Switch list plus the first two entries', FOOT_DESTINATIONS.length - 2, EFFECT_SWITCH_OPTS.length);
    check('out-of-list value falls back to the default', clampSystemValue('footLeft', 99), 44);
  }

  group('system · pedal source defaults (manual: Pedal 1 = CC4, Pedal 2 = CC11; confirmed on hardware)');
  check('pedal defaults', [SYSTEM_FIELDS.find(f => f.key === 'pedal1Source').def, SYSTEM_FIELDS.find(f => f.key === 'pedal2Source').def], [4, 11]);

  group('system · value clamping / ranges per spec');
  check('masterVolume 150 → 99', clampSystemValue('masterVolume', 150), 99);
  check('globalTempo 10 → 30', clampSystemValue('globalTempo', 10), 30);
  check('globalTempo 999 → 250', clampSystemValue('globalTempo', 999), 250);
  check('balance 200 → 101', clampSystemValue('balance', 200), 101);
  check('midiChannel 17 (invalid) → default 0', clampSystemValue('midiChannel', 17), 0);
  check('progChangeBank 5 (invalid) → default 0', clampSystemValue('progChangeBank', 5), 0);
  check('noiseGate 9 ok', clampSystemValue('noiseGate', 9), 9);
  check('sync has the pedal\'s 4 options (---, in, out, i-o)', [0, 1, 2, 3, 4].map(v => clampSystemValue('sync', v)), [0, 1, 2, 3, 1]);
  check('balance labels', [0, 25, 50, 75, 100, 101].map(balanceLabel), ['P50', 'P25', 'EQU', 'D25', 'D50', 'SEP']);
  check('every field has a unique address', new Set(SYSTEM_FIELDS.map(f => f.addr)).size, SYSTEM_FIELDS.length);

  group('sysex framing · Save Complete / Factory Init / Request System');
  check('Save Complete without File Version (spec layout)',
    parseSysEx([0xF0, 0x00, 0x01, 0x37, 0x03, 0x11, 0xF7])?.type, 'saveComplete');
  check('Save Complete with File Version (tolerated)',
    parseSysEx([0xF0, 0x00, 0x01, 0x37, 0x03, 0x01, 0x11, 0xF7])?.type, 'saveComplete');
  check('Factory Init frame (WITH File Version — the pedal ignores it without)', Array.from(buildFactoryInit()), [0xF0, 0x00, 0x01, 0x37, 0x03, 0x01, 0x13, 0xF7]);
  check('Request System frame', Array.from(buildRequestSystem()), [0xF0, 0x00, 0x01, 0x37, 0x03, 0x01, MSG.REQUEST_SYSTEM, 0xF7]);
  {
    const framed = [0xF0, 0x00, 0x01, 0x37, 0x03, 0x01, MSG.SEND_RECV_SYSTEM, ...pack7bit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]), 0xF7];
    const parsed = parseSysEx(framed);
    check('System dump parses to type=system', parsed?.type, 'system');
    check('System dump payload round-trips', parsed?.raw?.slice(0, 14), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  }

  group('preset · full names line up with the 3-letter codes');
  check('one name per Mod Effect', MOD_EFFECT_NAMES.length, MOD_EFFECTS.length);
  check('one name per amp model', AMP_MODEL_NAMES.length, AMP_MODELS.length);
  check('Details enums: one name per code', [FX_ORDER_NAMES.length, MOD_SOURCE_NAMES.length, LFO_WAVE_NAMES.length, FILTER_TYPE_NAMES.length],
    [FX_ORDER.length, MOD_SOURCES.length, LFO_WAVES.length, FILTER_TYPE_LABELS.length]);
  check('Details spot checks', [FX_ORDER_NAMES[FX_ORDER.indexOf('AMC')], MOD_SOURCE_NAMES[MOD_SOURCES.indexOf('AUD')], MOD_SOURCE_NAMES[MOD_SOURCES.indexOf('S-N')], LFO_WAVE_NAMES[LFO_WAVES.indexOf('SAT')], FILTER_TYPE_NAMES[FILTER_TYPE_LABELS.indexOf('NOT')], FILTER_TYPE_NAMES[FILTER_TYPE_LABELS.indexOf('FLI')]],
    ['Amp > Mod FX > Comp', 'Audio Envelope', 'Sequencer + MIDI Note', 'Sawtooth', 'Notch', 'Flanger (inverted)']);
  check('one name per Effect Switch option', EFFECT_SWITCH_NAMES.length, EFFECT_SWITCH_OPTS.length);
  check('Effect Switch spot checks', ['BST', 'BM', 'BMC', 'BYP', 'SST', 'TPT', 'PRD'].map(c => EFFECT_SWITCH_NAMES[EFFECT_SWITCH_OPTS.indexOf(c)]),
    ['Amp Boost on/off', 'Boost + Mod FX', 'Boost + Mod FX + Compression', 'Bypass', 'Start/Stop drumbeat', 'Tap tempo', 'Preset decrement']);
  check('Mod Effect spot checks', [['TRE', 'Tremolo'], ['FCH', 'Flanger/Chorus'], ['TAL', 'Talk Box'], ['SFI', 'Sci-Fi']].map(([c]) => MOD_EFFECT_NAMES[MOD_EFFECTS.indexOf(c)]), ['Tremolo', 'Flanger/Chorus', 'Talk Box', 'Sci-Fi']);
  check('Amp spot checks', [['FBM', 'Fender Bassman'], ['JCM', 'Marshall JCM800'], ['AC3', 'Vox AC30'], ['5150', 'Peavey 5150 MkII'], ['CHI', 'Matchless Chieftain'], ['SVT', 'Ampeg SVT (bass)'], ['PRE', 'Clean Preamp']].map(([c]) => AMP_MODEL_NAMES[AMP_MODELS.indexOf(c)]), ['Fender Bassman', 'Marshall JCM800', 'Vox AC30', 'Peavey 5150 MkII', 'Matchless Chieftain', 'Ampeg SVT (bass)', 'Clean Preamp']);

  group('preset · byte 9 bit 5 (spec: always 0; factory preset 104 has it set) survives a round-trip');
  {
    const raw = serializePreset({ ...defaultPreset(), reservedBit5: true, modOn: true, fxOrder: 2 });
    check('bit 5 written', (raw[9] & 0x20) !== 0, true);
    const p = parsePreset(raw);
    check('bit 5 parsed + other flags intact', [p.reservedBit5, p.modOn, p.fxOrder], [true, true, 2]);
    check('default has it clear', (serializePreset(defaultPreset())[9] & 0x20), 0);
  }

  group('preset · Filter Type options per Mod Effect (spec p. 9 + manual "Filter Type")');
  {
    const expected = {
      FTR: [1,2,3,4,5], RFI: [1,2,3,4,5], FSE: [1,2,3,4,5], AFI: [1,2,3,4,5], PDL: [1,2,3,4,5], FFI: [1,2,3,4,5],
      FCH: [6,7], RFL: [6,7], ARP: [6,7], TAL: [6,7], FFL: [6,7],
      VIB: [8], TRE: [9], TSE: [9], VOL: [9], PAN: [9],
      ROT: [], SFI: [],
    };
    check('every Mod Effect is covered', Object.keys(expected).sort(), [...MOD_EFFECTS].sort());
    MOD_EFFECTS.forEach((name, i) => check(`${name} options`, filterTypeOptions(i), expected[name]));
    check('labels by raw value', [1, 5, 6, 7, 8, 9].map(v => FILTER_TYPE_LABELS[v]), ['LP2', 'HIP', 'FLA', 'FLI', 'VIB', 'VOL']);
    const d = defaultPreset();
    check('defaultPreset filterType is valid for its Mod Effect', filterTypeOptions(d.modEffect).includes(d.filterType), true);
  }

  group('identity reply · spec layout (MIDI Implementation p. 2)');
  {
    // F0 7E <ch> 06 02 | 00 01 37 | 01 00 (family) | 03 00 (member) | '3' '0' '2' | 00 | F7
    const reply = [0xF0, 0x7E, 0x00, 0x06, 0x02, 0x00, 0x01, 0x37, 0x01, 0x00, 0x03, 0x00, 0x33, 0x30, 0x32, 0x00, 0xF7];
    check('spec reply → version 302', parseIdentityReply(reply)?.version, '302');
    check('parseSysEx tags it identity with version', [parseSysEx(reply)?.type, parseSysEx(reply)?.version], ['identity', '302']);
    check('MIDI channel set (non-zero) still matches', parseIdentityReply([0xF0, 0x7E, 0x05, ...reply.slice(3)])?.version, '302');
    check('extra byte after F0 7E tolerated', parseIdentityReply([0xF0, 0x7E, 0x00, 0x7F, ...reply.slice(3)])?.version, '302');
    check('other manufacturer rejected', parseIdentityReply([0xF0, 0x7E, 0x00, 0x06, 0x02, 0x00, 0x20, 0x29, 0x01, 0x00, 0x03, 0x00, 0x31, 0x32, 0x33, 0x00, 0xF7]), null);
    check('other product rejected', parseIdentityReply([0xF0, 0x7E, 0x00, 0x06, 0x02, 0x00, 0x01, 0x37, 0x01, 0x00, 0x02, 0x00, 0x31, 0x32, 0x33, 0x00, 0xF7]), null);
    check('non-printable version → ?', parseIdentityReply([0xF0, 0x7E, 0x00, 0x06, 0x02, 0x00, 0x01, 0x37, 0x01, 0x00, 0x03, 0x00, 0x03, 0x00, 0x02, 0x00, 0xF7])?.version, '?');
  }

  group('syx files · build / split / read');
  {
    const preset = serializePreset({ ...defaultPreset(), amp: 17, modEffect: 9, speed: 120 });
    const drum   = serializeDrumbeat({ ...defaultDrumbeat(), tempo: 200 });
    const pFile = buildSyxFile('preset', preset);
    const dFile = buildSyxFile('drumbeat', drum);
    check('preset file frame', Array.from(pFile.slice(0, 7)), [0xF0, 0x00, 0x01, 0x37, 0x03, 0x01, MSG.SEND_RECV_PRESET]);
    check('preset file length (7 header + 74 packed + EOX)', pFile.length, 82);
    check('drumbeat file frame', Array.from(dFile.slice(0, 7)), [0xF0, 0x00, 0x01, 0x37, 0x03, 0x01, MSG.SEND_RECV_DRUMBEAT]);
    check('drumbeat file length (7 header + 51 packed + EOX)', dFile.length, 59);
    check('preset round-trips through file', Array.from(readSyxFile(pFile, 'preset').items[0]), Array.from(preset));
    check('drumbeat round-trips through file', Array.from(readSyxFile(dFile, 'drumbeat').items[0]), Array.from(drum));

    const bank = Uint8Array.from([...pFile, 0x00 /* stray byte between messages */, ...dFile, ...buildSendPresetEditBuf(preset)]);
    check('split finds 3 messages', splitSysEx(bank).length, 3);
    const asPresets = readSyxFile(bank, 'preset');
    check('preset read: send + edit-buffer accepted, drumbeat skipped', [asPresets.items.length, asPresets.skipped], [2, 1]);
    const asDrums = readSyxFile(bank, 'drumbeat');
    check('drumbeat read: only the drumbeat', [asDrums.items.length, asDrums.skipped], [1, 2]);
    check('truncated message skipped', readSyxFile(pFile.slice(0, 40), 'preset').items.length, 0);
  }

  group('syx dump files · all slots in order');
  {
    const presets = new Map(), drumbeats = new Map();
    for (let i = 0; i < 200; i++) {
      presets.set(i, { raw: serializePreset({ ...defaultPreset(), amp: i % 40, speed: i % 100, presetTempo: 60 + (i % 100) }) });
      drumbeats.set(i, { raw: serializeDrumbeat({ ...defaultDrumbeat(), tempo: 60 + (i % 150) }) });
    }
    const all = buildDumpSyx(presets, drumbeats, 'all');
    check('"all" dump: no missing slots', [all.missing.preset.length, all.missing.drumbeat.length], [0, 0]);
    check('"all" dump: 400 messages', splitSysEx(all.bytes).length, 400);
    const back = readSyxFile(all.bytes, 'preset').items;
    check('presets come back in slot order, byte-exact', back.every((r, i) => Array.from(r).join() === Array.from(presets.get(i).raw).join()), true);
    const backD = readSyxFile(all.bytes, 'drumbeat').items;
    check('drumbeats come back in slot order, byte-exact', backD.every((r, i) => Array.from(r).join() === Array.from(drumbeats.get(i).raw).join()), true);
    check('"all" dump: 200 presets + 200 drumbeats', [back.length, backD.length], [200, 200]);
    check('presets-only dump has 200 messages', splitSysEx(buildDumpSyx(presets, drumbeats, 'preset').bytes).length, 200);
    presets.delete(7); presets.delete(150);
    check('missing slots are reported', buildDumpSyx(presets, drumbeats, 'preset').missing.preset, [7, 150]);
    check('drumbeat dump unaffected by missing presets', buildDumpSyx(presets, drumbeats, 'drumbeat').missing.preset, []);
  }

  group('formatBytes · text forms of a SysEx message');
  {
    const b = Uint8Array.from([0xF0, 0x00, 0x0B, 0xFF, 0xF7]);
    check('spaced', formatBytes(b), 'F0 00 0B FF F7');
    check('plain', formatBytes(b, 'plain'), 'F0000BFFF7');
    check('0x array', formatBytes(b, '0x'), '0xF0, 0x00, 0x0B, 0xFF, 0xF7');
    check('decimal', formatBytes(b, 'decimal'), '240, 0, 11, 255, 247');
  }

  group('famous presets · data module');
  {
    const all = FAMOUS_SONGS.flatMap(s => s.presets);
    check('6 presets in 4 songs', [all.length, FAMOUS_SONGS.length], [6, 4]);
    check('only John Mayer and Green Day', FAMOUS_SONGS.map(s => s.artist.split(' · ')[0]), ['John Mayer', 'John Mayer', 'John Mayer', 'Green Day']);
    check('every preset is 64 bytes', all.every(p => p.raw.length === 64), true);
    check('every preset survives parse → serialize unchanged',
      all.every(p => Array.from(serializePreset(parsePreset(p.raw))).join() === Array.from(p.raw).join()), true);
    const by = id => all.find(p => p.id === id);
    check('FAQ settings: Heartbreak Warfare riff = preset 82, drumbeat 28, 97 BPM', [by('hbw').base.slot, by('hbw').raw[31], by('hbw').raw[30]], [82, 28, 97]);
    check('FAQ settings: Heartbreak Warfare solo = preset 51', by('hbws').base.slot, 51);
    check('FAQ settings: I Don\'t Trust Myself = presets 73 + 160, drumbeat 1, 84 BPM', [by('idtm1').base.slot, by('idtm2').base.slot, by('idtm1').raw[31], by('idtm2').raw[31], by('idtm1').raw[30], by('idtm2').raw[30]], [73, 160, 1, 1, 84, 84]);
    check('FAQ settings: Bigger Than My Body = preset 150', by('btmb').base.slot, 150);
    check('preset ids are unique', new Set(all.map(p => p.id)).size, all.length);
    check('every preset carries its 44-byte drumbeat', all.every(p => p.drumbeat?.length === 44), true);
    check('every drumbeat survives parse → serialize unchanged',
      all.every(p => Array.from(serializeDrumbeat(parseDrumbeat(p.drumbeat))).join() === Array.from(p.drumbeat).join()), true);
    check('every drumbeat is a named factory drumbeat', all.every(p => p.drumbeatSlot !== undefined && p.drumbeatName), true);
    check('drumbeatSlot matches the preset\'s drumbeat byte', all.filter(p => p.drumbeatSlot !== undefined).every(p => p.raw[31] === p.drumbeatSlot), true);
    check('factory-derived presets keep their base slot', all.filter(p => p.base).map(p => `${p.id}:${p.base.slot}`), ['btmb:150', 'idtm1:73', 'idtm2:160', 'hbw:82', 'hbws:51', 'bobd:140']);
    check('tempo byte is in range 30-250', all.every(p => p.raw[30] >= 30 && p.raw[30] <= 250), true);
    check('drumbeat byte is 0-199', all.every(p => p.raw[31] <= 199), true);
    check('every preset is a factory preset with an official name', all.every(p => p.base && p.base.name), true);
  }

  return groups;
}
