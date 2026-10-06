/**
 * AdrenaLinn III — Library Store
 * Manages the full 200-preset / 200-drumbeat library in IndexedDB.
 * Also drives the bulk dump engine (request all slots with 1.1s delay).
 */

import { parsePreset, serializePreset } from '../midi/presetData.js';
import { parseDrumbeat, serializeDrumbeat } from '../midi/drumbeatData.js';
import {
  buildRequestPreset, buildRequestDrumbeat, buildSendPreset, buildSendDrumbeat,
  buildSelectPreset, buildSelectDrumbeat,
} from '../midi/sysex.js';
import { midi } from '../midi/midiManager.js';
import { presetStore } from './presetStore.js';
import { drumbeatStore } from './drumbeatStore.js';
import { withPresetTempoControl } from './writeSession.js';

// ── IndexedDB helpers ─────────────────────────────────────────────────────────
const DB_NAME     = 'adrenalinn3';
const DB_VERSION  = 2;
const STORE_PRE   = 'presets';
const STORE_DB    = 'drumbeats';
const STORE_META  = 'meta';
const STORE_PNAME = 'presetNames';
const STORE_DNAME = 'drumbeatNames';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_PRE))
        db.createObjectStore(STORE_PRE,  { keyPath: 'slot' });
      if (!db.objectStoreNames.contains(STORE_DB))
        db.createObjectStore(STORE_DB,   { keyPath: 'slot' });
      if (!db.objectStoreNames.contains(STORE_META))
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORE_PNAME))
        db.createObjectStore(STORE_PNAME, { keyPath: 'slot' });
      if (!db.objectStoreNames.contains(STORE_DNAME))
        db.createObjectStore(STORE_DNAME, { keyPath: 'slot' });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function idbPut(db, store, record) {
  return new Promise((res, rej) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(record);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

function idbGet(db, store, key) {
  return new Promise((res, rej) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

function idbGetAll(db, store) {
  return new Promise((res, rej) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

function idbDelete(db, store, key) {
  return new Promise((res, rej) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}

// ── Preset category map (from PresetList.pdf) ─────────────────────────────────
export const PRESET_CATEGORIES = [
  { label: 'Clean Tones',                 from:   0, to:  14 },
  { label: 'Classic Amps (Light)',        from:  15, to:  29 },
  { label: 'Classic Amps (Cranked)',      from:  30, to:  39 },
  { label: 'High Gain',                   from:  40, to:  49 },
  { label: 'Distortion Boxes',            from:  50, to:  51 },
  { label: 'Bass Amps',                   from:  52, to:  59 },
  { label: 'Tremolo & Pan',               from:  60, to:  72 },
  { label: 'Filter Tremolo',              from:  73, to:  85 },
  { label: 'Flanger & Chorus',            from:  86, to:  93 },
  { label: 'Rotary / Vibrato',            from:  94, to:  99 },
  { label: 'Random Filter',               from: 100, to: 111 },
  { label: 'Random Flanger',              from: 112, to: 120 },
  { label: 'Random Tremolo',              from: 121, to: 124 },
  { label: 'Filter Sequences',            from: 125, to: 139 },
  { label: 'Tremolo Sequences',           from: 140, to: 149 },
  { label: 'Arpeggiator Sequences',       from: 150, to: 159 },
  { label: 'Auto Wah',                    from: 160, to: 167 },
  { label: 'Talk Box',                    from: 168, to: 175 },
  { label: 'Volume Swell',                from: 176, to: 177 },
  { label: 'Delay Loops',                 from: 178, to: 179 },
  { label: 'Weird & Sci-Fi',              from: 180, to: 184 },
  { label: 'Processed Drumbeats',         from: 185, to: 189 },
  { label: 'Blank',                       from: 190, to: 199 },
];

export const DRUMBEAT_CATEGORIES = [
  { label: 'Rock/Pop 1/8 Note',           from:   0, to:  44 },
  { label: 'Rock/Pop 1/16 Note',          from:  45, to:  74 },
  { label: '1/16 Swing Grooves',          from:  75, to:  94 },
  { label: '1/8 Triplet Beats',           from:  95, to: 109 },
  { label: 'Hip Hop',                     from: 110, to: 129 },
  { label: 'Techno / Electronica',        from: 130, to: 149 },
  { label: 'World / Latin / Reggae',      from: 150, to: 169 },
  { label: 'Jazz',                        from: 170, to: 179 },
  { label: 'Simple Counts',              from: 180, to: 184 },
  { label: 'Processed Drumbeats',         from: 185, to: 189 },
  { label: 'Blank',                       from: 190, to: 199 },
];

export function categoryForSlot(slot, categories) {
  return categories.find(c => slot >= c.from && slot <= c.to)?.label ?? '—';
}

// ── Library Store ─────────────────────────────────────────────────────────────
class LibraryStore extends EventTarget {
  constructor() {
    super();
    this._db       = null;     // IDB instance
    this._presets  = new Map(); // slot → { slot, raw:Uint8Array, parsed, name, ts }
    this._drumbeats= new Map();
    this._presetNames  = new Map(); // slot → name string
    this._drumbeatNames= new Map();
    this._ready    = false;

    // Bulk dump state
    this._dumpActive   = false;
    this._dumpType     = null;   // 'preset' | 'drumbeat'
    this._dumpSlot     = 0;
    this._dumpTotal    = 200;
    this._dumpTimer    = null;
    this._dumpReceived = 0;

    // Restore-to-device state
    this._restoreActive = false;
    this._restoreCancel = false;
  }

  // ── Init (open IDB + load cached data) ───────────────────────────────────
  async init() {
    try {
      this._db = await openDB();
      await this._loadFromIDB();
      this._ready = true;
      this._emit('ready', { presets: this._presets.size, drumbeats: this._drumbeats.size });
    } catch(e) {
      console.error('LibraryStore IDB error:', e);
      this._emit('error', { message: e.message });
    }
  }

  async _loadFromIDB() {
    const [pRows, dRows, pNameRows, dNameRows] = await Promise.all([
      idbGetAll(this._db, STORE_PRE),
      idbGetAll(this._db, STORE_DB),
      idbGetAll(this._db, STORE_PNAME),
      idbGetAll(this._db, STORE_DNAME),
    ]);
    pRows.forEach(r => {
      r.raw = new Uint8Array(r.raw);
      try { r.parsed = parsePreset(r.raw); } catch(_){}
      this._presets.set(r.slot, r);
    });
    dRows.forEach(r => {
      r.raw = new Uint8Array(r.raw);
      try { r.parsed = parseDrumbeat(r.raw); } catch(_){}
      this._drumbeats.set(r.slot, r);
    });
    pNameRows.forEach(r => this._presetNames.set(r.slot, r.name));
    dNameRows.forEach(r => this._drumbeatNames.set(r.slot, r.name));
  }

  // ── Accessors ─────────────────────────────────────────────────────────────
  get presets()   { return this._presets; }
  get drumbeats() { return this._drumbeats; }
  get ready()     { return this._ready; }
  get dumpActive(){ return this._dumpActive; }
  get restoreActive(){ return this._restoreActive; }
  // True while any device transfer owns the MIDI link (dump or restore)
  get busy()      { return this._dumpActive || this._restoreActive; }

  getPreset(slot)   { return this._presets.get(slot);   }
  getDrumbeat(slot) { return this._drumbeats.get(slot); }

  // ── Preset / drumbeat names (local dictionary, independent of cached data) ──
  getPresetName(slot)   { return this._presetNames.get(slot)   ?? ''; }
  getDrumbeatName(slot) { return this._drumbeatNames.get(slot) ?? ''; }

  async setPresetName(slot, name) {
    await this._setName(STORE_PNAME, this._presetNames, slot, name);
    this._emit('nameChange', { type: 'preset', slot, name });
    this._emit('libraryChange', {});
  }

  async setDrumbeatName(slot, name) {
    await this._setName(STORE_DNAME, this._drumbeatNames, slot, name);
    this._emit('nameChange', { type: 'drumbeat', slot, name });
    this._emit('libraryChange', {});
  }

  async _setName(store, map, slot, name) {
    const trimmed = (name ?? '').trim();
    if (trimmed) {
      map.set(slot, trimmed);
      if (this._db) await idbPut(this._db, store, { slot, name: trimmed }).catch(console.error);
    } else {
      map.delete(slot);
      if (this._db) await idbDelete(this._db, store, slot).catch(console.error);
    }
  }

  // ── Copy a cached slot to another slot within the local library ────────────
  async copyPreset(srcSlot, destSlot) {
    const rec = this._presets.get(srcSlot);
    if (!rec) throw new Error(`Preset slot ${srcSlot} is not cached`);
    await this.storePreset(destSlot, rec.raw);
    const name = this.getPresetName(srcSlot);
    if (name) await this.setPresetName(destSlot, name);
  }

  async copyDrumbeat(srcSlot, destSlot) {
    const rec = this._drumbeats.get(srcSlot);
    if (!rec) throw new Error(`Drumbeat slot ${srcSlot} is not cached`);
    await this.storeDrumbeat(destSlot, rec.raw);
    const name = this.getDrumbeatName(srcSlot);
    if (name) await this.setDrumbeatName(destSlot, name);
  }

  // ── Store a single received preset ───────────────────────────────────────
  async storePreset(slot, rawBytes) {
    const raw    = new Uint8Array(rawBytes);
    let   parsed = null;
    try { parsed = parsePreset(raw); } catch(_){}

    const record = { slot, raw: Array.from(raw), parsed, ts: Date.now() };
    this._presets.set(slot, { ...record, raw });

    if (this._db) {
      await idbPut(this._db, STORE_PRE, record).catch(console.error);
    }
    this._emit('presetStored', { slot, parsed });
    this._emit('libraryChange', {});
  }

  async storeDrumbeat(slot, rawBytes) {
    const raw    = new Uint8Array(rawBytes);
    let   parsed = null;
    try { parsed = parseDrumbeat(raw); } catch(_){}

    const record = { slot, raw: Array.from(raw), parsed, ts: Date.now() };
    this._drumbeats.set(slot, { ...record, raw });

    if (this._db) {
      await idbPut(this._db, STORE_DB, record).catch(console.error);
    }
    this._emit('drumbeatStored', { slot, parsed });
    this._emit('libraryChange', {});
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async deletePreset(slot) {
    this._presets.delete(slot);
    if (this._db) await idbDelete(this._db, STORE_PRE, slot).catch(console.error);
    this._emit('libraryChange', {});
  }

  async deleteDrumbeat(slot) {
    this._drumbeats.delete(slot);
    if (this._db) await idbDelete(this._db, STORE_DB, slot).catch(console.error);
    this._emit('libraryChange', {});
  }

  // ── Clear all ─────────────────────────────────────────────────────────────
  async clearAll() {
    this._presets.clear();
    this._drumbeats.clear();
    if (this._db) {
      await Promise.all([
        new Promise(r => { const tx = this._db.transaction(STORE_PRE,'readwrite'); tx.objectStore(STORE_PRE).clear(); tx.oncomplete=r; }),
        new Promise(r => { const tx = this._db.transaction(STORE_DB,'readwrite');  tx.objectStore(STORE_DB).clear();  tx.oncomplete=r; }),
      ]);
    }
    this._emit('libraryChange', {});
  }

  // ── Bulk dump engine ──────────────────────────────────────────────────────
  /**
   * Request all 200 presets or drumbeats from the device.
   * Per spec: wait for Save Complete OR 1.1 seconds between each request.
   * @param {'preset'|'drumbeat'} type
   * @param {number} [from=0]
   * @param {number} [to=199]
   */
  startBulkDump(type, from = 0, to = 199) {
    if (!midi.connected || this._restoreActive) return false;
    if (this._dumpActive) this.cancelBulkDump();

    this._dumpActive   = true;
    this._dumpType     = type;
    this._dumpSlot     = from;
    this._dumpTotal    = to - from + 1;
    this._dumpReceived = 0;
    this._dumpFrom     = from;
    this._dumpTo       = to;

    // The dump's own per-slot replies must not clobber whatever the user
    // is actively editing in the live edit buffer.
    this._storeForType(type).setAutoLoadSuspended(true);

    this._emit('dumpStart', { type, from, to, total: this._dumpTotal });
    this._requestNext();
    return true;
  }

  cancelBulkDump() {
    clearTimeout(this._dumpTimer);
    if (this._dumpActive) this._storeForType(this._dumpType).setAutoLoadSuspended(false);
    this._dumpActive = false;
    this._emit('dumpCancel', {});
  }

  _storeForType(type) {
    return type === 'preset' ? presetStore : drumbeatStore;
  }

  _requestNext() {
    if (!this._dumpActive) return;
    if (this._dumpSlot > this._dumpTo) {
      this._dumpActive = false;
      this._storeForType(this._dumpType).setAutoLoadSuspended(false);
      this._emit('dumpComplete', {
        type: this._dumpType,
        received: this._dumpReceived,
        total: this._dumpTotal,
      });
      return;
    }

    const slot = this._dumpSlot;
    const msg  = this._dumpType === 'preset'
      ? buildRequestPreset(slot)
      : buildRequestDrumbeat(slot);

    midi.send(msg);
    this._emit('dumpProgress', {
      slot,
      received: this._dumpReceived,
      total: this._dumpTotal,
      pct: Math.round((this._dumpReceived / this._dumpTotal) * 100),
    });

    // Timeout fallback: if no reply in 1.1s, advance anyway
    this._dumpTimer = setTimeout(() => {
      this._dumpSlot++;
      this._requestNext();
    }, 1100);
  }

  // Called when a preset/drumbeat SysEx reply arrives during bulk dump
  _onDumpReceive(type, slot, rawBytes) {
    if (!this._dumpActive || this._dumpType !== type) return;
    if (slot !== this._dumpSlot) return;

    clearTimeout(this._dumpTimer);
    this._dumpReceived++;

    if (type === 'preset')   this.storePreset(slot, rawBytes);
    else                     this.storeDrumbeat(slot, rawBytes);

    this._dumpSlot++;
    // Small delay to respect device flash save time
    this._dumpTimer = setTimeout(() => this._requestNext(), 50);
  }

  // ── Restore: write cached slots back to the device ────────────────────────
  // Per slot: select it, send the full preset/drumbeat message (which overwrites
  // the selected slot in flash), then wait for the device's Save Complete — the
  // spec says it ignores everything until then. Stops at the first slot that is
  // not confirmed within 3 s instead of blindly sending the rest.
  // Resolves with { written, total }, or rejects with the failing slot attached.
  async startRestore(type, from = 0, to = 199) {
    if (!midi.connected) throw new Error('Not connected');
    if (this.busy) throw new Error('Another transfer is already running');
    const map = type === 'preset' ? this._presets : this._drumbeats;
    const slots = [];
    for (let s = from; s <= to; s++) if (map.has(s)) slots.push(s);

    this._restoreActive = true;
    this._restoreCancel = false;
    this._emit('restoreStart', { type, total: slots.length });
    let written = 0;
    let exactTempo; // presets only: did the preset tempos survive? (see writeSession.js)
    const run = async ctl => {
      exactTempo = type === 'preset' ? ctl.exact : undefined;
      for (const slot of slots) {
        if (this._restoreCancel) break;
        if (!midi.connected) throw Object.assign(new Error('Device disconnected'), { slot });
        this._emit('restoreProgress', { type, slot, written, total: slots.length });
        const raw = map.get(slot).raw;
        // The pedal stores its current drumbeat tempo in a written preset: set the preset's own first
        if (type === 'preset') await ctl.setTempo(raw[30]);
        midi.send(type === 'preset' ? buildSelectPreset(slot) : buildSelectDrumbeat(slot));
        await new Promise(r => setTimeout(r, 50));
        const saved = this._waitSaveComplete(3000);
        midi.send(type === 'preset' ? buildSendPreset(raw) : buildSendDrumbeat(raw));
        try { await saved; }
        catch { throw Object.assign(new Error(`Device did not confirm slot ${slot} — stopped`), { slot }); }
        written++;
      }
    };
    try {
      if (type === 'preset') await withPresetTempoControl(run, { reselect: true });
      else await run({ exact: true, setTempo: async () => {} });
      this._emit('restoreComplete', { type, written, total: slots.length, cancelled: this._restoreCancel, exactTempo });
      return { written, total: slots.length, exactTempo };
    } catch (e) {
      this._emit('restoreError', { type, slot: e.slot, message: e.message, written, total: slots.length });
      throw e;
    } finally {
      this._restoreActive = false;
    }
  }

  // Takes effect before the next slot — a flash write already in flight can't be aborted.
  cancelRestore() { this._restoreCancel = true; }

  _waitSaveComplete(ms) {
    return new Promise((resolve, reject) => {
      const done = () => { clearTimeout(timer); midi.removeEventListener('sysex:saveComplete', done); resolve(); };
      const timer = setTimeout(() => { midi.removeEventListener('sysex:saveComplete', done); reject(new Error('timeout')); }, ms);
      midi.addEventListener('sysex:saveComplete', done);
    });
  }

  // ── JSON Export ───────────────────────────────────────────────────────────
  exportJSON() {
    const presets   = [];
    const drumbeats = [];

    this._presets.forEach((rec, slot) => {
      presets.push({ slot, raw: Array.from(rec.raw), ts: rec.ts });
    });
    this._drumbeats.forEach((rec, slot) => {
      drumbeats.push({ slot, raw: Array.from(rec.raw), ts: rec.ts });
    });

    presets.sort((a,b) => a.slot - b.slot);
    drumbeats.sort((a,b) => a.slot - b.slot);

    const presetNames   = [...this._presetNames].map(([slot, name]) => ({ slot, name }));
    const drumbeatNames = [...this._drumbeatNames].map(([slot, name]) => ({ slot, name }));

    return JSON.stringify({
      version: 1,
      device:  'AdrenaLinn III',
      exported: new Date().toISOString(),
      presets,
      drumbeats,
      presetNames,
      drumbeatNames,
    }, null, 2);
  }

  // ── JSON Import ───────────────────────────────────────────────────────────
  async importJSON(jsonString) {
    let data;
    try { data = JSON.parse(jsonString); }
    catch(e) { throw new Error('Invalid JSON: ' + e.message); }

    if (data.version !== 1 || data.device !== 'AdrenaLinn III')
      throw new Error('Not an AdrenaLinn III backup file');

    let imported = 0;
    for (const p of (data.presets ?? [])) {
      if (p.slot >= 0 && p.slot <= 199 && Array.isArray(p.raw)) {
        await this.storePreset(p.slot, new Uint8Array(p.raw));
        imported++;
      }
    }
    for (const d of (data.drumbeats ?? [])) {
      if (d.slot >= 0 && d.slot <= 199 && Array.isArray(d.raw)) {
        await this.storeDrumbeat(d.slot, new Uint8Array(d.raw));
        imported++;
      }
    }
    for (const n of (data.presetNames ?? [])) {
      if (n.slot >= 0 && n.slot <= 199 && n.name) await this.setPresetName(n.slot, n.name);
    }
    for (const n of (data.drumbeatNames ?? [])) {
      if (n.slot >= 0 && n.slot <= 199 && n.name) await this.setDrumbeatName(n.slot, n.name);
    }

    this._emit('importComplete', { imported });
    return imported;
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

export const libraryStore = new LibraryStore();

// A lost device ends any running transfer
midi.on('connectionChange', ({ connected }) => {
  if (connected) return;
  if (libraryStore._dumpActive) libraryStore.cancelBulkDump();
  libraryStore.cancelRestore();
});

// ── Wire incoming SysEx → library during bulk dump ────────────────────────────
midi.on('sysex:preset', ({ raw }) => {
  // During bulk dump the slot comes from the dump engine's current position
  if (libraryStore._dumpActive && libraryStore._dumpType === 'preset') {
    libraryStore._onDumpReceive('preset', libraryStore._dumpSlot, raw);
  }
});
midi.on('sysex:drumbeat', ({ raw }) => {
  if (libraryStore._dumpActive && libraryStore._dumpType === 'drumbeat') {
    libraryStore._onDumpReceive('drumbeat', libraryStore._dumpSlot, raw);
  }
});
