/**
 * AdrenaLinn III Preset Data Structure
 * Maps the 64-byte binary preset to a named JS object and back.
 * Reference: MIDI Implementation doc, "Preset Data Structure"
 */

// ── Mod Effect types (0-17) ─────────────────────────────────────────────────
export const MOD_EFFECTS = [
  'TRE','FTR','FCH','ROT','VIB','RFI','RFL',
  'TSE','FSE','ARP','AFI','TAL','VOL','PAN','PDL','FFI','FFL','SFI'
];

// ── Amp models (0-39) ───────────────────────────────────────────────────────
export const AMP_MODELS = [
  'FBM','FDR','FTR','FDL','FCH',
  'JTM','MPL','JCM','JC2',
  'AC3','AC1','JAZ','HIW',
  'BM2','REC','SOL','UBE','DIE','ENG','5150','ECS','BUD','CHI',
  'INT','MID','SIZ','MPI','SCO','CRI','HOL','BIT','NEC','SLD',
  'ACS','SVT','GAL','SWR',
  'FUZ','OCT','PRE'
];

// Full names, same order as MOD_EFFECTS (User's Manual, "Mod FX: Mod Effect & Variation Details")
export const MOD_EFFECT_NAMES = [
  'Tremolo','Filter Tremolo','Flanger/Chorus','Rotary','Vibrato','Random Filter','Random Flanger',
  'Tremolo Sequence','Filter Sequence','Arpeggiator Sequence','Auto Filter','Talk Box',
  'Volume Envelope','Auto Pan','Wah Pedal','Fixed Filter','Fixed Flanger','Sci-Fi',
];

// Full names, same order as AMP_MODELS (User's Manual, "Amp Models: Settings")
export const AMP_MODEL_NAMES = [
  'Fender Bassman','Fender Deluxe Reverb','Fender Twin Reverb',
  'Fender Tweed Deluxe','Fender Champ',
  'Marshall JTM-45','Marshall Plexi 100W','Marshall JCM800','Marshall JCM2000',
  'Vox AC30','Vox AC15','Roland Jazz Chorus','Hiwatt DR103',
  'Mesa Boogie Mark II','Mesa Boogie Dual Rectifier','Soldano SLO-100',
  'Bogner Uberschall','Diezel VH4','ENGL Powerball','Peavey 5150 MkII',
  'Bogner Ecstasy','Budda Twinmaster','Matchless Chieftain',
  'RLD Intense','RLD Mid','RLD Sizzle','RLD Plexi (AIII)','RLD Scoop',
  'RLD Crisp','RLD Hollow','RLD Bite','RLD Neck','RLD Solid',
  'Acoustic 360 (bass)','Ampeg SVT (bass)','Gallien-Krueger 800RB (bass)','SWR SM-500 (bass)',
  'Fuzz Tone','Octave Fuzz','Clean Preamp',
];

// ── FX Order ────────────────────────────────────────────────────────────────
export const FX_ORDER = ['MCA','CAM','MAC','AMC'];

// ── Modulation Sources (0-10) ───────────────────────────────────────────────
export const MOD_SOURCES = ['---','SEQ','EG','LFO','AUD','HLD','E-L','E-H','L-S','NOT','S-N'];

// ── LFO Waveforms (0-4) ─────────────────────────────────────────────────────
export const LFO_WAVES = ['TRI','SIN','SAT','PUL','RAN'];

// ── Effect Switch options ────────────────────────────────────────────────────
export const EFFECT_SWITCH_OPTS = [
  'BST','APS','MOD','CMP','DLY','REV',
  'BM','BC','BD','BR','AM','AC','AD','AR',
  'MC','MD','MR','CD','CR','DR',
  'BMC','BMD','BMR','BCD','BCR','BDR',
  'AMC','AMD','AMR','ACD','ACR','ADR',
  'MCD','MCR','MDR','CDR',
  'BYP','dru','BA','SN','HA','PE',
  'SST','INE','RES','STP','TPT','TPD','TUN','DBL','PRL','DBI','DBD','PRI','PRD'
];

