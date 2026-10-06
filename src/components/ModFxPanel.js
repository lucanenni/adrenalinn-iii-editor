/**
 * ModFxPanel — Rows 1 & 2 of the AdrenaLinn III preset editor
 * Mod Effect, Variation, FX-Dry, Mod On, Speed, Depth, Frequency,
 * Resonance + Details: Stereo, FX Order, Mod Source, LFO Wave, Filter Type, Volume
 */

import { Knob, Toggle } from './Knob.js';
import { presetStore } from '../store/presetStore.js';
import {
  MOD_EFFECTS, MOD_SOURCES, LFO_WAVES, FX_ORDER, FILTER_TYPE_LABELS, filterTypeOptions, MOD_EFFECT_NAMES,
  FX_ORDER_NAMES, MOD_SOURCE_NAMES, LFO_WAVE_NAMES, FILTER_TYPE_NAMES,
} from '../midi/presetData.js';

// ── Variation counts per Mod Effect ──────────────────────────────────────────
const VARIATION_MAX = [6,7,7,2,3,6,3,21,21,21,12,7,2,6,5,6,5,5];


export class ModFxPanel {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container   = container;
    this._knobs      = {};
    this._toggles    = {};
    this._unsub      = [];

    this._build();
    this._bindStore();
    this._syncFromStore();
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  _build() {
    this.container.innerHTML = '';

    // Main row (always visible)
    this._mainRow = this._buildSection('MOD FX — Main', false);
    // Details row (toggled)
    this._buildSection('Details', true);
  }

