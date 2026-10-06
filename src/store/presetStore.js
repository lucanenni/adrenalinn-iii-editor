/**
 * AdrenaLinn III — Preset Store
 * Central state for the active preset edit buffer.
 * Handles dirty-tracking, param→byte-address mapping, real-time SysEx send.
 */

import { parsePreset, serializePreset, defaultPreset } from '../midi/presetData.js';
import {
  buildSingleParam, buildSendPresetEditBuf, buildRequestPresetEditBuf,
  buildSendPreset, buildSelectPreset, buildRequestPreset,
} from '../midi/sysex.js';
import { midi } from '../midi/midiManager.js';
import { withPresetTempoControl, writeSessionActive } from './writeSession.js';

// ── Byte-address map for single-param SysEx (buffer=0 = preset edit buf) ──
// Each key is a preset field name → { addr, encode(value)→rawByte }
// Packed params (b[3], b[8], b[9], b[16], b[18], b[22], b[24]) need special care:
// we re-read the full buffer and re-encode the packed byte each time.
const PARAM_ADDR = {
  modEffect:    { addr: 0x00 },
  variation:    { addr: 0x01, encode: v => Math.max(0, v - 1) },
  fxDryMix:     { addr: 0x02 },
  // addr 0x03 = packed filterType + stereo → handled via full resend
  speed:        { addr: 0x04 },
  depth:        { addr: 0x05, encode: v => v + 99 },
  frequency:    { addr: 0x06 },
  resonance:    { addr: 0x07 },
  // addr 0x08 = packed modSource + lfoWave
  // addr 0x09 = packed on/off + fxOrder
  modVolume:    { addr: 0x0A },
  amp:          { addr: 0x0B },
  ampDrive:     { addr: 0x0C },
  ampBass:      { addr: 0x0D },
  ampMid:       { addr: 0x0E },
  ampTreble:    { addr: 0x0F },
  // addr 0x10 = packed postTreble + comprVolume
  ampVolume:    { addr: 0x11 },
  // addr 0x12 = packed ampBoost + comprDrive
  delayVolume:  { addr: 0x13 },
  delayTime:    { addr: 0x14 },
  delayRepeats: { addr: 0x15 },
  // addr 0x16 = packed delayTreble + delayStereo
  reverbVolume: { addr: 0x17 },
  // addr 0x18 = packed reverbTreble + reverbTime
  pedal1Amount: { addr: 0x19, encode: v => v === 'SCA' ? 199 : v + 99 },
  pedal2Amount: { addr: 0x1A, encode: v => v === 'SCA' ? 199 : v + 99 },
  pedal1Dest:   { addr: 0x1B },
  pedal2Dest:   { addr: 0x1C },
  effectSwitch: { addr: 0x1D },
  presetTempo:  { addr: 0x1E },
  presetDrumbeat: { addr: 0x1F },
};

// Fields that share a packed byte — always send the full edit buffer for these
const PACKED_FIELDS = new Set([
  'filterType','stereo',
  'modSource','lfoWave',
  'modOn','ampOn','comprOn','delayOn','reverbOn','fxOrder',
  'postTreble','comprVolume',
  'ampBoost','comprDrive',
  'delayTreble','delayStereo',
  'reverbTreble','reverbTime',
]);

class PresetStore extends EventTarget {
  constructor() {
    super();
    this._preset   = defaultPreset();
    this._original = null;   // snapshot at load time
    this._dirty    = false;
    this._lastSetAt = 0;       // Date.now() of the last set() — see _scheduleDeviceSync
    this._mergeUntil = 0;      // while Date.now() < this, the next edit-buffer reply is merged, not loaded
    this._mergeRequestedAt = 0;
    this._syncTimer = null;
    this._number   = null;   // which slot this came from (null = edit buf only)
    this._pendingSlot = null; // slot most recently requested via requestSlot(), consumed by the next sysex:preset reply
    this._autoLoadSuspended = false; // true while libraryStore is bulk-dumping — device replies must not clobber the live edit buffer
    this._sendMode = 'realtime'; // 'realtime' | 'manual'
    this._throttle = new Map(); // field → timer, for throttled send

    // A/B comparison buffer
    this._bufferB    = null;  // { preset, number } snapshot, or null if unset
    this._activeSide = 'A';

    // Undo/redo history (debounced per-field, capped at 20 states)
    this._undoStack    = [];
    this._redoStack    = [];
    this._lastUndoField= null;
    this._lastUndoTime = 0;
    this._historyLimit = 20;
    this._undoDebounceMs= 500;
  }

