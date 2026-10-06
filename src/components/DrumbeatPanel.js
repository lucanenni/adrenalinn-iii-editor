/**
 * DrumbeatPanel — Drumbeat settings + Sequencer
 * Combines the DRUMS row parameters with the 32-step grid.
 */

import { Knob, Toggle } from './Knob.js';
import { SequencerGrid } from './SequencerGrid.js';
import { drumbeatStore } from '../store/drumbeatStore.js';
import {
  TIMEBASES, TIMEBASE_LABELS, BASS_SOUNDS, SNARE_SOUNDS,
  HIHAT_SOUNDS, PERC_BANKS, fxSendLabel,
} from '../midi/drumbeatData.js';

// ── FX Send display options ───────────────────────────────────────────────────
// Values: 0-99=delay, 100-199=input, 200-249=reverb
// We expose 3 knobs: delayAmt, inputAmt, reverbAmt + a mode selector
const FX_SEND_MODES = ['Off', 'Delay', 'Input', 'Reverb'];

// ── Treble/Dist mode ──────────────────────────────────────────────────────────
const TD_MODES = ['Off','Treble','Distortion'];

export class DrumbeatPanel {
  constructor(container) {
    this.container   = container;
    this._knobs      = {};
    this._toggles    = {};
    this._unsub      = [];
    this._seqGrid    = null;

    this._build();
    this._bindStore();
    this._syncFromStore();
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  _build() {
    this.container.innerHTML = '';

    // ── Section header ────────────────────────────────────────────────────
    const hdr = document.createElement('div');
    hdr.style.cssText = `
      display:flex;align-items:center;gap:10px;
      padding:8px 14px;background:var(--bg3);
      border-bottom:1px solid var(--border);
      position:sticky;top:0;z-index:5;
    `;
    hdr.innerHTML = `
      <span style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--amber)">DRUMBEAT</span>
      <span style="font-size:9px;color:var(--text3)" id="dbTimbaseLabel"></span>
      <div id="dbDirtyDot" style="width:7px;height:7px;border-radius:50%;background:var(--border2);display:none;transition:all .3s"></div>
      <div style="display:flex;gap:6px;margin-left:auto">
        <button class="btn sm" id="btnReqDb" title="Pull drumbeat edit buffer from device">⬇ Pull</button>
        <button class="btn sm" id="btnSendDb" title="Push drumbeat to device">⬆ Push</button>
        <button class="btn sm" id="btnRevertDb" title="Revert changes" disabled>↩</button>
        <button class="btn sm" id="btnResetDb" title="Reset to defaults">⊘ Reset</button>
      </div>
    `;
    this.container.appendChild(hdr);
    this._dirtyDot = hdr.querySelector('#dbDirtyDot');
    this._timbaseLabel = hdr.querySelector('#dbTimbaseLabel');

    // ── Settings row ──────────────────────────────────────────────────────
    this._buildSettingsRow();

    // ── Sound selection (Details) ─────────────────────────────────────────
    this._buildSoundSection();

    // ── Sequencer grid ────────────────────────────────────────────────────
    const seqWrap = document.createElement('div');
    seqWrap.style.cssText = 'background:var(--bg2);border-top:1px solid var(--border);';
    this.container.appendChild(seqWrap);
    this._seqGrid = new SequencerGrid(seqWrap);

    // ── Wire header buttons ───────────────────────────────────────────────
    hdr.querySelector('#btnReqDb').onclick = () => {
      drumbeatStore.requestEditBuffer();
    };
    hdr.querySelector('#btnSendDb').onclick = () => {
      drumbeatStore.sendToDevice();
    };
    hdr.querySelector('#btnRevertDb').onclick = () => {
      drumbeatStore.revert();
    };
    hdr.querySelector('#btnResetDb').onclick = () => {
      if (confirm('Reset drumbeat to defaults?')) drumbeatStore.reset();
    };
  }

  _buildSettingsRow() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:12px 14px;border-bottom:1px solid var(--border);background:var(--bg2);';

    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);margin-bottom:10px;';
    lbl.textContent = 'Drumbeat Settings';
    wrap.appendChild(lbl);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px 8px;align-items:flex-start;';
    wrap.appendChild(grid);
    this.container.appendChild(wrap);

    const db = drumbeatStore.db;

    // Volume
    this._knobs.volume = new Knob({
      container: grid, label: 'VOLUME',
      min: 0, max: 99, value: db.volume,
      onChange: v => drumbeatStore.set('volume', v),
    });

    // Tempo
    this._knobs.tempo = new Knob({
      container: grid, label: 'TEMPO',
      min: 30, max: 250, value: db.tempo, unit:' BPM',
      onChange: v => drumbeatStore.set('tempo', v),
    });