// Full names, same order as EFFECT_SWITCH_OPTS (User's Manual, "Foot Switch Destination" without the first two entries)
export const EFFECT_SWITCH_NAMES = [
  'Amp Boost on/off',
  'Amp on/off',
  'Mod FX on/off',
  'Compression on/off',
  'Delay on/off',
  'Reverb on/off',
  'Boost + Mod FX',
  'Boost + Compression',
  'Boost + Delay',
  'Boost + Reverb',
  'Amp + Mod FX',
  'Amp + Compression',
  'Amp + Delay',
  'Amp + Reverb',
  'Mod FX + Compression',
  'Mod FX + Delay',
  'Mod FX + Reverb',
  'Compression + Delay',
  'Compression + Reverb',
  'Delay + Reverb',
  'Boost + Mod FX + Compression',
  'Boost + Mod FX + Delay',
  'Boost + Mod FX + Reverb',
  'Boost + Compression + Delay',
  'Boost + Compression + Reverb',
  'Boost + Delay + Reverb',
  'Amp + Mod FX + Compression',
  'Amp + Mod FX + Delay',
  'Amp + Mod FX + Reverb',
  'Amp + Compression + Delay',
  'Amp + Compression + Reverb',
  'Amp + Delay + Reverb',
  'Mod FX + Compression + Delay',
  'Mod FX + Compression + Reverb',
  'Mod FX + Delay + Reverb',
  'Compression + Delay + Reverb',
  'Bypass',
  'All drums mute',
  'Bass mute',
  'Snare mute',
  'Hihat mute',
  'Percussion mute',
  'Start/Stop drumbeat',
  'Intro/End',
  'Start drumbeat',
  'Stop drumbeat',
  'Tap tempo',
  'Tap delay',
  'Tuner/Mute',
  'Last drumbeat',
  'Last preset',
  'Drumbeat increment',
  'Drumbeat decrement',
  'Preset increment',
  'Preset decrement',
];

// Full names for the Details enums (same order as FX_ORDER / MOD_SOURCES / LFO_WAVES;
// FILTER_TYPE_NAMES is indexed by the raw filter-type value 0-9, like FILTER_TYPE_LABELS)
export const FX_ORDER_NAMES = ['Mod FX > Comp > Amp', 'Comp > Amp > Mod FX', 'Mod FX > Amp > Comp', 'Amp > Mod FX > Comp'];
export const MOD_SOURCE_NAMES = [
  'None', 'Sequencer', 'Envelope Generator', 'LFO', 'Audio Envelope', 'Hold Peak',
  'Env Gen × LFO', 'Env Gen × Hold Peak', 'LFO × Sequencer', 'MIDI Note Number', 'Sequencer + MIDI Note',
];
export const LFO_WAVE_NAMES = ['Triangle', 'Sine', 'Sawtooth', 'Pulse (50% square)', 'Random (stepped)'];
export const FILTER_TYPE_NAMES = [
  'Not used', 'Lowpass 2-pole', 'Lowpass 4-pole', 'Bandpass', 'Notch', 'Highpass',
  'Flanger', 'Flanger (inverted)', 'Vibrato', 'Volume',
];

// ── Pedal Destination options ────────────────────────────────────────────────
export const PEDAL_DESTS = [
  '---','MFD','MST','MSP','MDE','MFR','MRE',
  'AVO','ADR','ABS','AMD','ATR',
  'COP','DVO','DTI','DRE','DST','RVO','DRV','DRS','DRT','TPO'
];

// ── Filter Type (byte 3, hi nibble) ──────────────────────────────────────────
// The raw value is global (0-9) but which values are valid depends on the Mod
// Effect (MIDI Implementation p. 9; User's Manual, "Filter Type"):
//   1-5 LP2 LP4 BNP NOT HIP — Filter Tremolo, Random Filter, Filter Sequence,
//                             Auto Filter, Wah Pedal, Fixed Filter
//   6-7 FLA FLI             — Flanger/Chorus, Random Flanger, Arpeggiator,
//                             Talk Box, Fixed Flanger
//   8   VIB                 — Vibrato (only option)
//   9   VOL                 — Tremolo, Tremolo Sequence, Volume Envelope, Auto Pan (only option)
// 0 is never used; Rotary and Sci-Fi have no documented Filter Type options.
export const FILTER_TYPE_LABELS = ['—','LP2','LP4','BNP','NOT','HIP','FLA','FLI','VIB','VOL']; // index = raw value
const FILTER_OPTIONS = {};
for (const n of ['FTR','RFI','FSE','AFI','PDL','FFI']) FILTER_OPTIONS[n] = [1, 2, 3, 4, 5];
for (const n of ['FCH','RFL','ARP','TAL','FFL'])       FILTER_OPTIONS[n] = [6, 7];
FILTER_OPTIONS.VIB = [8];
for (const n of ['TRE','TSE','VOL','PAN'])             FILTER_OPTIONS[n] = [9];