  // ── Getters ──────────────────────────────────────────────────────────────
  get preset()      { return { ...this._preset }; }
  get dirty()       { return this._dirty; }
  get number()      { return this._number; }
  get activeSide()  { return this._activeSide; }
  get hasBufferB()  { return this._bufferB !== null; }
  get canUndo()     { return this._undoStack.length > 0; }
  get canRedo()     { return this._redoStack.length > 0; }

  // ── Load from raw bytes ──────────────────────────────────────────────────
  loadRaw(rawBytes, slotNumber = null) {
    this._preset   = parsePreset(rawBytes);
    this._original = parsePreset(rawBytes);
    this._dirty    = false;
    this._number   = slotNumber;
    this._resetHistory();
    this._clearBufferB();
    this._emit('load', { preset: this.preset, number: slotNumber });
    this._emit('dirty', { dirty: false });
  }

  // ── Update a single field ────────────────────────────────────────────────
  // { send: false } skips the automatic SysEx send — for callers (like
  // SequenceEditor) that need this method's undo/dirty/change bookkeeping
  // but already send their own more specific SysEx (e.g. a single step's
  // single-param message instead of a full-buffer resend).
  set(field, value, { send = true } = {}) {
    if (this._preset[field] === value) return;
    this._lastSetAt = Date.now();
    this._pushUndo(field);
    this._preset[field] = value;

    if (!this._dirty) {
      this._dirty = true;
      this._emit('dirty', { dirty: true });
    }

    this._emit('change', { field, value, preset: this.preset });
    this._emit(`change:${field}`, { value });

    if (send && this._sendMode === 'realtime') {
      this._sendParam(field, value);
    }
  }

  // Batch update without triggering individual sends (e.g. loading)
  setBatch(fields) {
    Object.assign(this._preset, fields);
    this._dirty = true;
    this._emit('dirty', { dirty: true });
    this._emit('change', { preset: this.preset });
  }

  // ── Real-time SysEx send ─────────────────────────────────────────────────
  _sendParam(field, value) {
    if (!midi.connected) return;

    if (PACKED_FIELDS.has(field)) {
      // Throttle: coalesce packed-field changes into a single full-buffer send
      clearTimeout(this._throttle.get('__packed'));
      this._throttle.set('__packed', setTimeout(() => {
        this._sendFullEditBuf();
      }, 30));
      return;
    }

    const info = PARAM_ADDR[field];
    if (!info) {
      // Fallback: full buf
      clearTimeout(this._throttle.get(field));
      this._throttle.set(field, setTimeout(() => this._sendFullEditBuf(), 30));
      return;
    }

    const rawVal = info.encode ? info.encode(value) : (value ?? 0);
    const msg = buildSingleParam(0, info.addr, rawVal & 0xFF);
    midi.send(msg);
    this._scheduleDeviceSync();
  }

  // True when edits go to a connected pedal as they are made
  get syncsFromDevice() { return midi.connected && this._sendMode === 'realtime'; }

