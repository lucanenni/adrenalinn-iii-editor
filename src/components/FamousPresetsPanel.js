/**
 * AdrenaLinn III — Famous presets list
 * Third source of the LIBRARY tab (next to Presets / Drumbeats): presets inspired by famous
 * songs, from src/midi/famousPresets.js. "Load" puts one into the editor exactly like the
 * library's ✏ Edit does — together with its drumbeat, whose 44 bytes are stored with the preset.
 * The three ways to use one: write it to a slot (editor's Save Slot dialog), send it live to the
 * pedal's edit buffers without saving, or get its SysEx code (SysexDialog) without touching anything.
 * Descriptions come from our own static data module, never from user input, so they are
 * inserted as HTML (they contain <strong>/<code>/<br>).
 */
import { FAMOUS_SONGS, FAMOUS_KIND_LABELS } from '../midi/famousPresets.js';
import { parsePreset, MOD_EFFECT_NAMES, AMP_MODEL_NAMES } from '../midi/presetData.js';
import { presetStore } from '../store/presetStore.js';
import { drumbeatStore } from '../store/drumbeatStore.js';
import { midi } from '../midi/midiManager.js';

const KIND_COLOR = {
  factory: 'var(--green)',
};

// The drumbeat that goes with a preset, playing at the preset's tempo: with Tempo Source = Drumbeat tempo the
// pedal plays the drumbeat's own tempo (verified on hardware), but the FAQ's tempo (e.g. 97 BPM) is the preset's.
const drumbeatFor = p => { const d = Uint8Array.from(p.drumbeat); d[8] = p.raw[30]; return d; };

const el = (tag, css = '', text = '') => {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
};

export class FamousPresetsPanel {
  constructor(container) {
    this.container = container;
    this._filter = '';
    this._open = new Set();
    this._message = '';
    this.container.style.cssText = 'padding:14px;display:flex;flex-direction:column;gap:12px;';
    this.render();
    midi.on('connectionChange', () => this.render()); // the live / write buttons only exist while connected
  }