// Raw Filter Type values selectable for a Mod Effect index (empty = none documented)
export function filterTypeOptions(modEffect) {
  return FILTER_OPTIONS[MOD_EFFECTS[modEffect]] ?? [];
}

// ── Parse 64-byte raw array → preset object ──────────────────────────────────
export function parsePreset(raw) {
  if (raw.length < 32) throw new Error('Preset data too short');

  const b = raw;
  const onOff = b[9];
  const fxOrder = (onOff >> 6) & 0x03;

  return {
    // Mod FX
    modEffect:    b[0],
    variation:    b[1] + 1,           // stored 0-based, display 1-based
    fxDryMix:     b[2],
    filterType:   (b[3] >> 4) & 0x0F,
    stereo:       (b[3] & 0x0F) * 10, // 0-9 → 0-90
    speed:        b[4],
    depth:        b[5] - 99,          // 0-198 → -99..+99
    frequency:    b[6],
    resonance:    b[7],
    modSource:    b[8] & 0x0F,
    lfoWave:      (b[8] >> 4) & 0x0F,
    // On/off flags
    modOn:        !!(onOff & 0x01),
    ampOn:        !!(onOff & 0x02),
    comprOn:      !!(onOff & 0x04),
    delayOn:      !!(onOff & 0x08),
    reverbOn:     !!(onOff & 0x10),
    fxOrder,
    // Bit 5 of byte 9 is "always 0" in the spec, but factory preset 104 has it set — kept so it survives a resend
    reservedBit5: !!(onOff & 0x20),
    // Mod FX volume
    modVolume:    b[10],
    // Amp
    amp:          b[11],
    ampDrive:     b[12],
    ampBass:      b[13],
    ampMid:       b[14],
    ampTreble:    b[15],
    // Post Treble + Comp Volume
    postTreble:   ((b[16] >> 4) & 0x0F) * 10,
    comprVolume:  (b[16] & 0x0F) * 10,
    // Amp Volume
    ampVolume:    b[17],
    // Boost + Comp Drive
    ampBoost:     (((b[18] >> 4) & 0x0F) + 1) * 10, // 0-8 → 10-90
    comprDrive:   (b[18] & 0x0F) * 10,
    // Delay
    delayVolume:  b[19],
    delayTime:    b[20],
    delayRepeats: b[21],
    delayTreble:  ((b[22] >> 4) & 0x0F) * 10,
    delayStereo:  (b[22] & 0x0F) * 10,
    // Reverb
    reverbVolume: b[23],
    reverbTreble: ((b[24] >> 4) & 0x0F) * 10,
    reverbTime:   b[24] & 0x0F,
    // Pedals
    pedal1Amount: b[25] === 199 ? 'SCA' : b[25] - 99,
    pedal2Amount: b[26] === 199 ? 'SCA' : b[26] - 99,
    pedal1Dest:   b[27],
    pedal2Dest:   b[28],
    // Effect switch
    effectSwitch: b[29],
    // Preset meta
    presetTempo:  b[30],
    presetDrumbeat: b[31],
    // Sequence steps (bytes 32-63)
    sequenceSteps: raw.length >= 64
      ? Array.from(b.slice(32, 64)).map(byte => ({
          level:    byte & 0x7F,
          envelope: !!(byte & 0x80),
        }))
      : Array(32).fill({ level: 0, envelope: false }),
  };
}

