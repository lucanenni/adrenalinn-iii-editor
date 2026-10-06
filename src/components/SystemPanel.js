/**
 * SystemPanel — global System parameters (buffer 2) + Factory Init
 *
 * System settings are saved on the device automatically when changed (User's
 * Manual, ch. 4) — there is no "save" step. The device reports all 46 bytes;
 * a control stays "—" only until the first read (see systemData.js).
 */
import { systemStore } from '../store/systemStore.js';
import { midi } from '../midi/midiManager.js';
import { SYSTEM_FIELDS, FOOT_SWITCH_FIELDS } from '../midi/systemData.js';

const CTRL_CSS = `background:var(--bg3);border:1px solid var(--border);color:var(--text);
  font-family:var(--font-ui);font-size:11px;padding:4px 6px;border-radius:var(--radius);`;

const GROUPS = [
  ['global', 'Global', 'var(--accent2)'],
  ['midi',   'MIDI',   'var(--blue)'],
  ['active', 'Active on device (read-only — use the sidebar or Library to change)', 'var(--text3)'],
];

export class SystemPanel {
  constructor(container) {
    this.container = container;
    this._ctrls = {};   // key → { set(value), setEnabled(bool) }
    this._unsub = [];
    this._sendTimers = new Map();
    this._build();
    this._refreshAll();
    this._bind();
    if (midi.connected) systemStore.request();
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  _build() {
    const c = this.container;
    c.innerHTML = '';
    c.style.cssText = 'overflow-y:auto;display:flex;flex-direction:column;';

    const head = this._section('System Parameters', 'var(--green)');
    const note = document.createElement('div');
    note.style.cssText = 'font-size:10px;color:var(--text3);line-height:1.5;margin-bottom:8px;';
    note.textContent = 'Global settings, not stored per preset. The device saves them automatically when changed. '
      + 'Controls marked "—" have not been read from the device yet.';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
    this._btnRead = document.createElement('button');
    this._btnRead.className = 'btn sm';
    this._btnRead.textContent = '⬇ Read from device';
    this._btnRead.onclick = () => systemStore.request();
    this._status = document.createElement('span');
    this._status.style.cssText = 'font-size:10px;color:var(--text3);';
    row.append(this._btnRead, this._status);
    head.append(note, row);
    c.appendChild(head);

    for (const [group, title, color] of GROUPS) {
      const fields = SYSTEM_FIELDS.filter(f => f.group === group);
      const sec = this._section(title, color);
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;';
      fields.forEach(f => grid.appendChild(this._buildField(f)));
      sec.appendChild(grid);
      c.appendChild(sec);
    }

    c.appendChild(this._buildFootSwitches());
    c.appendChild(this._buildMidiTools());
    c.appendChild(this._buildFactoryInit());
    this._setEnabled(midi.connected);
  }

  _section(title, color) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:12px 16px;border-bottom:1px solid var(--border);';
    const hdr = document.createElement('div');
    hdr.style.cssText = `font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${color};margin-bottom:10px;`;
    hdr.textContent = title;
    wrap.appendChild(hdr);
    return wrap;
  }

  _card(label, hint) {
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:8px 10px;display:flex;flex-direction:column;gap:5px;';
    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;';
    lbl.textContent = label;
    card.appendChild(lbl);
    if (hint) {
      const h = document.createElement('div');
      h.style.cssText = 'font-size:9px;color:var(--text3);';
      h.textContent = hint;
      card.appendChild(h);
    }
    return card;
  }

  _buildField(f) {
    const card = this._card(f.label, '');
    const ctrl = f.kind === 'enum' ? this._enumControl(f) : this._rangeControl(f);
    card.appendChild(ctrl.el);
    this._ctrls[f.key] = ctrl;
    return card;
  }

