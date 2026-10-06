/**
 * AdrenaLinn III — System Parameters data structure
 * Reference: MIDI Implementation doc, "System Parameters Data Structure".
 *
 * System parameters are global (not per-preset). Per the User's Manual they are
 * saved on the device automatically when changed.
 *
 * The spec lists 46 addressable bytes (0-45) but documents the "Send/Receive
 * System Parameters" dump (ID 15) as only 14 bytes. A real device reports all 46
 * (confirmed on hardware), so every field is readable. parseSystem() still
 * leaves any byte the device did not report as `undefined` instead of inventing
 * a value, in case a firmware sends the short 14-byte form.
 */
import { buildSingleParam } from './sysex.js';
import { EFFECT_SWITCH_NAMES } from './presetData.js';

const opts = labels => labels.map((label, value) => ({ value, label }));
const ccOptions = () => [
  { value: 0, label: 'None' },
  ...Array.from({ length: 99 }, (_, i) => ({ value: i + 1, label: `CC ${i + 1}` })),
];

// Balance/SEP: 0 (P50) .. 50 (EQU) .. 100 (D50), 101 (SEP)
export function balanceLabel(v) {
  if (v === 101) return 'SEP';
  if (v === 50) return 'EQU';
  return v < 50 ? `P${50 - v}` : `D${v - 50}`;
}

// kind: 'enum' (select), 'range' (slider + number), 'raw' (number, undocumented value list)
export const SYSTEM_FIELDS = [
  // ── Read via the 14-byte dump (bytes 0-13) ────────────────────────────────
  { key: 'activePreset',   addr: 0,  group: 'active', label: 'Active Preset',   kind: 'range', min: 0,  max: 199, def: 0,   readOnly: true },
  { key: 'activeDrumbeat', addr: 1,  group: 'active', label: 'Active Drumbeat', kind: 'range', min: 0,  max: 199, def: 0,   readOnly: true },
  { key: 'globalTempo',    addr: 2,  group: 'global', label: 'Global Tempo',    kind: 'range', min: 30, max: 250, def: 100, unit: 'BPM' },
  { key: 'masterVolume',   addr: 3,  group: 'global', label: 'Master Volume',   kind: 'range', min: 0,  max: 99,  def: 60 },
  { key: 'presetSetsDmbt', addr: 5,  group: 'global', label: 'Preset Sets Drumbeat', kind: 'enum', def: 1, options: opts(['Off', 'On']) },
  { key: 'noiseGate',      addr: 6,  group: 'global', label: 'Noise Gate',      kind: 'enum', def: 2,
    options: [{ value: 0, label: 'Off' }, ...Array.from({ length: 9 }, (_, i) => ({ value: i + 1, label: `On ${i + 1}` }))] },
  { key: 'balance',        addr: 7,  group: 'global', label: 'Balance / Separate Outs', kind: 'range', min: 0, max: 101, def: 50, format: balanceLabel },
  { key: 'tempoSource',    addr: 8,  group: 'global', label: 'Tempo Source',    kind: 'enum', def: 1, options: opts(['System tempo', 'Drumbeat tempo', 'Preset tempo']) },
  { key: 'directAmp',      addr: 9,  group: 'global', label: 'Direct / Amp',    kind: 'enum', def: 0, options: opts(['Direct (normal EQ)', 'Amp (EQ for guitar amp)']) },
  { key: 'midiChannel',    addr: 10, group: 'midi',   label: 'MIDI Channel',    kind: 'enum', def: 0,
    options: [{ value: 0, label: 'ALL' }, ...Array.from({ length: 16 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))] },
  { key: 'sync',           addr: 11, group: 'midi',   label: 'MIDI Sync',       kind: 'enum', def: 1,
    // Four options on the pedal (---, in, out, i-o) → 0..3. The MIDI doc lists only three and describes 2 as
    // "in + out"; on hardware 2 = out only (sends clock, ignores ours) and 3 = in-out (also follows ours).
    options: opts(['--- (no MIDI clock)', 'in (follow incoming clock)', 'out (send clock)', 'in-out (follow and send)']) },
  { key: 'progChangeBank', addr: 12, group: 'midi',   label: 'Program Change Bank', kind: 'enum', def: 0,
    options: opts(['Presets 0-99', 'Presets 100-199', 'Drumbeats 0-99', 'Drumbeats 100-199', 'None']) },
  { key: 'midiDumpMode',   addr: 13, group: 'midi',   label: 'MIDI Dump Mode',  kind: 'enum', def: 0,
    options: opts(['Dump active preset', 'Dump active drumbeat', 'Dump all']) },

  // ── Bytes 14+ (documented only as writable; the device does report them) ───
  { key: 'pedal1Source',   addr: 14, group: 'midi',   label: 'Pedal 1 Source',  kind: 'enum', def: 4,  options: ccOptions() },
  { key: 'pedal2Source',   addr: 15, group: 'midi',   label: 'Pedal 2 Source',  kind: 'enum', def: 11, options: ccOptions() },
  { key: 'midiDrums',      addr: 16, group: 'midi',   label: 'MIDI Drums',      kind: 'enum', def: 0, options: opts(['Disabled', 'Enabled']) },
];

