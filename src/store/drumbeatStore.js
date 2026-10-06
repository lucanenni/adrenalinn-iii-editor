/**
 * AdrenaLinn III — Drumbeat Store
 * Central state for the active drumbeat edit buffer.
 * Mirrors presetStore architecture.
 */

import {
  parseDrumbeat, serializeDrumbeat, defaultDrumbeat, activeStepCount,
  buildRequestDrumbeatEditBuf, buildSendDrumbeatEditBuf,
} from '../midi/drumbeatData.js';
import { buildSingleParam, buildRequestDrumbeat } from '../midi/sysex.js';
import { midi } from '../midi/midiManager.js';

// ── Byte-address map for single-param SysEx (buffer=1 = drumbeat edit buf) ──
const DB_PARAM_ADDR = {
  volume:   { addr: 0x00 },
  fxSend:   { addr: 0x01 },
  // addr 0x02 = treble/dist (packed mode+value)
  timebase: { addr: 0x03 },
  // addr 0x04..0x07 = BCD sound-vol (always resend full buf)
  tempo:    { addr: 0x08 },
};

const DB_PACKED_FIELDS = new Set([
  'trebleDistMode','trebleDistValue',
  'bass','snare','hihat','perc',
]);

class DrumbeatStore extends EventTarget {
  constructor() {
    super();
    this._db       = defaultDrumbeat();
    this._original = null;
    this._dirty    = false;
    this._number   = null;
    this._pendingSlot = null; // slot most recently requested via requestSlot(), consumed by the next sysex:drumbeat reply
    this._autoLoadSuspended = false; // true while libraryStore is bulk-dumping — device replies must not clobber the live edit buffer
    this._throttle = new Map();

    // Clock step tracking (updated by midiManager clock events)
    this._playingStep = -1;
    this._clockCount  = 0;
    this._playing     = false;
  }

  // ── Getters ──────────────────────────────────────────────────────────────
  get db()           { return { ...this._db, steps: this._db.steps.map(s=>({...s})) }; }
  get dirty()        { return this._dirty; }
  get number()       { return this._number; }
  get playingStep()  { return this._playingStep; }

  // ── Load ─────────────────────────────────────────────────────────────────
  loadRaw(rawBytes, slotNumber = null) {
    this._db       = parseDrumbeat(rawBytes);
    this._original = parseDrumbeat(rawBytes);
    this._dirty    = false;
    this._number   = slotNumber;
    this._emit('load', { db: this.db, number: slotNumber });
    this._emit('dirty', { dirty: false });
  }

  // ── Set param ────────────────────────────────────────────────────────────
  set(field, value) {
    if (JSON.stringify(this._db[field]) === JSON.stringify(value)) return;
    this._db[field] = value;

    if (!this._dirty) {
      this._dirty = true;
      this._emit('dirty', { dirty: true });
    }
    this._emit('change', { field, value, db: this.db });
    this._emit(`change:${field}`, { value });
    this._sendParam(field, value);
  }

  // ── Set a single step cell ────────────────────────────────────────────────
  setStep(stepIndex, voice, value) {
    const steps = this._db.steps;
    if (stepIndex < 0 || stepIndex >= 32) return;

    const prev = steps[stepIndex][voice];
    if (prev === value) return;

    steps[stepIndex] = { ...steps[stepIndex], [voice]: value };

    if (!this._dirty) {
      this._dirty = true;
      this._emit('dirty', { dirty: true });
    }

    this._emit('stepChange', { stepIndex, voice, value, steps });
    this._emit('change', { field: 'steps', value: steps, db: this.db });

    // Send the specific step byte via single-param
    // Buffer=1, address = 0x0C + stepIndex (bytes 12-43 in drumbeat data)
    if (midi.connected) {
      const s = steps[stepIndex];
      const byte =
        (s.bass  & 0x03)        |
        ((s.snare & 0x03) << 2) |
        ((s.hihat & 0x03) << 4) |
        ((s.perc  & 0x03) << 6);
      const msg = buildSingleParam(1, 0x0C + stepIndex, byte);
      midi.send(msg);
    }
  }

  // ── Cycle step value (off→soft→med→loud→off) ─────────────────────────────
  cycleStep(stepIndex, voice) {
    const current = this._db.steps[stepIndex]?.[voice] ?? 0;
    // For perc: cycle off(0)→perc1(1)→perc2(2)→perc3(3)→off
    // For bass/snare/hihat: off(0)→soft(1)→med(2)→loud(3)→off
    const next = (current + 1) % 4;
    this.setStep(stepIndex, voice, next);
  }

  // ── Clear all steps for a voice ───────────────────────────────────────────
  clearVoice(voice) {
    this._db.steps = this._db.steps.map(s => ({ ...s, [voice]: 0 }));
    if (!this._dirty) { this._dirty = true; this._emit('dirty', { dirty: true }); }
    this._emit('change', { field: 'steps', value: this._db.steps, db: this.db });
    this._emit('stepChange', { stepIndex: -1, voice, value: 0, steps: this._db.steps });
    if (midi.connected) this._sendFullEditBuf();
  }