  _enumControl(f) {
    const sel = document.createElement('select');
    sel.style.cssText = CTRL_CSS + 'appearance:none;cursor:pointer;';
    sel.appendChild(new Option('—', ''));
    f.options.forEach(o => sel.appendChild(new Option(o.label, o.value)));
    sel.onchange = () => { if (sel.value !== '') systemStore.set(f.key, parseInt(sel.value)); };
    return {
      el: sel,
      set: v => {
        // A value the device reports that isn't in the documented list is shown
        // as-is ("#n"), never silently displayed as something else.
        if (v !== undefined && ![...sel.options].some(o => o.value === String(v))) sel.appendChild(new Option(`#${v}`, v));
        sel.value = v === undefined ? '' : String(v);
      },
      setEnabled: on => { sel.disabled = !on; },
    };
  }

  _rangeControl(f) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const text = v => v === undefined ? '—' : `${f.format ? f.format(v) : v}${f.unit ? ' ' + f.unit : ''}`;
    const out = document.createElement('span');
    out.style.cssText = 'font-family:var(--font-ui);font-size:11px;color:var(--accent2);min-width:56px;text-align:right;';

    if (f.readOnly) {
      wrap.appendChild(out);
      return { el: wrap, set: v => { out.textContent = text(v); }, setEnabled: () => {} };
    }

