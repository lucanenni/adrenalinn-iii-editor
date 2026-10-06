/**
 * AdrenaLinn III — System Parameters Store
 * Global device settings (buffer 2). Values the device has not reported are
 * simply absent from `values` — see systemData.js for why.
 */
import { buildRequestSystem, buildFactoryInit } from '../midi/sysex.js';
import { parseSystem, clampSystemValue, buildSystemParam, systemField } from '../midi/systemData.js';
import { midi } from '../midi/midiManager.js';
import { presetStore } from './presetStore.js';
import { drumbeatStore } from './drumbeatStore.js';

class SystemStore extends EventTarget {
  constructor() {
    super();
    this._values = {};
  }

  get values() { return { ...this._values }; }
  get(key)     { return this._values[key]; }

  loadRaw(raw) {
    this._values = { ...this._values, ...parseSystem(raw) };
    this._emit('load', { values: this.values });
  }

  request() {
    if (!midi.connected) return false;
    midi.send(buildRequestSystem());
    return true;
  }

  // Writes one parameter via Single Parameter (buffer 2). Returns false if not sent.
  set(key, value) {
    const f = systemField(key);
    if (!f || f.readOnly) return false;
    const v = clampSystemValue(key, value);
    this._values[key] = v;
    this._emit('change', { key, value: v });
    if (!midi.connected) return false;
    midi.send(buildSystemParam(key, v));
    return true;
  }

  // Overwrites all 200 presets + 200 drumbeats with factory data and resets System
  // parameters. The pedal sends no Save Complete for this (verified), so wait out the
  // copy (the spec says "nearly a full second" — 2.5 s here to be safe; a Save Complete
  // ends the wait early if a firmware does send one), then read back the System
  // parameters and the edit buffers so the editor shows what the pedal now holds.
  factoryInit() {
    if (!midi.connected) return Promise.reject(new Error('Not connected'));
    return new Promise(resolve => {
      const done = async () => {
        midi.removeEventListener('sysex:saveComplete', done);
        clearTimeout(timer);
        this._values = {};
        this._emit('load', { values: this.values });
        const pause = ms => new Promise(r => setTimeout(r, ms));
        await pause(300);  this.request();
        await pause(400);  presetStore.requestEditBuffer();
        await pause(400);  drumbeatStore.requestEditBuffer();
        resolve();
      };
      const timer = setTimeout(done, 2500);
      midi.addEventListener('sysex:saveComplete', done);
      midi.send(buildFactoryInit());
    });
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  on(type, fn) {
    const handler = e => fn(e.detail);
    this.addEventListener(type, handler);
    return () => this.removeEventListener(type, handler);
  }
}

export const systemStore = new SystemStore();

midi.on('sysex:system', ({ raw }) => systemStore.loadRaw(raw));
