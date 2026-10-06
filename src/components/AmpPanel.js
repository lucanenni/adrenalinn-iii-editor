/**
 * AmpPanel — Rows 3 & 4 of the AdrenaLinn III preset editor
 * Amp model, Drive, Bass, Mid, Treble, Amp Volume, Amp On, Boost
 * + Details: Post Treble, Compressor Drive, Compressor Volume, Compressor On
 */

import { Knob, Toggle } from './Knob.js';
import { presetStore } from '../store/presetStore.js';
import { AMP_MODELS, AMP_MODEL_NAMES as AMP_NAMES } from '../midi/presetData.js';

// ── Amp model full names for tooltip ─────────────────────────────────────────

export class AmpPanel {
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

    this._buildMainSection();
    this._buildCompressorSection();
  }

  _buildMainSection() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:12px 14px;border-bottom:1px solid var(--border);';

    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);margin-bottom:10px;';
    lbl.textContent = 'Amp Model & EQ';
    wrap.appendChild(lbl);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px 8px;align-items:flex-start;';
    wrap.appendChild(grid);
    this.container.appendChild(wrap);

    const p = presetStore.preset;

    // Amp selector
    this._knobs.amp = new Knob({
      container: grid, label: 'AMP MODEL',
      min: 0, max: 39, value: p.amp,
      enumValues: AMP_MODELS,
      valueNames: AMP_NAMES,
      onChange: v => {
        presetStore.set('amp', v);
      },
    });

    // Amp On
    this._toggles.ampOn = new Toggle({
      container: grid, label: 'AMP ON',
      value: p.ampOn,
      onChange: v => presetStore.set('ampOn', v),
    });

    // Drive
    this._knobs.ampDrive = new Knob({
      container: grid, label: 'DRIVE',
      min: 0, max: 99, value: p.ampDrive,
      onChange: v => presetStore.set('ampDrive', v),
    });

    // Bass
    this._knobs.ampBass = new Knob({
      container: grid, label: 'BASS',
      min: 0, max: 99, value: p.ampBass,
      onChange: v => presetStore.set('ampBass', v),
    });

    // Mid
    this._knobs.ampMid = new Knob({
      container: grid, label: 'MID',
      min: 0, max: 99, value: p.ampMid,
      onChange: v => presetStore.set('ampMid', v),
    });

    // Treble
    this._knobs.ampTreble = new Knob({
      container: grid, label: 'TREBLE',
      min: 0, max: 99, value: p.ampTreble,
      onChange: v => presetStore.set('ampTreble', v),
    });

    // Amp Volume
    this._knobs.ampVolume = new Knob({
      container: grid, label: 'AMP VOL',
      min: 0, max: 99, value: p.ampVolume,
      onChange: v => presetStore.set('ampVolume', v),
    });

    // Boost
    this._knobs.ampBoost = new Knob({
      container: grid, label: 'BOOST AMT',
      min: 10, max: 90, step: 10, value: p.ampBoost,
      onChange: v => presetStore.set('ampBoost', v),
    });

    // Post Treble (details)
    this._knobs.postTreble = new Knob({
      container: grid, label: 'POST TRB', details: true,
      min: 0, max: 90, step: 10, value: p.postTreble,
      onChange: v => presetStore.set('postTreble', v),
    });
  }

  _buildCompressorSection() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:12px 14px;border-bottom:1px solid var(--border);';

    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);margin-bottom:10px;';
    lbl.textContent = 'Compressor (Details)';
    wrap.appendChild(lbl);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px 8px;align-items:flex-start;';
    wrap.appendChild(grid);
    this.container.appendChild(wrap);

    const p = presetStore.preset;

    this._toggles.comprOn = new Toggle({
      container: grid, label: 'COMP ON', details: true,
      value: p.comprOn,
      onChange: v => presetStore.set('comprOn', v),
    });

    this._knobs.comprDrive = new Knob({
      container: grid, label: 'COMP DRV', details: true,
      min: 0, max: 90, step: 10, value: p.comprDrive,
      onChange: v => presetStore.set('comprDrive', v),
    });

    this._knobs.comprVolume = new Knob({
      container: grid, label: 'COMP VOL', details: true,
      min: 0, max: 90, step: 10, value: p.comprVolume,
      onChange: v => presetStore.set('comprVolume', v),
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
