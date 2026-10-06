/**
 * DelayReverbPanel — Rows 5 & 6 of the AdrenaLinn III preset editor
 * Delay: Volume, Time, Repeats, On + Details: Treble, Stereo
 * Reverb: Volume, On + Details: Time, Treble
 */

import { Knob, Toggle } from './Knob.js';
import { presetStore } from '../store/presetStore.js';

// ── Delay time display labels ─────────────────────────────────────────────────
const DELAY_TIME_LABELS = [
  ...Array.from({length:100}, (_,i) => i === 0 ? '0ms' : `${(i*28).toString()}ms`),
  '2M','2Mt','1Md','1M','1Mt','½d','½n','½t',
  '¼d','¼n','¼t','⅛d','⅛n','⅛t','16d','16n','16t','32n','32t'
];

// ── Reverb time labels ────────────────────────────────────────────────────────
const REVERB_TIMES = ['XS Room','S Room','M Room','L Room','XL Room'];

export class DelayReverbPanel {
  constructor(container) {
    this.container   = container;
    this._knobs   = {};
    this._toggles = {};
    this._unsub   = [];
    this._build();
    this._bindStore();
    this._syncFromStore();
  }

  _build() {
    this.container.innerHTML = '';

    this._buildDelaySection();
    this._buildReverbSection();
    this._buildDetailsSection();
  }

  _buildDelaySection() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:12px 14px;border-bottom:1px solid var(--border);';

    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);margin-bottom:10px;';
    lbl.textContent = 'Delay';
    wrap.appendChild(lbl);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px 8px;align-items:flex-start;';
    wrap.appendChild(grid);
    this.container.appendChild(wrap);

    const p = presetStore.preset;

    this._toggles.delayOn = new Toggle({
      container: grid, label: 'DELAY ON',
      value: p.delayOn,
      onChange: v => presetStore.set('delayOn', v),
    });

    this._knobs.delayVolume = new Knob({
      container: grid, label: 'DELAY VOL',
      min: 0, max: 99, value: p.delayVolume,
      onChange: v => presetStore.set('delayVolume', v),
    });

    this._knobs.delayTime = new Knob({
      container: grid, label: 'DELAY TIME',
      min: 0, max: 118, value: p.delayTime,
      valueLabels: DELAY_TIME_LABELS,
      onChange: v => presetStore.set('delayTime', v),
    });

    this._knobs.delayRepeats = new Knob({
      container: grid, label: 'REPEATS',
      min: 0, max: 99, value: p.delayRepeats,
      onChange: v => presetStore.set('delayRepeats', v),
    });
  }

  _buildReverbSection() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:12px 14px;border-bottom:1px solid var(--border);';

    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);margin-bottom:10px;';
    lbl.textContent = 'Reverb';
    wrap.appendChild(lbl);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px 8px;align-items:flex-start;';
    wrap.appendChild(grid);
    this.container.appendChild(wrap);

    const p = presetStore.preset;

    this._toggles.reverbOn = new Toggle({
      container: grid, label: 'REVERB ON',
      value: p.reverbOn,
      onChange: v => presetStore.set('reverbOn', v),
    });

    this._knobs.reverbVolume = new Knob({
      container: grid, label: 'REVERB VOL',
      min: 0, max: 99, value: p.reverbVolume,
      onChange: v => presetStore.set('reverbVolume', v),
    });
  }

  _buildDetailsSection() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:12px 14px;border-bottom:1px solid var(--border);';

    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);margin-bottom:10px;';
    lbl.textContent = 'Delay & Reverb Details';
    wrap.appendChild(lbl);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px 8px;align-items:flex-start;';
    wrap.appendChild(grid);
    this.container.appendChild(wrap);

    const p = presetStore.preset;

    this._knobs.delayTreble = new Knob({
      container: grid, label: 'DLY TREBLE', details: true,
      min: 0, max: 90, step: 10, value: p.delayTreble,
      onChange: v => presetStore.set('delayTreble', v),
    });

    this._knobs.delayStereo = new Knob({
      container: grid, label: 'DLY STEREO', details: true,
      min: 0, max: 90, step: 10, value: p.delayStereo,
      onChange: v => presetStore.set('delayStereo', v),
    });

    this._knobs.reverbTreble = new Knob({
      container: grid, label: 'RVB TREBLE', details: true,
      min: 0, max: 90, step: 10, value: p.reverbTreble,
      onChange: v => presetStore.set('reverbTreble', v),
    });

    this._knobs.reverbTime = new Knob({
      container: grid, label: 'RVB ROOM', details: true,
      min: 0, max: 4, value: p.reverbTime,
      enumValues: REVERB_TIMES,
      onChange: v => presetStore.set('reverbTime', v),
    });

    return wrap;
  }

  _syncFromStore() {
    const p = presetStore.preset;
    Object.entries(this._knobs).forEach(([k, knob]) => {
      if (p[k] !== undefined) knob.setValue(p[k]);
    });
    Object.entries(this._toggles).forEach(([k, tog]) => {
      if (p[k] !== undefined) tog.setValue(p[k]);
    });
  }

  _bindStore() {
    this._unsub.push(presetStore.on('load', () => this._syncFromStore()));
    this._unsub.push(presetStore.on('change', ({ field, value }) => {
      if (field in this._knobs)   this._knobs[field]?.setValue(value);
      if (field in this._toggles) this._toggles[field]?.setValue(value);
    }));
  }


  destroy() {
    this._unsub.forEach(fn => typeof fn === 'function' && fn());
    Object.values(this._knobs).forEach(k => k.destroy());
    Object.values(this._toggles).forEach(t => t.destroy());
    this.container.innerHTML = '';
  }
}
