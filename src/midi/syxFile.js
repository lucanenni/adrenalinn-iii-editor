/**
 * .syx file helpers — pure functions, no DOM.
 * A .syx file is just SysEx messages (F0 … F7) concatenated.
 */
import { parseSysEx, buildSendPreset, buildSendDrumbeat } from './sysex.js';

// Split a byte stream into complete F0…F7 messages (ignores bytes outside them).
export function splitSysEx(bytes) {
  const out = [];
  let cur = null;
  for (const b of bytes) {
    if (b === 0xF0) cur = [b];
    else if (cur) {
      cur.push(b);
      if (b === 0xF7) { out.push(cur); cur = null; }
    }
  }
  return out;
}

// Bytes of a .syx file holding one preset/drumbeat as a Send (ID 2/3) message.
export function buildSyxFile(type, raw) {
  return type === 'preset' ? buildSendPreset(raw) : buildSendDrumbeat(raw);
}

// All presets or drumbeats found in a .syx file, in file order. Edit-buffer
// messages are accepted too (same payload). Everything else is skipped and counted.
export function readSyxFile(bytes, type) {
  const items = [];
  let skipped = 0;
  for (const msg of splitSysEx(bytes)) {
    const parsed = parseSysEx(msg);
    const kind = parsed?.type;
    const wanted = type === 'preset'
      ? kind === 'preset' || kind === 'presetEditBuf'
      : kind === 'drumbeat' || kind === 'drumbeatEditBuf';
    const expectedLen = type === 'preset' ? 64 : 44;
    // 7 → 8 byte packing pads the last group, so unpacked data can be a few bytes longer.
    if (wanted && parsed.raw.length >= expectedLen) items.push(Uint8Array.from(parsed.raw.slice(0, expectedLen)));
    else skipped++;
  }
  return { items, skipped };
}

// ── Text form of a byte array, for pasting into a MIDI pedalboard / sequencer / code ──
export const BYTE_FORMATS = {
  spaced:  'HEX, space-separated (F0 00 01 …)',
  plain:   'HEX, continuous (F00001…)',
  '0x':    'Array of 0x.. values (C / JS)',
  decimal: 'Decimal values',
};

export function formatBytes(bytes, fmt = 'spaced') {
  const hex = b => b.toString(16).padStart(2, '0').toUpperCase();
  const a = Array.from(bytes);
  switch (fmt) {
    case 'plain':   return a.map(hex).join('');
    case '0x':      return a.map(b => '0x' + hex(b)).join(', ');
    case 'decimal': return a.join(', ');
    default:        return a.map(hex).join(' ');
  }
}

// ── Dump file: every slot in order, as Send (ID 2/3) messages back to back ─────────────
// The messages carry no slot number, so a dump file only means something if all 200 slots
// are present and in order — slot N is the Nth message of its kind. `which` is
// 'preset', 'drumbeat' or 'all' (200 presets, then 200 drumbeats). Returns the bytes and the
// slots that are missing from the given maps; the caller should not offer a file with gaps.
export function buildDumpSyx(presets, drumbeats, which) {
  const missing = { preset: [], drumbeat: [] };
  const parts = [];
  for (const [type, map] of [['preset', presets], ['drumbeat', drumbeats]]) {
    if (which !== 'all' && which !== type) continue;
    for (let slot = 0; slot < 200; slot++) {
      const rec = map.get(slot);
      if (rec) parts.push(buildSyxFile(type, rec.raw)); else missing[type].push(slot);
    }
  }
  const bytes = new Uint8Array(parts.reduce((n, m) => n + m.length, 0));
  let o = 0;
  for (const m of parts) { bytes.set(m, o); o += m.length; }
  return { bytes, missing };
}