// ── Serialize preset object → 64-byte array ──────────────────────────────────
export function serializePreset(p) {
  const b = new Uint8Array(64);

  b[0]  = p.modEffect ?? 0;
  b[1]  = Math.max(0, (p.variation ?? 1) - 1);
  b[2]  = p.fxDryMix ?? 0;
  b[3]  = (((p.filterType ?? 0) & 0x0F) << 4) | (Math.round((p.stereo ?? 0) / 10) & 0x0F);
  b[4]  = p.speed ?? 0;
  b[5]  = (p.depth ?? 0) + 99;
  b[6]  = p.frequency ?? 0;
  b[7]  = p.resonance ?? 0;
  b[8]  = ((p.lfoWave ?? 0) << 4) | (p.modSource ?? 0);

  const onOff =
    (p.modOn   ? 0x01 : 0) |
    (p.ampOn   ? 0x02 : 0) |
    (p.comprOn ? 0x04 : 0) |
    (p.delayOn ? 0x08 : 0) |
    (p.reverbOn? 0x10 : 0) |
    (p.reservedBit5 ? 0x20 : 0) |
    ((p.fxOrder ?? 0) << 6);
  b[9]  = onOff;
  b[10] = p.modVolume  ?? 50;
  b[11] = p.amp        ?? 0;
  b[12] = p.ampDrive   ?? 0;
  b[13] = p.ampBass    ?? 50;
  b[14] = p.ampMid     ?? 50;
  b[15] = p.ampTreble  ?? 50;
  b[16] = ((Math.round((p.postTreble ?? 90) / 10) & 0x0F) << 4) | (Math.round((p.comprVolume ?? 50) / 10) & 0x0F);
  b[17] = p.ampVolume  ?? 50;
  b[18] = ((Math.max(0, Math.round((p.ampBoost ?? 10) / 10) - 1) & 0x0F) << 4) | (Math.round((p.comprDrive ?? 0) / 10) & 0x0F);
  b[19] = p.delayVolume  ?? 0;
  b[20] = p.delayTime    ?? 0;
  b[21] = p.delayRepeats ?? 0;
  b[22] = ((Math.round((p.delayTreble ?? 90) / 10) & 0x0F) << 4) | (Math.round((p.delayStereo ?? 0) / 10) & 0x0F);
  b[23] = p.reverbVolume ?? 0;
  b[24] = ((Math.round((p.reverbTreble ?? 90) / 10) & 0x0F) << 4) | ((p.reverbTime ?? 2) & 0x0F);
  b[25] = p.pedal1Amount === 'SCA' ? 199 : (p.pedal1Amount ?? 0) + 99;
  b[26] = p.pedal2Amount === 'SCA' ? 199 : (p.pedal2Amount ?? 0) + 99;
  b[27] = p.pedal1Dest   ?? 0;
  b[28] = p.pedal2Dest   ?? 0;
  b[29] = p.effectSwitch ?? 0;
  b[30] = p.presetTempo  ?? 100;
  b[31] = p.presetDrumbeat ?? 0;

  // Sequence steps
  if (p.sequenceSteps) {
    for (let i = 0; i < 32; i++) {
      const s = p.sequenceSteps[i] || { level: 0, envelope: false };
      b[32 + i] = (s.level & 0x7F) | (s.envelope ? 0x80 : 0);
    }
  }

  return b;
}

// ── Default blank preset ──────────────────────────────────────────────────────
export function defaultPreset() {
  return {
    modEffect: 0, variation: 1, fxDryMix: 99,
    filterType: 9, stereo: 0, speed: 50, depth: 50, frequency: 50, resonance: 0,
    modSource: 2, lfoWave: 0,
    modOn: true, ampOn: true, comprOn: false, delayOn: false, reverbOn: false,
    fxOrder: 0, reservedBit5: false,
    modVolume: 50, amp: 0, ampDrive: 30, ampBass: 50, ampMid: 50, ampTreble: 50,
    postTreble: 90, comprVolume: 50, ampVolume: 50,
    ampBoost: 20, comprDrive: 0,
    delayVolume: 0, delayTime: 0, delayRepeats: 30, delayTreble: 90, delayStereo: 0,
    reverbVolume: 0, reverbTime: 2, reverbTreble: 90,
    pedal1Amount: 0, pedal2Amount: 0, pedal1Dest: 0, pedal2Dest: 0,
    effectSwitch: 2, presetTempo: 100, presetDrumbeat: 0,
    sequenceSteps: Array(32).fill(null).map(() => ({ level: 0, envelope: false })),
  };
}
