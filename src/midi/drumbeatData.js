/**
 * AdrenaLinn III — Drumbeat Data Structure
 * Maps the 44-byte binary drumbeat to a named JS object and back.
 * Reference: MIDI Implementation doc, "Drumbeat Data Structure"
 *
 * Byte layout (44 bytes total):
 *  0   Volume          0-99
 *  1   FX Send         0-99(delay) / 100-199(input) / 200-249(reverb)
 *  2   Treble/Distort  0=off / 1-10=treble t0..t90 / 11-20=distortion d0..d90
 *  3   Timebase        0=8n / 1=8t / 2=16n / 3=16h / 4=16s
 *  4   Bass sound-vol  BCD: hi-nibble=sound(1-9), lo-nibble=volume(0-9)
 *  5   Snare sound-vol BCD same
 *  6   Hihat sound-vol BCD same
 *  7   Perc sound-vol  BCD same
 *  8   Tempo           30-250
 *  9-11  Unused
 * 12-43 Steps: 32 bytes, bits 0-1=bass, 2-3=snare, 4-5=hihat, 6-7=perc
 */

// ── Timebase options ──────────────────────────────────────────────────────────
export const TIMEBASES = ['8n','8t','16n','16h','16s'];
export const TIMEBASE_LABELS = [
  '1/8 Notes','1/8 Triplets','1/16 Notes','1/16 Half-swing','1/16 Swing'
];

// ── Step counts per timebase ──────────────────────────────────────────────────
// 8n → 16 active steps (cols 1,3 only)
// 8t → 24 active steps (every 4th step disabled)
// 16n/16h/16s → 32 steps all active
export function activeStepCount(timebase) {
  if (timebase === 0) return 16;
  if (timebase === 1) return 24;
  return 32;
}

// Map a logical "Nth active step" index (0..activeStepCount(timebase)-1, as
// counted by the MIDI clock) to the physical 0-31 grid column it lands on —
// the inverse of "is this physical column active for this timebase". Used to
// drive the playback cursor so it walks the same active cells the grid grays
// out, instead of a naive 0..N range that skips inactive columns entirely.
export function physicalStepIndex(timebase, logicalStep) {
  if (timebase === 0) return logicalStep * 2;                    // 1/8n: every other column
  if (timebase === 1) return logicalStep + Math.floor(logicalStep / 3); // 1/8t: every 4th column skipped
  return logicalStep;                                            // 1/16*: 1:1
}

// ── Bass drum sounds ──────────────────────────────────────────────────────────
export const BASS_SOUNDS = [
  'Deep kick (room)',
  'Hard kick (gated reverb)',
  '70s kick (room)',
  'Tight 80s kick',
  'Loose vintage kick',
  'Hard punchy kick',
  'TR-909 gulp kick',
  'TR-808 sine kick',
  'Medium deep kick (click)',
];

// ── Snare sounds ───────────────────────────────────────────────────────────────
export const SNARE_SOUNDS = [
  'Rimshot (room)',
  'Gated reverb snare',
  'Deep full snare',
  'Metal snare',
  'Brush snare',
  '80s snare',
  'TR-909 loose snare',
  'Soft cross-stick',
  'Ringy vintage snare',
];

// ── Hi-hat sounds ──────────────────────────────────────────────────────────────
export const HIHAT_SOUNDS = [
  'Metallic closed (shank)',
  'Breathy loose hihat',
  'Metallic closed hihat',
  'Loose open hihat',
  'TR-808 closed hihat',
  'Tight closed tick',
  'Shaker',
  'Ride cymbal',
  'Tambourine',
];

// ── Percussion banks (5 banks × 3 sounds) ─────────────────────────────────────
export const PERC_BANKS = [
  ['Soft shaker', 'Loud shaker', 'Breathy open hihat'],
  ['TR-808 claps', 'Ambient synth FX', 'TR-808 open hihat'],
  ['Tom low', 'Tom mid', 'Tambourine'],
  ['Triangle mute', 'Triangle open', 'Cowbell'],
  ['Conga high tone', 'Conga high slap', 'Conga low tone'],
];

// ── FX Send display helpers ────────────────────────────────────────────────────
export function fxSendLabel(raw) {
  if (raw >= 200) return `Reverb ${raw - 200}%`;
  if (raw >= 100) return `Input ${raw - 100}%`;
  return `Delay ${raw}%`;
}