// Foot switch destinations, in the order of the User's Manual ("Foot Switch
// Destination", p. 67-68). The spec doesn't number them; the value of each
// destination is its position in this list. Confirmed on hardware (2026-10-02)
// for all 14 factory defaults: Effect Switch=1, Boost..Reverb=2..7, Start/Stop=44,
// Intro/End=45, Tap Tempo=48, Last Drumbeat=51, Preset++=55, Preset--=56. The
// positions in between rely on the manual's order — it is the same order as the
// preset's Effect Switch list (EFFECT_SWITCH_OPTS = this list minus the first two).
export const FOOT_DESTINATIONS = ['No assignment', 'Effect Switch (per preset)', ...EFFECT_SWITCH_NAMES];

// Foot switch assignment bytes (32-45) with their factory defaults (manual p. 66)
export const FOOT_SWITCH_FIELDS = [
  ['footLeft',      32, 'Left Foot',        44],
  ['footLeftHold',  33, 'Left Foot Hold',   56],
  ['footRight',     34, 'Right Foot',        1],
  ['footRightHold', 35, 'Right Foot Hold',  55],
  ...[[64, 2], [65, 3], [66, 4], [67, 5], [68, 6], [69, 7], [80, 44], [81, 45], [82, 48], [83, 51]]
    .map(([cc, def], i) => [`footCC${cc}`, 36 + i, `MIDI Controller ${cc}`, def]),
].map(([key, addr, label, def]) => ({
  key, addr, label, group: 'footswitch', kind: 'enum', def,
  options: FOOT_DESTINATIONS.map((label, value) => ({ value, label })),
}));

export const ALL_SYSTEM_FIELDS = [...SYSTEM_FIELDS, ...FOOT_SWITCH_FIELDS];
const BY_KEY = new Map(ALL_SYSTEM_FIELDS.map(f => [f.key, f]));
export const systemField = key => BY_KEY.get(key);

// Bytes in a full System dump as sent by the device (spec says 14, hardware sends 46).
export const SYSTEM_BYTES = 46;

// ── Parse the dump (46 bytes, or the spec's 14) → partial object ──────────────
// Only fields whose byte is present in `raw` are set; the rest stay undefined.
export function parseSystem(raw) {
  const out = {};
  for (const f of ALL_SYSTEM_FIELDS) {
    if (f.addr < raw.length) out[f.key] = raw[f.addr];
  }
  return out;
}

export function clampSystemValue(key, value) {
  const f = BY_KEY.get(key);
  if (!f) throw new Error(`Unknown system field: ${key}`);
  const v = Math.round(Number(value));
  if (!Number.isFinite(v)) return f.def ?? 0;
  if (f.kind === 'enum') {
    return f.options.some(o => o.value === v) ? v : (f.def ?? f.options[0].value);
  }
  return Math.max(f.min, Math.min(f.max, v));
}

// ── Single-Parameter message (buffer 2 = System) ──────────────────────────────
export function buildSystemParam(key, value) {
  const f = BY_KEY.get(key);
  if (!f) throw new Error(`Unknown system field: ${key}`);
  if (f.readOnly) throw new Error(`System field is read-only: ${key}`);
  return buildSingleParam(2, f.addr, clampSystemValue(key, value));
}