  _buildSection(title, isDetails) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:12px 14px;border-bottom:1px solid var(--border);';

    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);margin-bottom:10px;';
    lbl.textContent = title;
    wrap.appendChild(lbl);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px 8px;align-items:flex-start;';
    wrap.appendChild(grid);
    this.container.appendChild(wrap);

    if (!isDetails) {
      this._buildMainKnobs(grid);
    } else {
      this._buildDetailKnobs(grid);
    }
    return wrap;
  }

  _buildMainKnobs(grid) {
    const p = presetStore.preset;

    // Mod Effect selector
    this._knobs.modEffect = new Knob({
      container: grid, label: 'MOD EFFECT',
      min: 0, max: 17, value: p.modEffect,
      enumValues: MOD_EFFECTS,
      valueNames: MOD_EFFECT_NAMES,
      onChange: v => { presetStore.set('modEffect', v); this._onEffectChange(v, true); },
    });

    // Variation
    this._knobs.variation = new Knob({
      container: grid, label: 'VARIATION',
      min: 1, max: VARIATION_MAX[p.modEffect] ?? 21, value: p.variation,
      onChange: v => presetStore.set('variation', v),
    });

    // FX-Dry Mix
    this._knobs.fxDryMix = new Knob({
      container: grid, label: 'FX-DRY',
      min: 0, max: 99, value: p.fxDryMix,
      onChange: v => presetStore.set('fxDryMix', v),
    });

    // Mod On toggle
    this._toggles.modOn = new Toggle({
      container: grid, label: 'MOD ON',
      value: p.modOn,
      onChange: v => presetStore.set('modOn', v),
    });

    // Speed
    this._knobs.speed = new Knob({
      container: grid, label: 'SPEED',
      min: 0, max: 115, value: p.speed,
      onChange: v => presetStore.set('speed', v),
    });

    // Depth (bipolar -99..+99)
    this._knobs.depth = new Knob({
      container: grid, label: 'DEPTH',
      min: -99, max: 99, value: p.depth, bipolar: true,
      onChange: v => presetStore.set('depth', v),
    });

    // Frequency
    this._knobs.frequency = new Knob({
      container: grid, label: 'FREQUENCY',
      min: 0, max: 99, value: p.frequency,
      onChange: v => presetStore.set('frequency', v),
    });

    // Resonance
    this._knobs.resonance = new Knob({
      container: grid, label: 'RESONANCE',
      min: 0, max: 99, value: p.resonance,
      onChange: v => presetStore.set('resonance', v),
    });

    // Mod FX Volume
    this._knobs.modVolume = new Knob({
      container: grid, label: 'MOD VOL',
      min: 0, max: 99, value: p.modVolume,
      onChange: v => presetStore.set('modVolume', v),
    });
  }

  _buildDetailKnobs(grid) {
    const p = presetStore.preset;

    // Stereo width
    this._knobs.stereo = new Knob({
      container: grid, label: 'STEREO', details: true,
      min: 0, max: 90, step: 10, value: p.stereo,
      onChange: v => presetStore.set('stereo', v),
    });

    // FX Order
    this._knobs.fxOrder = new Knob({
      container: grid, label: 'FX ORDER', details: true,
      min: 0, max: 3, value: p.fxOrder,
      enumValues: FX_ORDER, valueNames: FX_ORDER_NAMES,
      onChange: v => presetStore.set('fxOrder', v),
    });

    // Mod Source
    this._knobs.modSource = new Knob({
      container: grid, label: 'MOD SRC', details: true,
      min: 0, max: 10, value: p.modSource,
      enumValues: MOD_SOURCES, valueNames: MOD_SOURCE_NAMES,
      onChange: v => presetStore.set('modSource', v),
    });

    // LFO Wave
    this._knobs.lfoWave = new Knob({
      container: grid, label: 'LFO WAVE', details: true,
      min: 0, max: 4, value: p.lfoWave,
      enumValues: LFO_WAVES, valueNames: LFO_WAVE_NAMES,
      onChange: v => presetStore.set('lfoWave', v),
    });

    // Filter Type: the knob is an index into the options valid for the active
    // Mod Effect (this._filterRaws), NOT the raw byte value — see _syncFilterKnob.
    const choices = this._filterChoices(p.modEffect, p.filterType);
    this._filterRaws = choices.raws;
    this._knobs.filterType = new Knob({
      container: grid, label: 'FILTER', details: true,
      min: 0, max: choices.labels.length - 1, value: choices.raws.indexOf(p.filterType),
      enumValues: choices.labels, valueNames: choices.names,
      onChange: i => {
        const raw = this._filterRaws[i];
        if (raw !== undefined && raw !== presetStore.preset.filterType) presetStore.set('filterType', raw);
      },
    });
    this._knobs.filterType.setEnabled(choices.raws.length > 1 && filterTypeOptions(p.modEffect).length > 1);
  }

  // ── Sync from store ────────────────────────────────────────────────────────
  _syncFromStore() {
    const p = presetStore.preset;
    Object.entries(this._knobs).forEach(([k, knob]) => {
      if (k !== 'filterType' && p[k] !== undefined) knob.setValue(p[k]);
    });
    Object.entries(this._toggles).forEach(([k, tog]) => {
      if (p[k] !== undefined) tog.setValue(p[k]);
    });
    this._onEffectChange(p.modEffect, false);
  }

  // ── When modEffect changes, update dependent ranges ────────────────────────
  // Variation's valid count and Filter Type's option list both depend on
  // which Mod Effect is active. Any clamp applied here is also written back
  // to presetStore so the stored preset never holds an out-of-range value
  // that only looked correct because the knob display had clamped it.
  // coerce=true only when the user picked a new effect: then a Filter Type that
  // isn't valid for it is replaced by the first valid one. When a preset was
  // merely loaded (coerce=false) the stored value is shown as-is, never rewritten.
  _onEffectChange(effectIdx, coerce) {
    const maxVar = VARIATION_MAX[effectIdx] ?? 21;
    const varKnob = this._knobs.variation;
    if (varKnob) {
      varKnob.max = maxVar;
      const clamped = Math.min(varKnob.value, maxVar);
      varKnob.setValue(clamped);
      if (clamped !== presetStore.preset.variation) presetStore.set('variation', clamped);
    }

    this._syncFilterKnob(effectIdx, coerce);
  }

  // Raw Filter Type values offered for an effect. A stored value outside the
  // documented set (e.g. from a loaded preset) is appended so the UI shows the
  // truth instead of silently displaying something else.
  _filterChoices(effectIdx, stored) {
    const raws = [...filterTypeOptions(effectIdx)];
    if (!raws.includes(stored)) raws.push(stored);
    return {
      raws,
      labels: raws.map(r => FILTER_TYPE_LABELS[r] ?? `#${r}`),
      names:  raws.map(r => FILTER_TYPE_NAMES[r] ?? 'Unknown value'),
    };
  }

  _syncFilterKnob(effectIdx, coerce) {
    const knob = this._knobs.filterType;
    if (!knob) return;
    let stored = presetStore.preset.filterType;
    const valid = filterTypeOptions(effectIdx);
    // With a connected pedal the pedal itself picks the new effect's Filter Type — adopt it, don't override
    if (coerce && !presetStore.syncsFromDevice && valid.length && !valid.includes(stored)) {
      stored = valid[0];
      presetStore.set('filterType', stored);
    }
    const { raws, labels, names } = this._filterChoices(effectIdx, stored);
    this._filterRaws = raws;
    knob.setEnumValues(labels, names);
    knob.setValue(raws.indexOf(stored));
    knob.setEnabled(valid.length > 1);
  }

  // ── Store subscriptions ────────────────────────────────────────────────────
  _bindStore() {
    this._unsub.push(presetStore.on('load', () => this._syncFromStore()));

    // React to individual field changes coming from other sources (e.g. MIDI in)
    this._unsub.push(presetStore.on('change', ({ field, value }) => {
      if (field === 'filterType') this._syncFilterKnob(presetStore.preset.modEffect, false);
      else if (field in this._knobs) this._knobs[field]?.setValue(value);
      if (field in this._toggles) this._toggles[field]?.setValue(value);
    }));

    this._unsub.push(presetStore.on('dirty', ({ dirty }) => {
      if (this._dirtyDot) {
        this._dirtyDot.style.display = dirty ? '' : 'none';
        this._dirtyDot.style.background = dirty ? 'var(--amber)' : 'var(--border2)';
        this._dirtyDot.style.boxShadow  = dirty ? '0 0 6px var(--amber)' : 'none';
      }
    }));
  }


  destroy() {
    this._unsub.forEach(fn => typeof fn === 'function' && fn());
    Object.values(this._knobs).forEach(k => k.destroy());
    Object.values(this._toggles).forEach(t => t.destroy());
    this.container.innerHTML = '';
  }
}
