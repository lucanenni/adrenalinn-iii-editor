/**
 * PresetMetaPanel — settings stored with the preset that aren't tied to one effect:
 * the preset's assigned Tempo and Drumbeat, and its Effect Switch (what the
 * EFFECT foot switch does while this preset is active). The "Edit drumbeat"
 * button opens the preset's assigned drumbeat in the DRUMBEAT tab.
 */
import { Knob } from './Knob.js';
import { presetStore } from '../store/presetStore.js';
import { drumbeatStore } from '../store/drumbeatStore.js';
import { libraryStore } from '../store/libraryStore.js';
import { midi } from '../midi/midiManager.js';
import { EFFECT_SWITCH_OPTS, EFFECT_SWITCH_NAMES } from '../midi/presetData.js';

export class PresetMetaPanel {
  constructor(container) {
    this.container = container;
    this._knobs = {};
    this._unsub = [];
    this._build();
    this._bindStore();
  }

  _build() {
    this.container.innerHTML = '';

    const grid = document.createElement('div');
    grid.style.cssText = 'padding:12px 14px;display:flex;flex-wrap:wrap;gap:10px 8px;align-items:flex-start;';
    this.container.appendChild(grid);

    const p = presetStore.preset;
    this._knobs.presetTempo = new Knob({
      container: grid, label: 'TEMPO',
      min: 30, max: 250, value: p.presetTempo, unit: ' BPM',
      onChange: v => presetStore.set('presetTempo', v),
    });
    this._knobs.presetDrumbeat = new Knob({
      container: grid, label: 'DRUMBEAT',
      min: 0, max: 199, value: p.presetDrumbeat,
      onChange: v => presetStore.set('presetDrumbeat', v),
    });
    // Opens the drumbeat this preset is assigned to in the DRUMBEAT tab
    const dbCell = this._knobs.presetDrumbeat.root;
    this._btnDrumbeat = document.createElement('button');
    this._btnDrumbeat.className = 'btn sm';
    this._btnDrumbeat.onclick = () => this._editDrumbeat();
    dbCell.appendChild(this._btnDrumbeat);
    this._updateDrumbeatButton();

    this._knobs.effectSwitch = new Knob({
      container: grid, label: 'FX SWITCH', details: true,
      min: 0, max: EFFECT_SWITCH_OPTS.length - 1, value: p.effectSwitch,
      enumValues: EFFECT_SWITCH_OPTS, valueNames: EFFECT_SWITCH_NAMES,
      onChange: v => presetStore.set('effectSwitch', v),
    });
  }

  _updateDrumbeatButton() {
    this._btnDrumbeat.textContent = `✏ Edit drumbeat ${presetStore.preset.presetDrumbeat}`;
    this._btnDrumbeat.title = 'Open this preset\'s drumbeat in the DRUMBEAT tab';
  }

  // The device is authoritative when connected; otherwise use the Library copy
  _editDrumbeat() {
    const n = presetStore.preset.presetDrumbeat;
    if (libraryStore.busy) { alert('A transfer is running — try again when it has finished.'); return; }
    const already = drumbeatStore.number === n;
    if (!already && drumbeatStore.dirty &&
        !confirm(`The current drumbeat has unsaved edits. Replace it with drumbeat ${n}?`)) return;
    window._activateTab?.('drumbeat');
    if (already) return;
    if (midi.connected) { drumbeatStore.requestSlot(n); return; }
    const rec = libraryStore.getDrumbeat(n);
    if (rec) drumbeatStore.loadRaw(rec.raw, n);
    else alert(`Drumbeat ${n} isn't in the Library and no device is connected.`);
  }

  _syncFromStore() {
    const p = presetStore.preset;
    Object.entries(this._knobs).forEach(([k, knob]) => {
      if (p[k] !== undefined) knob.setValue(p[k]);
    });
    this._updateDrumbeatButton();
  }

  _bindStore() {
    this._unsub.push(presetStore.on('load', () => this._syncFromStore()));
    this._unsub.push(presetStore.on('change', ({ field, value }) => {
      if (field in this._knobs) this._knobs[field]?.setValue(value);
      if (field === 'presetDrumbeat') this._updateDrumbeatButton();
    }));
  }

  destroy() {
    this._unsub.forEach(fn => typeof fn === 'function' && fn());
    Object.values(this._knobs).forEach(k => k.destroy());
    this.container.innerHTML = '';
  }
}