  render(filter = this._filter) {
    this._filter = filter;
    this.container.innerHTML = '';

    const note = el('div',
      'font-size:11px;line-height:1.6;color:var(--text3);border:1px solid var(--border);border-radius:var(--radius);padding:8px 12px;');
    note.innerHTML = 'John Mayer and Green Day songs that Roger Linn Design documents; each entry is a <em>real factory preset</em> of the pedal ' +
      '(preset numbers from the AdrenaLinn III FAQ and the official Preset Listing, with the tempo and drumbeat the FAQ gives). '+
      'Each preset carries its own drumbeat data, so it can be written from scratch even if your factory slots were edited. ' +
      '<strong>Load</strong> puts preset + drumbeat in the editor; <strong>Save Slot</strong> stores the preset on the pedal.';
    this.container.appendChild(note);

    this._status = el('div', 'font-size:11px;color:var(--green);min-height:14px;font-family:var(--font-ui);', this._message);
    this.container.appendChild(this._status);

    const q = filter.trim().toLowerCase();
    let songs = 0, presets = 0;
    for (const song of FAMOUS_SONGS) {
      const hay = `${song.title} ${song.artist} ${song.presets.map(p => p.name).join(' ')}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      songs++; presets += song.presets.length;
      this.container.appendChild(this._songCard(song));
    }
    if (!songs) this.container.appendChild(el('div', 'color:var(--text3);font-size:12px;padding:20px;text-align:center;', 'No song matches.'));
    this.onCount?.(`${songs} songs · ${presets} presets`);
  }

  _songCard(song) {
    const card = el('div', 'border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2);');

    const head = el('div', 'display:flex;gap:12px;align-items:flex-start;padding:12px 14px;');
    head.appendChild(el('div', 'font-size:24px;line-height:1;', song.emoji));
    const info = el('div', 'flex:1;min-width:0;');
    info.appendChild(el('div', 'font-size:14px;font-weight:600;color:var(--text);', song.title));
    info.appendChild(el('div', 'font-size:11px;color:var(--text3);margin-top:2px;', song.artist));
    const desc = el('div', 'font-size:11px;line-height:1.6;color:var(--text2);margin-top:6px;');
    desc.innerHTML = song.desc;
    info.appendChild(desc);
    head.appendChild(info);
    const badge = el('div',
      `font-size:9px;font-family:var(--font-ui);white-space:nowrap;border:1px solid ${KIND_COLOR[song.kind]};` +
      `color:${KIND_COLOR[song.kind]};border-radius:4px;padding:2px 7px;`, song.sourceLabel);
    badge.title = FAMOUS_KIND_LABELS[song.kind];
    head.appendChild(badge);
    card.appendChild(head);

    for (const p of song.presets) card.appendChild(this._presetRow(song, p));
    return card;
  }

  _presetRow(song, p) {
    const wrap = el('div', 'border-top:1px solid var(--border);');
    const row = el('div', 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 14px;');

    const toggle = el('button', 'background:none;border:none;color:var(--text3);cursor:pointer;font-size:11px;padding:0 4px;');
    const isOpen = this._open.has(p.id);
    toggle.textContent = isOpen ? '▾' : '▸';
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.title = 'Show settings and how to play';
    row.appendChild(toggle);

    row.appendChild(el('div', 'font-size:12px;font-weight:600;color:var(--text);', p.name));
    for (const t of p.tags) {
      row.appendChild(el('span',
        'font-size:9px;font-family:var(--font-ui);background:var(--bg3);border:1px solid var(--border);' +
        'border-radius:3px;padding:1px 6px;color:var(--text2);', t));
    }
    row.appendChild(el('div', 'flex:1;'));

    const add = (label, title, fn) => {
      const b = el('button', '', label);
      b.className = 'btn sm'; b.title = title; b.onclick = fn;
      row.appendChild(b);
    };
    add('✏ Load', 'Load into the editor only (does not touch the pedal)', () => this._load(p, false));
    if (midi.connected) {
      add('⬆ Send live', 'Load into the editor and send preset + drumbeat to the pedal\'s edit buffers — temporary, nothing is saved',
        () => this._load(p, true));
      add('💾 Write to slot…', 'Load into the editor and open Save Slot to write the preset to a slot of the pedal (flash)',
        () => this._writeToSlot(p));
    }
    add('</> SysEx', 'Show the SysEx bytes of this preset (and its drumbeat) to copy or download',
      () => window._openSysexDialog?.({ title: p.name, preset: p.raw, drumbeat: drumbeatFor(p) }));
    wrap.appendChild(row);

    const detail = el('div',
      'display:' + (isOpen ? 'block' : 'none') + ';padding:4px 14px 12px 40px;font-size:11px;line-height:1.7;color:var(--text2);');
    detail.appendChild(this._summary(p));
    const how = el('div', 'margin-top:8px;');
    how.innerHTML = p.howto;
    detail.appendChild(how);
    wrap.appendChild(detail);

    toggle.onclick = () => {
      const open = detail.style.display === 'none';
      detail.style.display = open ? 'block' : 'none';
      toggle.textContent = open ? '▾' : '▸';
      toggle.setAttribute('aria-expanded', String(open));
      open ? this._open.add(p.id) : this._open.delete(p.id);
    };
    return wrap;
  }

  _summary(p) {
    const d = parsePreset(p.raw);
    const on = v => v ? 'on' : 'off';
    const parts = [
      `Mod FX: ${MOD_EFFECT_NAMES[d.modEffect] ?? d.modEffect} (variation ${d.variation}, ${on(d.modOn)})`,
      `Amp: ${AMP_MODEL_NAMES[d.amp] ?? d.amp} (${on(d.ampOn)}, drive ${d.ampDrive})`,
      `Delay ${on(d.delayOn)}${d.delayOn ? ` · vol ${d.delayVolume}, repeats ${d.delayRepeats}` : ''}`,
      `Reverb ${on(d.reverbOn)}${d.reverbOn ? ` · vol ${d.reverbVolume}` : ''}`,
      `Tempo ${d.presetTempo} BPM`,
      p.drumbeatSlot !== undefined
        ? `Drumbeat: factory #${p.drumbeatSlot}${p.drumbeatName ? ` “${p.drumbeatName}”` : ''} (${p.drumbeat.length} bytes included)`
        : `Drumbeat: hand-made (${p.drumbeat.length} bytes included)`,
    ];
    const box = el('div');
    box.appendChild(el('div', 'font-family:var(--font-ui);font-size:10px;color:var(--text3);', parts.join('  ·  ')));
    if (p.base) {
      const b = el('div', 'margin-top:6px;');
      b.appendChild(el('div', 'font-size:11px;color:var(--text2);',
        (p.base.name ? `Factory preset #${p.base.slot} “${p.base.name}”` : `Factory preset #${p.base.slot}`) +
        (p.base.changes.length ? ', with the FAQ\'s settings applied (the stored bytes are the result):' : ', unmodified.')));
      if (p.base.changes.length) {
        const ul = el('ul', 'margin:2px 0 0 18px;padding:0;font-size:11px;color:var(--text2);');
        for (const c of p.base.changes) ul.appendChild(el('li', '', c));
        b.appendChild(ul);
      }
      if (p.base.note) b.appendChild(el('div', 'margin-top:4px;font-size:11px;color:var(--amber);', p.base.note));
      box.appendChild(b);
    }
    return box;
  }

  _writeToSlot(p) {
    if (!this._load(p, false)) return;
    const save = document.getElementById('btnSaveSlot');
    if (!save || save.disabled) { this._say('Connect the pedal to write a slot.'); return; }
    save.click();
    // 190-199 are the pedal's blank user slots; the dialog would otherwise offer slot 0
    const num = document.getElementById('saveSlotNum');
    if (num) { num.value = 190; num.dispatchEvent(new Event('input')); }
    const name = document.getElementById('saveSlotName');
    if (name) name.value = p.name.slice(0, 40);
    this._say(`Pick the slot in the Save dialog (190–199 are the blank user slots). Only the preset is written${p.drumbeatSlot === undefined
      ? ' — its hand-made drumbeat is not (use Send live to hear it)'
      : `; it plays drumbeat #${p.drumbeatSlot}, which stays as it is on the pedal`}.`);
  }

  _say(msg) {
    this._message = msg;
    if (this._status) this._status.textContent = msg;
  }

  _load(p, push) {
    if ((presetStore.dirty || drumbeatStore.dirty) && !confirm('The editor has unsaved changes to the current preset or drumbeat. Replace them?')) return false;
    presetStore.loadRaw(Uint8Array.from(p.raw), null);
    drumbeatStore.loadRaw(drumbeatFor(p), null);
    let msg = `Loaded “${p.name}” and its drumbeat (at ${p.raw[30]} BPM) into the editor`;
    if (push && midi.connected) {
      presetStore.sendToDevice();
      drumbeatStore.sendToDevice();
      msg += ' and pushed both to the pedal';
    }
    this._say(msg + '.');
    window._activateTab?.('preset');
    return true;
  }
}