    // Timebase
    this._knobs.timebase = new Knob({
      container: grid, label: 'TIMEBASE',
      min: 0, max: 4, value: db.timebase,
      enumValues: TIMEBASES,
      onChange: v => {
        drumbeatStore.set('timebase', v);
        if (this._timbaseLabel) this._timbaseLabel.textContent = TIMEBASE_LABELS[v] ?? '';
      },
    });

    // FX Send — show as a knob over 0-249, but label intelligently
    this._knobs.fxSend = new Knob({
      container: grid, label: 'FX SEND',
      min: 0, max: 249, value: db.fxSend,
      onChange: v => {
        drumbeatStore.set('fxSend', v);
        this._updateFxSendLabel(v);
      },
    });

    // Treble/Dist mode
    this._knobs.trebleDistMode = new Knob({
      container: grid, label: 'TONE MODE',
      min: 0, max: 2, value: ['off','treble','dist'].indexOf(db.trebleDistMode),
      enumValues: TD_MODES,
      onChange: v => drumbeatStore.set('trebleDistMode', ['off','treble','dist'][v] ?? 'off'),
    });

    // Treble/Dist amount
    this._knobs.trebleDistValue = new Knob({
      container: grid, label: 'TONE AMT',
      min: 0, max: 90, step: 10, value: db.trebleDistValue,
      onChange: v => drumbeatStore.set('trebleDistValue', v),
    });