  // The pedal changes more than the byte it is sent (verified on hardware): touching a
  // Mod FX / Amp / Delay / Reverb parameter switches that block on, and a new Mod Effect or
  // Variation loads that effect's defaults (Depth, Mod Source, Mod Volume, Filter/Stereo).
  // Once the user stops moving things, read the edit buffer back and adopt what the pedal did.
  _scheduleDeviceSync() {
    clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => {
      if (!midi.connected || writeSessionActive()) return;
      if (Date.now() - this._lastSetAt < 350) { this._scheduleDeviceSync(); return; }
      this._mergeRequestedAt = Date.now();
      this._mergeUntil = this._mergeRequestedAt + 1500;
      midi.send(buildRequestPresetEditBuf());
    }, 400);
  }

  // Take the pedal's edit buffer as the truth without touching dirty state, undo history,
  // the revert baseline or the slot number (unlike loadRaw)
  adoptDeviceState(rawBytes) {
    if (writeSessionActive()) return;                      // the pedal's buffer is a slot being written, not ours
    if (this._lastSetAt > this._mergeRequestedAt) return; // edited again since asking: the reply is stale
    const dev = parsePreset(rawBytes);
    if (JSON.stringify(dev) === JSON.stringify(this._preset)) return;
    this._preset = dev;
    this._emit('load', { preset: this.preset, number: this._number });
  }

  _sendFullEditBuf() {
    if (!midi.connected) return;
    const raw = serializePreset(this._preset);
    const msg = buildSendPresetEditBuf(raw);
    midi.send(msg);
  }

  // The edit buffer carries no slot number; after connecting, the device's active
  // slot (System parameters) says which slot it was loaded from. Only adopted for
  // a clean buffer that has no slot yet.
  adoptSlotNumber(n) {
    if (this._dirty || this._number !== null) return;
    this._number = n;
    this._emit('slot', { number: n });
  }

  // ── Request current edit buffer from device ──────────────────────────────
  requestEditBuffer() {
    if (!midi.connected) return false;
    midi.send(buildRequestPresetEditBuf());
    return true;
  }

  // ── Send to device edit buffer (temporary, no slot written) ─────────────
  sendToDevice() {
    this._sendFullEditBuf();
    this._emit('sent', {});
  }

  // ── Save to specific slot ─────────────────────────────────────────────────
  /**
   * Saves the current preset to a specific slot (0-199).
   * Flow: send preset data (ID 0x02) → device writes to flash
   *       → device sends Save Complete (ID 0x11) after ~1s.
   * Returns a Promise that resolves when Save Complete is received
   * or rejects after 3s timeout.
   */
  saveToSlot(slot) {
    if (!midi.connected) return Promise.reject(new Error('Not connected'));
    if (slot < 0 || slot > 199) return Promise.reject(new Error('Invalid slot'));

    // The pedal stamps its current drumbeat tempo into every preset it is sent, so
    // the preset's own tempo has to be put there first (see writeSession.js)
    return withPresetTempoControl(async ctl => {
      await ctl.setTempo(this._preset.presetTempo);
      return this._saveToSlotNow(slot);
    });
  }

  _saveToSlotNow(slot) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Save timeout — device did not confirm'));
      }, 3000);

      const cleanup = () => {
        midi.removeEventListener('sysex:saveComplete', handler);
        clearTimeout(timer);
      };

      const handler = () => {
        cleanup();
        this._number = slot;
        this._dirty  = false;
        this._original = { ...this._preset };
        this._emit('saved', { slot });
        this._emit('dirty', { dirty: false });
        resolve(slot);
      };

      // Listen for Save Complete before sending
      midi.addEventListener('sysex:saveComplete', handler);

      // Send Preset to slot (ID 0x02 — writes directly to flash)
      const raw = serializePreset(this._preset);
      const msg = buildSendPreset(raw);

      // Per spec: first select the destination slot, then send preset data
      midi.send(buildSelectPreset(slot));
      setTimeout(() => midi.send(msg), 50);

      this._emit('saving', { slot });
    });
  }

  // ── Request a specific slot from device ───────────────────────────────────
  requestSlot(slot) {
    if (!midi.connected) return false;
    if (slot < 0 || slot > 199) return false;
    this._pendingSlot = slot;
    midi.send(buildRequestPreset(slot));
    return true;
  }

  // ── Bulk dump coordination ───────────────────────────────────────────────
  // Called by libraryStore around a bulk dump: the dump's own per-slot
  // sysex:preset replies must not overwrite the live edit buffer the user
  // might be actively editing.
  setAutoLoadSuspended(suspended) {
    this._autoLoadSuspended = suspended;
  }

  // ── Revert to original ────────────────────────────────────────────────────
  revert() {
    if (!this._original) return;
    this._preset = { ...this._original };
    this._dirty  = false;
    this._resetHistory();
    this._emit('load', { preset: this.preset });
    this._emit('dirty', { dirty: false });
  }

  // ── Reset to defaults ─────────────────────────────────────────────────────
  reset() {
    this._preset  = defaultPreset();
    this._original = null;
    this._dirty   = false;
    this._number  = null;
    this._resetHistory();
    this._clearBufferB();
    this._emit('load', { preset: this.preset });
    this._emit('dirty', { dirty: false });
  }

  // ── Send mode ─────────────────────────────────────────────────────────────
  setMode(mode) { this._sendMode = mode; }

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  // Snapshots are taken *before* a change is applied. Consecutive edits to the
  // same field within a short window are coalesced into a single undo step,
  // so dragging a knob produces one undo entry instead of one per tick.
  _pushUndo(field) {
    const now = Date.now();
    const sameGesture = field === this._lastUndoField &&
      (now - this._lastUndoTime) < this._undoDebounceMs;
    this._lastUndoField = field;
    this._lastUndoTime  = now;
    if (sameGesture) return;

    this._undoStack.push({ ...this._preset });
    if (this._undoStack.length > this._historyLimit) this._undoStack.shift();
    this._redoStack = [];
    this._emitHistoryChange();
  }

  _resetHistory() {
    this._undoStack = [];
    this._redoStack = [];
    this._lastUndoField = null;
    this._lastUndoTime  = 0;
    this._emitHistoryChange();
  }

  _emitHistoryChange() {
    this._emit('historyChange', { canUndo: this.canUndo, canRedo: this.canRedo });
  }

  undo() {
    if (!this.canUndo) return false;
    this._redoStack.push({ ...this._preset });
    if (this._redoStack.length > this._historyLimit) this._redoStack.shift();
    this._preset = this._undoStack.pop();
    this._lastUndoField = null;
    this._dirty = true;
    this._emitHistoryChange();
    this._emit('load', { preset: this.preset, number: this._number });
    this._emit('dirty', { dirty: true });
    if (this._sendMode === 'realtime') this._sendFullEditBuf();
    return true;
  }

  redo() {
    if (!this.canRedo) return false;
    this._undoStack.push({ ...this._preset });
    if (this._undoStack.length > this._historyLimit) this._undoStack.shift();
    this._preset = this._redoStack.pop();
    this._lastUndoField = null;
    this._dirty = true;
    this._emitHistoryChange();
    this._emit('load', { preset: this.preset, number: this._number });
    this._emit('dirty', { dirty: true });
    if (this._sendMode === 'realtime') this._sendFullEditBuf();
    return true;
  }

  // ── A/B comparison ─────────────────────────────────────────────────────────
  // copyToB() snapshots the current preset into a secondary buffer; swapAB()
  // exchanges the active preset with that buffer so the two can be compared.
  copyToB() {
    this._bufferB = { preset: { ...this._preset }, number: this._number };
    this._emit('sideChange', { side: this._activeSide, hasB: true });
  }

  swapAB() {
    if (!this._bufferB) return false;
    const current = { preset: { ...this._preset }, number: this._number };
    this._preset  = { ...this._bufferB.preset };
    this._number  = this._bufferB.number;
    this._bufferB = current;
    this._activeSide = this._activeSide === 'A' ? 'B' : 'A';
    this._dirty = true;
    this._resetHistory();
    this._emit('load', { preset: this.preset, number: this._number });
    this._emit('dirty', { dirty: true });
    this._emit('sideChange', { side: this._activeSide, hasB: true });
    if (this._sendMode === 'realtime') this._sendFullEditBuf();
    return true;
  }

  _clearBufferB() {
    this._bufferB    = null;
    this._activeSide = 'A';
    this._emit('sideChange', { side: this._activeSide, hasB: false });
  }

  // ── EventTarget helper ────────────────────────────────────────────────────
  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  on(type, fn) {
    const handler = e => fn(e.detail);
    this.addEventListener(type, handler);
    return () => this.removeEventListener(type, handler);
  }
}

export const presetStore = new PresetStore();

// Wire incoming SysEx → store
midi.on('sysex:presetEditBuf', ({ raw }) => {
  if (Date.now() < presetStore._mergeUntil) { presetStore._mergeUntil = 0; presetStore.adoptDeviceState(raw); }
  else presetStore.loadRaw(raw, null);
});
// sysex:preset replies to a specific-slot request (requestSlot()) — use
// whichever slot was last requested so the Library can auto-cache it
// correctly, instead of always reporting "unknown slot" (null).
midi.on('sysex:preset', ({ raw }) => {
  const slot = presetStore._pendingSlot;
  presetStore._pendingSlot = null;
  if (presetStore._autoLoadSuspended) return; // bulk dump in progress — see setAutoLoadSuspended
  presetStore.loadRaw(raw, slot);
});