    const input = document.createElement('input');
    input.type = 'range';
    input.min = f.min; input.max = f.max; input.value = f.def;
    input.style.cssText = 'flex:1;accent-color:var(--accent);';
    // Throttle while dragging; always send the final value on release.
    input.oninput = () => {
      const v = parseInt(input.value);
      out.textContent = text(v);
      clearTimeout(this._sendTimers.get(f.key));
      this._sendTimers.set(f.key, setTimeout(() => systemStore.set(f.key, v), 30));
    };
    wrap.append(input, out);
    return {
      el: wrap,
      set: v => {
        if (v !== undefined) input.value = v;
        out.textContent = text(v);
      },
      setEnabled: on => { input.disabled = !on; },
    };
  }

  _buildFootSwitches() {
    const sec = this._section('Foot switch assignments', 'var(--amber)');
    const note = document.createElement('div');
    note.style.cssText = 'font-size:10px;color:var(--text3);line-height:1.5;margin-bottom:8px;';
    note.textContent = 'What each panel foot switch (tap / hold) and MIDI controller does. '
      + 'Factory defaults: left = Start/Stop, left hold = Preset decrement, right = Effect Switch, right hold = Preset increment.';
    sec.appendChild(note);
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;';
    FOOT_SWITCH_FIELDS.forEach(f => grid.appendChild(this._buildField(f)));
    sec.appendChild(grid);
    return sec;
  }

  // CC test sender + quick reference (moved here from the old ASSIGN tab: both are
  // about the global foot switch / MIDI controller assignments, not about a preset)
  _buildMidiTools() {
    const sec = this._section('MIDI test & quick reference', 'var(--text3)');

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:10px;color:var(--text3);';
    lbl.textContent = 'Send a MIDI Control Change:';
    const ccSel = document.createElement('select');
    ccSel.style.cssText = CTRL_CSS + 'appearance:none;cursor:pointer;';
    [64, 65, 66, 67, 68, 69, 80, 81, 82, 83].forEach(n => ccSel.appendChild(new Option(`CC ${n}`, n)));
    const valSel = document.createElement('select');
    valSel.style.cssText = CTRL_CSS + 'appearance:none;cursor:pointer;';
    [['0 → OFF', 0], ['64 → TOGGLE', 64], ['127 → ON', 127]].forEach(([t, v]) => valSel.appendChild(new Option(t, v)));
    this._btnTestCC = document.createElement('button');
    this._btnTestCC.className = 'btn sm';
    this._btnTestCC.textContent = 'Send CC';
    this._btnTestCC.onclick = () => {
      if (midi.connected) midi.send(new Uint8Array([0xB0, parseInt(ccSel.value), parseInt(valSel.value)]));
    };
    row.append(lbl, ccSel, valSel, this._btnTestCC);
    sec.appendChild(row);

    const ref = document.createElement('div');
    ref.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;font-size:10px;line-height:1.6;';
    [
      ['var(--accent2)', 'Tap Tempo', 'Tap the EFFECT foot switch 4 times at the desired tempo (when assigned to an on/off function marked *).'],
      ['var(--accent2)', 'Tuner', 'Tap EFFECT, then quickly hold for ½ s → Bypass + Tune. Hold 1 more second → Mute + Tune.'],
      ['var(--green)',   'Intro/End', 'Tap EFFECT then START within ½ s → 4 hihat ticks, then the beat starts.'],
      ['var(--amber)',   'CC data values', '0 = force OFF · 1–63 = TOGGLE · 64–127 = force ON'],
    ].forEach(([color, title, text]) => {
      const card = document.createElement('div');
      card.style.cssText = 'background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:8px;';
      const h = document.createElement('div');
      h.style.cssText = `color:${color};font-weight:700;margin-bottom:4px;`;
      h.textContent = title;
      const t = document.createElement('div');
      t.style.cssText = 'color:var(--text3);';
      t.textContent = text;
      card.append(h, t);
      ref.appendChild(card);
    });
    sec.appendChild(ref);
    return sec;
  }

  _buildFactoryInit() {
    const sec = this._section('Danger zone', 'var(--red, #e5484d)');
    const note = document.createElement('div');
    note.style.cssText = 'font-size:10px;color:var(--text3);line-height:1.5;margin-bottom:8px;';
    note.textContent = 'Factory Init overwrites ALL 200 user presets and ALL 200 user drumbeats on the device with factory data '
      + 'and resets every System parameter. It cannot be undone — back up the device to the Library first. '
      + 'Your local Library (this browser) is not touched.';
    this._btnFactory = document.createElement('button');
    this._btnFactory.className = 'btn sm';
    this._btnFactory.textContent = '⚠ Initialize device to factory status…';
    this._btnFactory.onclick = () => this._factoryInit();
    this._factoryStatus = document.createElement('span');
    this._factoryStatus.style.cssText = 'font-size:10px;color:var(--text3);margin-left:8px;';
    sec.append(note, this._btnFactory, this._factoryStatus);
    return sec;
  }

  async _factoryInit() {
    const answer = window.prompt(
      'This will OVERWRITE all 200 presets and 200 drumbeats on the device with factory data ' +
      'and reset all System parameters.\n\nType FACTORY to confirm.');
    if (answer !== 'FACTORY') {
      this._factoryStatus.textContent = 'Cancelled — nothing was sent.';
      return;
    }
    this._btnFactory.disabled = true;
    this._factoryStatus.textContent = 'Initializing…';
    try {
      await systemStore.factoryInit();
      this._factoryStatus.textContent = 'Done — the pedal is back to factory status; System parameters and the current preset were re-read. Your local Library was not touched.';
    } catch (e) {
      this._factoryStatus.textContent = `Failed: ${e.message}`;
    } finally {
      this._btnFactory.disabled = !midi.connected;
    }
  }

  // ── State sync ────────────────────────────────────────────────────────────
  _refreshAll() {
    for (const [key, ctrl] of Object.entries(this._ctrls)) ctrl.set(systemStore.get(key));
  }

  _setEnabled(on) {
    Object.values(this._ctrls).forEach(c => c.setEnabled(on));
    this._btnRead.disabled = !on;
    this._btnFactory.disabled = !on;
    this._btnTestCC.disabled = !on;
    if (!on && !this._status.textContent) this._status.textContent = 'Connect a device to edit.';
  }

  _bind() {
    this._unsub.push(systemStore.on('load', () => {
      this._refreshAll();
      const n = Object.keys(systemStore.values).length;
      this._status.textContent = n ? 'Read from device ✓' : '';
    }));
    this._unsub.push(systemStore.on('change', ({ key, value }) => this._ctrls[key]?.set(value)));
    const onConn = ({ connected }) => {
      this._setEnabled(connected);
      if (connected) this._status.textContent = ''; // index.html's connect-time sync reads the parameters
    };
    midi.on('connectionChange', onConn);
  }

  destroy() {
    this._unsub.forEach(fn => fn());
    this._sendTimers.forEach(t => clearTimeout(t));
    this.container.innerHTML = '';
  }
}
