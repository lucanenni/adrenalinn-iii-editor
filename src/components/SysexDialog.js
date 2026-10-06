/**
 * AdrenaLinn III — "SysEx code" dialog
 * Shows the SysEx for the preset / drumbeat currently in the editor, as text to copy (for a
 * MIDI pedalboard, a sequencer, a script…) or as a .syx file. It follows the editor live, so
 * it doubles as the offline "builder": edit offline, then copy the bytes.
 * open(source) shows fixed bytes instead ({ title, preset: 64 raw bytes, drumbeat: 44 raw bytes }),
 * e.g. for a famous preset, without touching the editor.
 */
import { presetStore } from '../store/presetStore.js';
import { drumbeatStore } from '../store/drumbeatStore.js';
import { serializePreset } from '../midi/presetData.js';
import { serializeDrumbeat, buildSendDrumbeatEditBuf } from '../midi/drumbeatData.js';
import { buildSendPresetEditBuf, buildSendPreset, buildSendDrumbeat } from '../midi/sysex.js';
import { formatBytes, BYTE_FORMATS } from '../midi/syxFile.js';

const MESSAGES = {
  preset: [
    ['edit', 'Edit buffer (ID 0B) — temporary, nothing is written to flash'],
    ['send', 'Send preset (ID 02) — the pedal writes it to the slot currently selected on it'],
    ['raw',  'Raw 64 data bytes (no SysEx wrapper)'],
  ],
  drumbeat: [
    ['edit', 'Edit buffer (ID 0D) — temporary, nothing is written to flash'],
    ['send', 'Send drumbeat (ID 03) — the pedal writes it to the slot currently selected on it'],
    ['raw',  'Raw 44 data bytes (no SysEx wrapper)'],
  ],
};

export class SysexDialog {
  constructor() {
    this._built = false;
    this._what = 'preset';
  }

  open(source = null) {
    if (!this._built) this._build();
    this._source = source;
    this._what = 'preset';
    this.q('what').value = 'preset';
    this._fillMessages();
    this.q('title').textContent = source ? `</> SysEx code — ${source.title}` : '</> SysEx code';
    this.q('what').options[0].textContent = source ? 'Preset' : 'Current preset';
    this.q('what').options[1].textContent = source ? 'Its drumbeat' : 'Current drumbeat';
    this.q('hint').textContent = source
      ? 'The bytes of this preset (they do not touch the editor). Paste them into a MIDI pedalboard or script, or download a .syx. Edit buffer = temporary, nothing is saved on the pedal.'
      : 'The bytes for what is in the editor right now (follows your edits). Paste them into a MIDI pedalboard or script, or download a .syx.';
    this.overlay.style.display = 'flex';
    this._unsub = source ? [] : [presetStore.on('change', () => this._refresh()), presetStore.on('load', () => this._refresh()),
      drumbeatStore.on('change', () => this._refresh()), drumbeatStore.on('load', () => this._refresh())];
    this._refresh();
  }

  close() {
    this.overlay.style.display = 'none';
    (this._unsub ?? []).forEach(u => u());
    this._unsub = [];
  }

  _build() {
    this._built = true;
    const o = this.overlay = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:200;';
    o.innerHTML = `
      <div role="dialog" aria-label="SysEx code" style="background:var(--bg2);border:1px solid var(--border2);border-radius:var(--r);padding:18px 20px;width:min(720px,94vw);max-height:90vh;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px">
          <div data-x="title" style="font-weight:600;font-size:14px;color:var(--text)">&lt;/&gt; SysEx code</div>
          <div style="flex:1"></div>
          <button class="btn sm" data-x="close" aria-label="Close">✕</button>
        </div>
        <div data-x="hint" style="font-size:11px;color:var(--text3);line-height:1.5"></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <select data-x="what" aria-label="What"><option value="preset">Current preset</option><option value="drumbeat">Current drumbeat</option></select>
          <select data-x="msg" aria-label="Message type" style="flex:1;min-width:200px"></select>
          <select data-x="fmt" aria-label="Format"></select>
        </div>
        <textarea data-x="out" readonly spellcheck="false" style="width:100%;height:210px;resize:vertical;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:var(--font-ui);font-size:11px;padding:8px;border-radius:var(--radius);"></textarea>
        <div style="display:flex;align-items:center;gap:8px">
          <span data-x="info" style="font-size:10px;color:var(--text3);font-family:var(--font-ui);flex:1"></span>
          <button class="btn sm" data-x="copy">📋 Copy</button>
          <button class="btn sm primary" data-x="dl">⬇ Download</button>
        </div>
      </div>`;
    document.body.appendChild(o);
    const q = x => o.querySelector(`[data-x=${x}]`);
    this.q = q;
    for (const [v, label] of Object.entries(BYTE_FORMATS)) q('fmt').add(new Option(label, v));
    q('what').onchange = () => { this._what = q('what').value; this._fillMessages(); this._refresh(); };
    q('msg').onchange = q('fmt').onchange = () => this._refresh();
    q('close').onclick = () => this.close();
    o.addEventListener('click', e => { if (e.target === o) this.close(); });
    o.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
    q('copy').onclick = async () => {
      try { await navigator.clipboard.writeText(q('out').value); }
      catch { q('out').select(); document.execCommand('copy'); }
      q('copy').textContent = '✓ Copied';
      setTimeout(() => { q('copy').textContent = '📋 Copy'; }, 1500);
    };
    q('dl').onclick = () => {
      const { bytes, raw } = this._bytes();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      a.download = `${this._what}${raw ? '_raw.bin' : '.syx'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    this._fillMessages();
  }

  _fillMessages() {
    const sel = this.q('msg');
    sel.innerHTML = '';
    for (const [v, label] of MESSAGES[this._what]) sel.add(new Option(label, v));
  }

  _bytes() {
    const kind = this.q('msg').value;
    const isPreset = this._what === 'preset';
    const raw = this._source ? (isPreset ? this._source.preset : this._source.drumbeat)
      : isPreset ? serializePreset(presetStore.preset) : serializeDrumbeat(drumbeatStore.db);
    if (kind === 'raw')  return { bytes: raw, raw: true };
    if (kind === 'send') return { bytes: isPreset ? buildSendPreset(raw) : buildSendDrumbeat(raw), raw: false };
    return { bytes: isPreset ? buildSendPresetEditBuf(raw) : buildSendDrumbeatEditBuf(raw), raw: false };
  }

  _refresh() {
    if (!this._built || this.overlay.style.display === 'none') return;
    const { bytes, raw } = this._bytes();
    this.q('out').value = formatBytes(bytes, this.q('fmt').value);
    this.q('info').textContent = `${bytes.length} bytes` + (raw ? '' : ' · F0 … F7');
    this.q('dl').textContent = raw ? '⬇ Download .bin' : '⬇ Download .syx';
  }
}
