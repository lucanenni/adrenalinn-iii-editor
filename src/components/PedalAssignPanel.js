/**
 * PedalAssignPanel — the preset's MIDI Expression Pedals 1 & 2
 * (Destination and Amount, -99..+99 or Scale). The pedals' Source CC is a System
 * parameter and lives in the SYSTEM tab; the Effect Switch is in the PRESET card.
 *
 * All changes → presetStore.set()
 */

import { Knob } from './Knob.js';
import { presetStore } from '../store/presetStore.js';

// ── Pedal destination full names ──────────────────────────────────────────────
const PEDAL_DEST_NAMES = [
  'None',
  'Mod FX-Dry Mix', 'Mod FX Stereo', 'Mod FX Speed', 'Mod FX Depth',
  'Mod FX Frequency', 'Mod FX Resonance',
  'Amp Volume', 'Amp Drive', 'Amp Bass', 'Amp Mid', 'Amp Treble',
  'Comp Drive',
  'Delay Volume', 'Delay Time', 'Delay Repeats', 'Delay Stereo',
  'Reverb Volume',
  'Drum Volume', 'Drum FX Send', 'Drum Timebase', 'Tempo',
];

export class PedalAssignPanel {
  constructor(container) {
    this.container = container;
    this._knobs    = {};
    this._unsub    = [];
    this._build();
    this._syncFromStore();
    this._bindStore();
  }

  _build() {
    this.container.innerHTML = '';
    this.container.style.cssText = 'display:flex;flex-direction:column;gap:0;';
    this._buildPedalSection(1);
    this._buildPedalSection(2);
  }

  // ── Expression Pedal section ───────────────────────────────────────────────
  _buildPedalSection(n) {
    const wrap = this._makeSection(`MIDI Expression Pedal ${n}`, n===1?'var(--accent2)':'var(--blue)');
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;';
    wrap.appendChild(grid);
    this.container.appendChild(wrap);

    const p = presetStore.preset;
    const amountField = `pedal${n}Amount`;
    const destField   = `pedal${n}Dest`;

    // Destination selector
    const destCard = document.createElement('div');
    destCard.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    const destLabel = document.createElement('div');
    destLabel.style.cssText = 'font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);';
    destLabel.textContent = 'Destination';
    const destSel = document.createElement('select');
    destSel.style.cssText = `
      background:var(--bg3);border:1px solid var(--border);color:var(--text);
      font-family:var(--font-ui);font-size:10px;padding:4px 6px;
      border-radius:var(--radius);appearance:none;cursor:pointer;
    `;
    PEDAL_DEST_NAMES.forEach((name, i) => destSel.appendChild(new Option(name, i)));
    destSel.value = String(p[destField] ?? 0);
    destSel.onchange = () => presetStore.set(destField, parseInt(destSel.value));
    this[`_destSel${n}`] = destSel;
    destCard.append(destLabel, destSel);
    grid.appendChild(destCard);

    // Amount knob + SCA toggle
    const amtCard = document.createElement('div');
    amtCard.style.cssText = 'display:flex;flex-direction:column;gap:6px;align-items:center;';

    const curAmt = p[amountField];
    const isSCA  = curAmt === 'SCA';
    this[`_amtIsSCA${n}`] = isSCA;

    const amtKnob = new Knob({
      container: amtCard, label: `P${n} Amount`,
      min: -99, max: 99, value: isSCA ? 0 : (curAmt ?? 0),
      bipolar: true,
      onChange: v => {
        if (!this[`_amtIsSCA${n}`])
          presetStore.set(amountField, v);
      },
    });
    amtKnob.setEnabled(!isSCA); // Amount is meaningless while Scale mode is on
    this._knobs[amountField] = amtKnob;

    // SCA toggle
    const scaRow = document.createElement('div');
    scaRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const scaChk = document.createElement('input');
    scaChk.type    = 'checkbox';
    scaChk.checked = isSCA;
    scaChk.style.accentColor = 'var(--accent)';
    const scaLbl = document.createElement('label');
    scaLbl.textContent = 'Scale mode';
    scaLbl.style.cssText = 'font-size:9px;color:var(--text3);cursor:pointer;';
    scaLbl.prepend(scaChk);
    scaRow.appendChild(scaLbl);
    amtCard.appendChild(scaRow);

    scaChk.onchange = () => {
      this[`_amtIsSCA${n}`] = scaChk.checked;
      amtKnob.setEnabled(!scaChk.checked);
      presetStore.set(amountField, scaChk.checked ? 'SCA' : 0);
    };
    this[`_scaChk${n}`] = scaChk;

    grid.appendChild(amtCard);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  _makeSection(title, color) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:12px 16px;border-bottom:1px solid var(--border);';
    const hdr = document.createElement('div');
    hdr.style.cssText = `font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${color};margin-bottom:10px;`;
    hdr.textContent = title;
    wrap.appendChild(hdr);
    return wrap;
  }

  _makeCard(label, value) {
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:7px 9px;';
    card.innerHTML = `
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em">${label}</div>
      <div style="font-family:var(--font-ui);font-size:11px;color:var(--text2);margin-top:2px">${value}</div>
    `;
    return card;
  }

  // ── Sync ──────────────────────────────────────────────────────────────────
  _syncFromStore() {
    const p = presetStore.preset;
    [1,2].forEach(n => {
      const field = `pedal${n}Amount`;
      const val   = p[field];
      const isSCA = val === 'SCA';
      this[`_amtIsSCA${n}`] = isSCA;
      if (this._knobs[field]) {
        this._knobs[field].setValue(isSCA ? 0 : (val ?? 0));
        this._knobs[field].setEnabled(!isSCA);
      }
      if (this[`_scaChk${n}`]) this[`_scaChk${n}`].checked = isSCA;
      if (this[`_destSel${n}`]) this[`_destSel${n}`].value = String(p[`pedal${n}Dest`] ?? 0);
    });
  }

  _bindStore() {
    this._unsub.push(presetStore.on('load', () => this._syncFromStore()));
    this._unsub.push(presetStore.on('change', ({ field }) => {
      if (['pedal1Dest','pedal2Dest','pedal1Amount','pedal2Amount'].includes(field)) this._syncFromStore();
    }));
  }

  destroy() {
    this._unsub.forEach(fn => typeof fn === 'function' && fn());
    Object.values(this._knobs).forEach(k => k.destroy?.());
    this.container.innerHTML = '';
  }
}