// ── Parse 44-byte raw drumbeat → JS object ────────────────────────────────────
export function parseDrumbeat(raw) {
  if (raw.length < 44) {
    // Pad if too short
    const padded = new Uint8Array(44);
    padded.set(raw.slice(0, Math.min(raw.length, 44)));
    raw = padded;
  }

  const b = raw;

  // Treble/Distortion decode
  let trebleDistMode = 'off', trebleDistValue = 0;
  if (b[2] >= 1 && b[2] <= 10) {
    trebleDistMode  = 'treble';
    trebleDistValue = (b[2] - 1) * 10; // 0-90
  } else if (b[2] >= 11 && b[2] <= 20) {
    trebleDistMode  = 'dist';
    trebleDistValue = (b[2] - 11) * 10; // 0-90
  }

  // BCD sound-vol decode: hi nibble = sound(1-9), lo nibble = vol(0-9).
  // No floor here: encodeSV writes the hi-nibble back verbatim, so flooring
  // a genuine 0 (e.g. a factory "Blank" slot, which is all-zero bytes) up
  // to 1 would silently change it to 1 the next time this drumbeat is
  // resent (e.g. after editing an unrelated field triggers a full resend).
  const decodeSV = byte => ({
    sound:  (byte >> 4) & 0x0F,
    volume: byte & 0x0F,
  });

  // Steps: 32 bytes, 2 bits per voice
  const steps = [];
  for (let i = 0; i < 32; i++) {
    const byte = b[12 + i] ?? 0;
    steps.push({
      bass:  byte & 0x03,        // 0=off,1=soft,2=med,3=loud
      snare: (byte >> 2) & 0x03,
      hihat: (byte >> 4) & 0x03,
      perc:  (byte >> 6) & 0x03, // 0=off,1=perc1,2=perc2,3=perc3
    });
  }

  return {
    volume:       b[0],
    fxSend:       b[1],
    trebleDistMode,
    trebleDistValue,
    timebase:     b[3] & 0x0F,
    bass:         decodeSV(b[4]),
    snare:        decodeSV(b[5]),
    hihat:        decodeSV(b[6]),
    perc:         decodeSV(b[7]),
    tempo:        b[8],
    // Bytes 9-11 are "unused" in the spec but a real device holds non-zero values
    // there (observed 16, 32, 16) — kept so a resend doesn't silently change them
    unused:       [b[9], b[10], b[11]],
    steps,
  };
}

// ── Serialize JS drumbeat → 44-byte Uint8Array ────────────────────────────────
export function serializeDrumbeat(d) {
  const b = new Uint8Array(44);

  b[0] = d.volume   ?? 80;
  b[1] = d.fxSend   ?? 0;

  // Treble/Dist encode
  if (d.trebleDistMode === 'treble') {
    b[2] = 1 + Math.round((d.trebleDistValue ?? 90) / 10);
  } else if (d.trebleDistMode === 'dist') {
    b[2] = 11 + Math.round((d.trebleDistValue ?? 0) / 10);
  } else {
    b[2] = 0;
  }

  b[3] = d.timebase ?? 2; // default 16n

  // BCD sound-vol encode
  const encodeSV = sv =>
    (((sv?.sound ?? 1) & 0x0F) << 4) | ((sv?.volume ?? 7) & 0x0F);

  b[4] = encodeSV(d.bass);
  b[5] = encodeSV(d.snare);
  b[6] = encodeSV(d.hihat);
  b[7] = encodeSV(d.perc);
  b[8] = d.tempo ?? 100;
  const unused = d.unused ?? [0, 0, 0];
  b[9] = unused[0] & 0xFF; b[10] = unused[1] & 0xFF; b[11] = unused[2] & 0xFF;

  // Steps
  const steps = d.steps ?? defaultSteps();
  for (let i = 0; i < 32; i++) {
    const s = steps[i] ?? { bass:0, snare:0, hihat:0, perc:0 };
    b[12 + i] =
      (s.bass  & 0x03)       |
      ((s.snare & 0x03) << 2) |
      ((s.hihat & 0x03) << 4) |
      ((s.perc  & 0x03) << 6);
  }

  return b;
}

// ── Default blank drumbeat ─────────────────────────────────────────────────────
export function defaultDrumbeat() {
  return {
    volume: 80,
    fxSend: 0,
    trebleDistMode: 'off',
    trebleDistValue: 0, // meaningless while mode is 'off' (byte 2 is always 0 then) — 0 keeps the object honest about what actually round-trips through the device
    timebase: 2,       // 16n
    bass:  { sound: 1, volume: 7 },
    snare: { sound: 1, volume: 7 },
    hihat: { sound: 1, volume: 6 },
    perc:  { sound: 1, volume: 5 },
    tempo: 100,
    unused: [0, 0, 0],
    steps: defaultSteps(),
  };
}

export function defaultSteps() {
  return Array.from({ length: 32 }, () => ({
    bass: 0, snare: 0, hihat: 0, perc: 0,
  }));
}

// ── SysEx drumbeat builders (add to sysex.js equivalents) ─────────────────────
import { pack7bit, MSG, RLD_ID, PRODUCT_ID, FILE_VERSION } from './sysex.js';

function dbHeader(msgId) {
  return [0xF0, ...RLD_ID, PRODUCT_ID, FILE_VERSION, msgId];
}

export function buildRequestDrumbeatEditBuf() {
  return Uint8Array.from([...dbHeader(MSG.REQUEST_DB_EDITBUF), 0xF7]);
}

export function buildSendDrumbeatEditBuf(rawBytes) {
  const packed = pack7bit(Array.from(rawBytes));
  return Uint8Array.from([...dbHeader(MSG.SEND_RECV_DB_EDITBUF), ...packed, 0xF7]);
}