    // FX send label
    this._fxSendValueEl = document.createElement('div');
    this._fxSendValueEl.style.cssText = 'font-size:10px;color:var(--text2);padding-top:20px;font-family:var(--font-ui)';
    grid.appendChild(this._fxSendValueEl);
    this._updateFxSendLabel(db.fxSend);
  }

  _updateFxSendLabel(val) {
    if (!this._fxSendValueEl) return;
    this._fxSendValueEl.textContent = fxSendLabel(val);
  }

  _buildSoundSection() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:12px 14px;border-bottom:1px solid var(--border);background:var(--bg2);';

    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);margin-bottom:10px;';
    lbl.textContent = 'Sound Selection (Details)';
    wrap.appendChild(lbl);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;';
    wrap.appendChild(grid);
    this.container.appendChild(wrap);

    const db = drumbeatStore.db;

    // Sound+volume pairs for each voice
    const voices = [
      { key: 'bass',  label: 'BASS',  sounds: BASS_SOUNDS,  color: 'var(--blue)' },
      { key: 'snare', label: 'SNARE', sounds: SNARE_SOUNDS, color: 'var(--accent2)' },
      { key: 'hihat', label: 'HIHAT', sounds: HIHAT_SOUNDS, color: 'var(--green)' },
    ];

    voices.forEach(({ key, label, sounds, color }) => {
      const card = document.createElement('div');
      card.style.cssText = 'background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:10px;';

      const lbl2 = document.createElement('div');
      lbl2.style.cssText = `font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:${color};margin-bottom:8px;font-weight:700`;
      lbl2.textContent = label;
      card.appendChild(lbl2);

      const inner = document.createElement('div');
      inner.style.cssText = 'display:flex;gap:8px;align-items:flex-start;';
      card.appendChild(inner);

      // Sound selector
      const soundKnob = new Knob({
        container: inner, label: 'SOUND', details: true,
        min: 0, max: 8, value: Math.max(0, (db[key]?.sound ?? 1) - 1),
        enumValues: sounds,
        onChange: v => drumbeatStore.set(key, { ...drumbeatStore.db[key], sound: v + 1 }),
      });
      this._knobs[`${key}Sound`] = soundKnob;

      // Volume knob
      const volKnob = new Knob({
        container: inner, label: 'VOL', details: true,
        min: 0, max: 9, value: db[key]?.volume ?? 7,
        onChange: v => drumbeatStore.set(key, { ...drumbeatStore.db[key], volume: v }),
      });
      this._knobs[`${key}Volume`] = volKnob;

      grid.appendChild(card);
    });

    // Percussion (special: bank + volume)
    const percCard = document.createElement('div');
    percCard.style.cssText = 'background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:10px;';

    const percLbl = document.createElement('div');
    percLbl.style.cssText = 'font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--amber);margin-bottom:8px;font-weight:700';
    percLbl.textContent = 'PERCUSSION';
    percCard.appendChild(percLbl);

    const percBankLabels = PERC_BANKS.map((b,i)=>`Bank ${i+1}: ${b[0].split(' ')[0]}`);
    const percInner = document.createElement('div');
    percInner.style.cssText = 'display:flex;gap:8px;align-items:flex-start;';
    percCard.appendChild(percInner);

    const percBankKnob = new Knob({
      container: percInner, label: 'BANK', details: true,
      min: 0, max: 4, value: Math.max(0, (db.perc?.sound ?? 1) - 1),
      enumValues: percBankLabels,
      onChange: v => drumbeatStore.set('perc', { ...drumbeatStore.db.perc, sound: v + 1 }),
    });
    this._knobs['percSound'] = percBankKnob;

    const percVolKnob = new Knob({
      container: percInner, label: 'VOL', details: true,
      min: 0, max: 9, value: db.perc?.volume ?? 5,
      onChange: v => drumbeatStore.set('perc', { ...drumbeatStore.db.perc, volume: v }),
    });
    this._knobs['percVolume'] = percVolKnob;

    // Perc bank sound list display
    this._percSoundList = document.createElement('div');
    this._percSoundList.style.cssText = 'font-size:9px;color:var(--text3);margin-top:6px;line-height:1.6;';
    percCard.appendChild(this._percSoundList);
    this._updatePercSoundList(Math.max(0, (db.perc?.sound ?? 1) - 1));

    percBankKnob._onChange = v => {
      drumbeatStore.set('perc', { ...drumbeatStore.db.perc, sound: v + 1 });
      this._updatePercSoundList(v);
    };

    grid.appendChild(percCard);

    return wrap;
  }

  _updatePercSoundList(bankIdx) {
    if (!this._percSoundList) return;
    const bank = PERC_BANKS[bankIdx] ?? [];
    this._percSoundList.innerHTML = bank.map((s,i)=>`
      <div>Perc${i+1}: <span style="color:var(--text2)">${s}</span></div>`).join('');
  }

  // ── Sync from store ───────────────────────────────────────────────────────
  _syncFromStore() {
    const db = drumbeatStore.db;

    if (this._knobs.volume)           this._knobs.volume.setValue(db.volume);
    if (this._knobs.tempo)            this._knobs.tempo.setValue(db.tempo);
    if (this._knobs.timebase)         this._knobs.timebase.setValue(db.timebase);
    if (this._knobs.fxSend)           this._knobs.fxSend.setValue(db.fxSend);
    if (this._knobs.trebleDistValue)  this._knobs.trebleDistValue.setValue(db.trebleDistValue);
    if (this._knobs.trebleDistMode) {
      this._knobs.trebleDistMode.setValue(['off','treble','dist'].indexOf(db.trebleDistMode));
    }

    // Sound/volume knobs
    ['bass','snare','hihat'].forEach(key => {
      this._knobs[`${key}Sound`]?.setValue((db[key]?.sound ?? 1) - 1);
      this._knobs[`${key}Volume`]?.setValue(db[key]?.volume ?? 7);
    });
    this._knobs['percSound']?.setValue((db.perc?.sound ?? 1) - 1);
    this._knobs['percVolume']?.setValue(db.perc?.volume ?? 5);

    this._updateFxSendLabel(db.fxSend);
    if (this._timbaseLabel) this._timbaseLabel.textContent = TIMEBASE_LABELS[db.timebase] ?? '';
  }

  // ── Store subscriptions ───────────────────────────────────────────────────
  _bindStore() {
    this._unsub.push(drumbeatStore.on('load', () => this._syncFromStore()));

    this._unsub.push(drumbeatStore.on('change', ({ field, value }) => {
      if (field === 'volume'          && this._knobs.volume)          this._knobs.volume.setValue(value);
      if (field === 'tempo'           && this._knobs.tempo)           this._knobs.tempo.setValue(value);
      if (field === 'timebase'        && this._knobs.timebase) {
        this._knobs.timebase.setValue(value);
        if (this._timbaseLabel) this._timbaseLabel.textContent = TIMEBASE_LABELS[value] ?? '';
      }
      if (field === 'fxSend'          && this._knobs.fxSend) {
        this._knobs.fxSend.setValue(value);
        this._updateFxSendLabel(value);
      }
      if (field === 'trebleDistValue' && this._knobs.trebleDistValue) this._knobs.trebleDistValue.setValue(value);
      if (field === 'trebleDistMode'  && this._knobs.trebleDistMode) {
        this._knobs.trebleDistMode.setValue(['off','treble','dist'].indexOf(value));
      }
    }));

    this._unsub.push(drumbeatStore.on('dirty', ({ dirty }) => {
      if (this._dirtyDot) {
        this._dirtyDot.style.display = dirty ? '' : 'none';
        this._dirtyDot.style.background = dirty ? 'var(--amber)' : 'var(--border2)';
        this._dirtyDot.style.boxShadow  = dirty ? '0 0 6px var(--amber)' : 'none';
      }
      const btn = document.getElementById('btnRevertDb');
      if (btn) btn.disabled = !dirty;
    }));
  }

  // ── Details mode ──────────────────────────────────────────────────────────

  destroy() {
    this._unsub.forEach(fn => typeof fn === 'function' && fn());
    Object.values(this._knobs).forEach(k => k.destroy?.());
    this._seqGrid?.destroy();
    this.container.innerHTML = '';
  }
}