  // ── Real-time SysEx send ──────────────────────────────────────────────────
  _sendParam(field, value) {
    if (!midi.connected) return;

    if (DB_PACKED_FIELDS.has(field)) {
      clearTimeout(this._throttle.get('__packed'));
      this._throttle.set('__packed', setTimeout(() => this._sendFullEditBuf(), 30));
      return;
    }

    const info = DB_PARAM_ADDR[field];
    if (!info) {
      clearTimeout(this._throttle.get(field));
      this._throttle.set(field, setTimeout(() => this._sendFullEditBuf(), 30));
      return;
    }

    const raw = info.encode ? info.encode(value) : (value ?? 0);
    midi.send(buildSingleParam(1, info.addr, raw & 0xFF));
  }

  _sendFullEditBuf() {
    if (!midi.connected) return;
    const raw = serializeDrumbeat(this._db);
    midi.send(buildSendDrumbeatEditBuf(raw));
  }

  // The edit buffer carries no slot number; after connecting, the device's active
  // slot (System parameters) says which slot it was loaded from. Only adopted for
  // a clean buffer that has no slot yet.
  adoptSlotNumber(n) {
    if (this._dirty || this._number !== null) return;
    this._number = n;
    this._emit('slot', { number: n });
  }

  // ── Request edit buffer from device ──────────────────────────────────────
  requestEditBuffer() {
    if (!midi.connected) return false;
    midi.send(buildRequestDrumbeatEditBuf());
    return true;
  }

  // ── Request a specific slot from device ───────────────────────────────────
  requestSlot(slot) {
    if (!midi.connected) return false;
    if (slot < 0 || slot > 199) return false;
    this._pendingSlot = slot;
    midi.send(buildRequestDrumbeat(slot));
    return true;
  }

  // ── Bulk dump coordination ───────────────────────────────────────────────
  // Called by libraryStore around a bulk dump: the dump's own per-slot
  // sysex:drumbeat replies must not overwrite the live edit buffer the user
  // might be actively editing.
  setAutoLoadSuspended(suspended) {
    this._autoLoadSuspended = suspended;
  }

  sendToDevice() {
    this._sendFullEditBuf();
    this._emit('sent', {});
  }

  revert() {
    if (!this._original) return;
    this._db    = parseDrumbeat(serializeDrumbeat(this._original));
    this._dirty = false;
    this._emit('load', { db: this.db });
    this._emit('dirty', { dirty: false });
  }

  reset() {
    this._db       = defaultDrumbeat();
    this._original = null;
    this._dirty    = false;
    this._number   = null;
    this._emit('load', { db: this.db });
    this._emit('dirty', { dirty: false });
  }

  // ── Clock/playback step tracking ──────────────────────────────────────────
  setPlaying(on) {
    this._playing   = on;
    this._clockCount= 0;
    this._playingStep = on ? 0 : -1;
    this._emit('playStep', { step: this._playingStep, playing: on });
  }

  onClock() {
    if (!this._playing) return;
    // MIDI clock = 24 ppq. One 1/16 note = 6 clocks.
    // One step = one 1/16 note in 16n mode.
    this._clockCount++;
    if (this._clockCount % 6 === 0) {
      // _playingStep is a *logical* index (0..activeStepCount-1) — the Nth
      // active step, not a physical grid column. Consumers that draw a grid
      // (SequencerGrid) must map it through physicalStepIndex() themselves.
      const maxStep = activeStepCount(this._db.timebase);
      this._playingStep = (this._playingStep + 1) % maxStep;
      this._emit('playStep', { step: this._playingStep, playing: true });
    }
  }

  // ── EventTarget helpers ───────────────────────────────────────────────────
  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  on(type, fn) {
    const handler = e => fn(e.detail);
    this.addEventListener(type, handler);
    return () => this.removeEventListener(type, handler);
  }
}

export const drumbeatStore = new DrumbeatStore();

// Wire incoming SysEx → store
midi.on('sysex:drumbeatEditBuf', ({ raw }) => {
  if (drumbeatStore._autoLoadSuspended) return; // a write session read it only to restore it afterwards
  drumbeatStore.loadRaw(raw, null);
});
// sysex:drumbeat replies to a specific-slot request (requestSlot()) — use
// whichever slot was last requested so the Library can auto-cache it
// correctly, instead of always reporting "unknown slot" (null).
midi.on('sysex:drumbeat', ({ raw }) => {
  const slot = drumbeatStore._pendingSlot;
  drumbeatStore._pendingSlot = null;
  if (drumbeatStore._autoLoadSuspended) return; // bulk dump in progress — see setAutoLoadSuspended
  drumbeatStore.loadRaw(raw, slot);
});
midi.on('clock', () => drumbeatStore.onClock());
midi.on('start', () => drumbeatStore.setPlaying(true));
midi.on('stop',  () => drumbeatStore.setPlaying(false));
