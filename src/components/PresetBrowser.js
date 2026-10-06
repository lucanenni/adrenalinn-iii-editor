/**
 * PresetBrowser — Scrollable, filterable library browser
 * Shows all 200 preset or drumbeat slots with:
 *  - Category grouping
 *  - Search filter
 *  - Bulk dump progress bar
 *  - Click to load into edit buffer
 *  - JSON export/import
 */

import {
  libraryStore,
  PRESET_CATEGORIES, DRUMBEAT_CATEGORIES, categoryForSlot,
} from '../store/libraryStore.js';
import { presetStore }   from '../store/presetStore.js';
import { drumbeatStore } from '../store/drumbeatStore.js';
import { midi }          from '../midi/midiManager.js';
import { buildSelectPreset, buildSelectDrumbeat } from '../midi/sysex.js';
import { buildSyxFile, readSyxFile, buildDumpSyx } from '../midi/syxFile.js';
import { AMP_MODELS, MOD_EFFECTS, AMP_MODEL_NAMES, MOD_EFFECT_NAMES } from '../midi/presetData.js';
import { TIMEBASES }                from '../midi/drumbeatData.js';
import { FamousPresetsPanel }       from './FamousPresetsPanel.js';

export class PresetBrowser {
  /**
   * @param {HTMLElement} container
   * @param {'preset'|'drumbeat'} [mode='preset']
   */
  constructor(container, mode = 'preset') {
    this.container = container;
    this.mode      = mode;
    this._filter   = '';
    this._catFilter= null;   // null = all
    this._unsub    = [];
    this._rows     = new Map(); // slot → tr element

    this._build();
    this._bindStore();
    this._renderList();
  }

  // ── Build chrome ──────────────────────────────────────────────────────────
  _build() {
    this.container.innerHTML = '';
    this.container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';

    // ── Toolbar ──────────────────────────────────────────────────────────
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      display:flex;flex-wrap:wrap;align-items:center;gap:8px;
      padding:10px 14px;background:var(--bg3);
      border-bottom:1px solid var(--border);flex-shrink:0;
    `;

    // Mode tabs
    const modeBar = document.createElement('div');
    modeBar.style.cssText = 'display:flex;gap:0;border:1px solid var(--border2);border-radius:var(--radius);overflow:hidden;';
    ['preset','drumbeat','famous'].forEach(m => {
      const btn = document.createElement('button');
      btn.textContent  = m === 'preset' ? '🎸 Presets' : m === 'drumbeat' ? '🥁 Drumbeats' : '⭐ Famous';
      btn.dataset.mode = m;
      btn.style.cssText = `
        background:${m===this.mode?'var(--accent)':'var(--bg3)'};
        border:none;color:${m===this.mode?'#fff':'var(--text2)'};
        font-size:11px;font-weight:600;padding:5px 10px;cursor:pointer;
        transition:all .15s;
      `;
      btn.onclick = () => this.setMode(m);
      modeBar.appendChild(btn);
      this[`_modeBtn_${m}`] = btn;
    });
    toolbar.appendChild(modeBar);

    // Search
    this._searchInput = document.createElement('input');
    this._searchInput.type        = 'text';
    this._searchInput.placeholder = 'Search…';
    this._searchInput.style.cssText = `
      flex:1;min-width:100px;background:var(--bg);border:1px solid var(--border);color:var(--text);
      font-family:var(--font-ui);font-size:11px;padding:4px 8px;border-radius:var(--radius);
    `;
    this._searchInput.oninput = e => {
      this._filter = e.target.value.toLowerCase();
      this._renderList();
    };
    toolbar.appendChild(this._searchInput);

    // Category filter
    this._catSelect = document.createElement('select');
    this._catSelect.style.cssText = `
      background:var(--bg);border:1px solid var(--border);color:var(--text);
      font-family:var(--font-ui);font-size:11px;padding:4px 7px;border-radius:var(--radius);
      appearance:none;cursor:pointer;max-width:160px;
    `;
    toolbar.appendChild(this._catSelect);
    this._catSelect.onchange = e => {
      this._catFilter = e.target.value === '' ? null : e.target.value;
      this._renderList();
    };
    this._updateCatSelect();

    // Counts badge
    this._countBadge = document.createElement('span');
    this._countBadge.style.cssText = 'font-size:10px;color:var(--text3);font-family:var(--font-ui);white-space:nowrap;';
    toolbar.appendChild(this._countBadge);

    this.container.appendChild(toolbar);

    // ── Action bar ───────────────────────────────────────────────────────
    const actionBar = this._actionBar = document.createElement('div');
    actionBar.style.cssText = `
      display:flex;flex-wrap:wrap;gap:6px;align-items:center;
      padding:7px 14px;background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0;
    `;

    // Bulk dump presets
    this._btnDump = document.createElement('button');
    this._btnDump.className = 'btn sm';
    this._btnDump.innerHTML = '⬇ Dump Presets';
    this._btnDump.title = 'Request all 200 preset slots from device (~3.7 min)';
    this._btnDump.onclick = () => this._startDump('preset');
    actionBar.appendChild(this._btnDump);

    // Bulk dump drumbeats
    this._btnDumpDb = document.createElement('button');
    this._btnDumpDb.className = 'btn sm';
    this._btnDumpDb.innerHTML = '⬇ Dump Drumbeats';
    this._btnDumpDb.title = 'Request all 200 drumbeat slots from device (~3.7 min)';
    this._btnDumpDb.onclick = () => this._startDump('drumbeat');
    actionBar.appendChild(this._btnDumpDb);

    // Restore cached slots back to the device (writes flash)
    this._btnRestore = document.createElement('button');
    this._btnRestore.className = 'btn sm';
    this._btnRestore.textContent = '⬆ Restore to Device';
    this._btnRestore.title = 'Overwrite the device\'s slots with the versions cached in this Library (writes flash)';
    this._btnRestore.onclick = () => this._restore(0, 199, 'all cached slots');
    actionBar.appendChild(this._btnRestore);

    this._btnDumpStop = document.createElement('button');
    this._btnDumpStop.className = 'btn sm';
    this._btnDumpStop.textContent = '⏹ Stop';
    this._btnDumpStop.style.display = 'none';
    this._btnDumpStop.onclick = () => libraryStore.dumpActive ? libraryStore.cancelBulkDump() : libraryStore.cancelRestore();
    actionBar.appendChild(this._btnDumpStop);

    // Export
    const btnExport = document.createElement('button');
    btnExport.className   = 'btn sm';
    btnExport.textContent = '⬆ Export JSON';
    btnExport.onclick     = () => this._exportJSON();
    actionBar.appendChild(btnExport);

    // Import
    const btnImport = document.createElement('button');
    btnImport.className   = 'btn sm';
    btnImport.textContent = '⬇ Import JSON';
    btnImport.onclick     = () => this._importJSON();
    actionBar.appendChild(btnImport);

    const btnImportSyx = document.createElement('button');
    btnImportSyx.className   = 'btn sm';
    btnImportSyx.textContent = '⬇ Import .syx';
    btnImportSyx.title       = 'Import preset/drumbeat SysEx files into Library slots';
    btnImportSyx.onclick     = () => this._importSyx();
    actionBar.appendChild(btnImportSyx);

    // Dump files (.syx, all 200 slots in order) — the library as plain pedal SysEx
    for (const [which, label, title] of [
      ['mode', '⬆ Dump .syx', 'Download all 200 slots of the current list (presets or drumbeats) as one .syx dump file'],
      ['all',  '⬆ Dump .syx (all)', 'Download all 200 presets followed by all 200 drumbeats as one .syx dump file'],
    ]) {
      const b = document.createElement('button');
      b.className = 'btn sm'; b.textContent = label; b.title = title;
      b.onclick = () => this._exportDumpSyx(which === 'all' ? 'all' : this.mode);
      actionBar.appendChild(b);
    }

    // Clear library
    const btnClear = document.createElement('button');
    btnClear.className   = 'btn sm';
    btnClear.textContent = '🗑 Clear Library';
    btnClear.onclick     = () => {
      if (confirm('Clear ALL cached presets & drumbeats from local storage?'))
        libraryStore.clearAll();
    };
    actionBar.appendChild(btnClear);

    // Progress bar (hidden by default)
    this._progressWrap = document.createElement('div');
    this._progressWrap.style.cssText = `
      width:100%;display:none;flex-direction:column;gap:3px;margin-top:4px;
    `;
    this._progressBar = document.createElement('div');
    this._progressBar.style.cssText = `
      height:6px;border-radius:3px;background:var(--border);overflow:hidden;position:relative;
    `;
    this._progressFill = document.createElement('div');
    this._progressFill.style.cssText = `
      height:100%;width:0%;background:var(--accent);border-radius:3px;transition:width .3s;
    `;
    this._progressLabel = document.createElement('div');
    this._progressLabel.style.cssText = 'font-size:10px;color:var(--text3);font-family:var(--font-ui);';
    this._progressBar.appendChild(this._progressFill);
    this._progressWrap.appendChild(this._progressBar);
    this._progressWrap.appendChild(this._progressLabel);
    actionBar.appendChild(this._progressWrap);

    this.container.appendChild(actionBar);

    // ── List ─────────────────────────────────────────────────────────────
    this._listWrap = document.createElement('div');
    this._listWrap.style.cssText = 'flex:1;overflow-y:auto;';

    this._table = document.createElement('table');
    this._table.style.cssText = `
      width:100%;border-collapse:collapse;font-size:11px;
    `;
    this._thead = document.createElement('thead');
    this._tbody = document.createElement('tbody');
    this._table.appendChild(this._thead);
    this._table.appendChild(this._tbody);
    this._listWrap.appendChild(this._table);
    this.container.appendChild(this._listWrap);

    // Famous-song presets (third mode): static list, not tied to the 200 slots
    this._famousWrap = document.createElement('div');
    this._famousWrap.style.cssText = 'flex:1;overflow-y:auto;display:none;';
    this._famous = new FamousPresetsPanel(this._famousWrap);
    this._famous.onCount = t => { if (this.mode === 'famous') this._countBadge.textContent = t; };
    this.container.appendChild(this._famousWrap);

    this._buildTableHeader();
  }

  _buildTableHeader() {
    this._thead.innerHTML = '';
    const tr = document.createElement('tr');
    tr.style.cssText = `
      background:var(--bg3);position:sticky;top:0;z-index:2;
    `;
    const cols = this.mode === 'preset'
      ? ['#','Category','Name','Amp','Mod FX','Tempo','Actions']
      : ['#','Category','Name','Timebase','Tempo','Actions'];
    cols.forEach((c, i) => {
      const th = document.createElement('th');
      th.textContent = c;
      th.style.cssText = `
        text-align:left;padding:6px 8px;font-size:9px;letter-spacing:.1em;
        text-transform:uppercase;color:var(--text3);border-bottom:1px solid var(--border);
        font-weight:600;white-space:nowrap;
        ${i === 0 ? 'width:36px;' : ''}
        ${i === cols.length-1 ? 'width:100px;' : ''}
      `;
      tr.appendChild(th);
    });
    this._thead.appendChild(tr);
  }

  _updateCatSelect() {
    this._catSelect.innerHTML = '<option value="">All Categories</option>';
    const cats = this.mode === 'preset' ? PRESET_CATEGORIES : DRUMBEAT_CATEGORIES;
    cats.forEach(c => {
      const o = new Option(`${c.label} (${c.from}–${c.to})`, c.label);
      this._catSelect.appendChild(o);
    });
  }

  // ── Render list ───────────────────────────────────────────────────────────
  _renderList() {
    if (this.mode === 'famous') { this._famous.render(this._filter ?? ''); return; }
    this._tbody.innerHTML = '';
    this._rows.clear();

    const map   = this.mode === 'preset' ? libraryStore.presets : libraryStore.drumbeats;
    const cats  = this.mode === 'preset' ? PRESET_CATEGORIES : DRUMBEAT_CATEGORIES;
    const colCount = this.mode === 'preset' ? 7 : 6;

    let visCount = 0;
    let lastCat  = null;

    for (let slot = 0; slot < 200; slot++) {
      const rec  = map.get(slot);
      const cat  = categoryForSlot(slot, cats);
      const name = this._getName(slot);

      // Category filter
      if (this._catFilter && cat !== this._catFilter) continue;

      // Text filter: search in slot number, category, name, parsed fields
      if (this._filter) {
        const haystack = [
          String(slot),
          cat,
          name,
          rec?.parsed ? this._parsedSearchText(rec.parsed) : '',
        ].join(' ').toLowerCase();
        if (!haystack.includes(this._filter)) continue;
      }

      // Category header row
      if (cat !== lastCat) {
        lastCat = cat;
        const catRow = document.createElement('tr');
        catRow.style.cssText = 'background:var(--bg3);';
        const td = document.createElement('td');
        td.colSpan = colCount;
        td.style.cssText = `
          padding:5px 8px;font-size:9px;font-weight:700;letter-spacing:.12em;
          text-transform:uppercase;color:var(--text3);border-bottom:1px solid var(--border);
        `;
        td.textContent = cat;
        catRow.appendChild(td);
        this._tbody.appendChild(catRow);
      }

      const tr = this._buildRow(slot, rec);
      this._tbody.appendChild(tr);
      this._rows.set(slot, tr);
      visCount++;
    }

    const total = map.size;
    this._countBadge.textContent = `${total}/200 cached · ${visCount} shown`;
  }

  _parsedSearchText(parsed) {
    if (!parsed) return '';
    if (parsed.amp !== undefined) {
      return [AMP_MODELS[parsed.amp], AMP_MODEL_NAMES[parsed.amp], MOD_EFFECTS[parsed.modEffect], MOD_EFFECT_NAMES[parsed.modEffect]].filter(Boolean).join(' ');
    }
    return TIMEBASES[parsed.timebase] ?? '';
  }

  _buildRow(slot, rec) {
    const tr = document.createElement('tr');
    tr.style.cssText = `
      border-bottom:1px solid var(--border);cursor:pointer;
      transition:background .1s;
    `;
    tr.onmouseenter = () => { tr.style.background = 'var(--bg3)'; };
    tr.onmouseleave = () => { tr.style.background = ''; };

    const cats = this.mode === 'preset' ? PRESET_CATEGORIES : DRUMBEAT_CATEGORIES;
    const cat  = categoryForSlot(slot, cats);

    // Slot number
    const tdSlot = document.createElement('td');
    tdSlot.style.cssText = `
      padding:5px 8px;font-family:var(--font-ui);font-size:10px;
      color:${rec ? 'var(--accent2)' : 'var(--text3)'};
      font-weight:${rec ? '600' : '400'};
    `;
    tdSlot.textContent = String(slot).padStart(3,'0');
    tr.appendChild(tdSlot);

    if (this.mode === 'preset') {
      this._buildPresetCells(tr, slot, rec);
    } else {
      this._buildDrumbeatCells(tr, slot, rec);
    }

    // Actions
    const tdAct = document.createElement('td');
    tdAct.style.cssText = 'padding:4px 6px;white-space:nowrap;';

    if (rec) {
      const btnLoad = document.createElement('button');
      btnLoad.className   = 'btn sm';
      btnLoad.textContent = '✏ Edit';
      btnLoad.title       = 'Load into editor';
      btnLoad.onclick = e => {
        e.stopPropagation();
        this._loadSlot(slot, rec);
      };
      tdAct.appendChild(btnLoad);

      const btnCopy = document.createElement('button');
      btnCopy.className   = 'btn sm';
      btnCopy.textContent = '⧉ Copy';
      btnCopy.title       = 'Copy this cached slot to another slot in the Library';
      btnCopy.style.marginLeft = '4px';
      btnCopy.onclick = e => {
        e.stopPropagation();
        this._copySlot(slot);
      };
      tdAct.appendChild(btnCopy);

      const btnSyx = document.createElement('button');
      btnSyx.className   = 'btn sm';
      btnSyx.textContent = '⬇ .syx';
      btnSyx.title       = 'Download this slot as a .syx file';
      btnSyx.style.marginLeft = '4px';
      btnSyx.onclick = e => {
        e.stopPropagation();
        this._exportSyx(slot, rec);
      };
      tdAct.appendChild(btnSyx);

      if (midi.connected) {
        const btnSend = document.createElement('button');
        btnSend.className   = 'btn sm';
        btnSend.textContent = '→ Dev';
        btnSend.title       = 'Select on device';
        btnSend.style.marginLeft = '4px';
        btnSend.onclick = e => {
          e.stopPropagation();
          const msg = this.mode === 'preset'
            ? buildSelectPreset(slot)
            : buildSelectDrumbeat(slot);
          midi.send(msg);
        };
        tdAct.appendChild(btnSend);

        const btnWrite = document.createElement('button');
        btnWrite.className   = 'btn sm';
        btnWrite.textContent = '⇪ Write';
        btnWrite.title       = libraryStore.busy
          ? 'Unavailable during a transfer'
          : 'Overwrite this slot on the device with the cached version (writes flash)';
        btnWrite.style.marginLeft = '4px';
        btnWrite.disabled = libraryStore.busy;
        btnWrite.onclick = e => {
          e.stopPropagation();
          this._restore(slot, slot, `slot ${slot}`);
        };
        tdAct.appendChild(btnWrite);
      }
    } else {
      const btnReq = document.createElement('button');
      btnReq.className   = 'btn sm';
      btnReq.textContent = '⬇ Fetch';
      // A single-slot fetch racing with an active bulk dump would arrive
      // as a plain sysex:preset/drumbeat reply the dump engine can't tell
      // apart from its own next slot, mislabeling it in the library — so
      // fetching is blocked while a dump is running rather than allowed to race.
      btnReq.title       = libraryStore.busy
        ? 'Unavailable during a transfer'
        : 'Request this slot from device';
      btnReq.disabled    = !midi.connected || libraryStore.busy;
      btnReq.onclick = e => {
        e.stopPropagation();
        this._fetchSlot(slot);
      };
      tdAct.appendChild(btnReq);
    }
    tr.appendChild(tdAct);

    // Click row → load
    tr.onclick = () => {
      if (rec) this._loadSlot(slot, rec);
    };

    return tr;
  }

  _buildPresetCells(tr, slot, rec) {
    const p = rec?.parsed;

    // Category (abbreviated)
    const tdCat = document.createElement('td');
    tdCat.style.cssText = 'padding:5px 6px;font-size:10px;color:var(--text3);max-width:100px;';
    tdCat.textContent = ''; // shown in category header row
    tr.appendChild(tdCat);

    // Name (editable)
    tr.appendChild(this._buildNameCell(slot));

    // Amp
    const tdAmp = document.createElement('td');
    tdAmp.style.cssText = 'padding:5px 6px;font-size:10px;color:var(--text2);font-family:var(--font-ui);';
    tdAmp.textContent = p ? (AMP_MODELS[p.amp] ?? '?') : '—';
    if (p) tdAmp.title = AMP_MODEL_NAMES[p.amp] ?? '';
    tr.appendChild(tdAmp);

    // Mod FX
    const tdMod = document.createElement('td');
    tdMod.style.cssText = 'padding:5px 6px;font-size:10px;';
    if (p) {
      tdMod.innerHTML = `
        <span style="color:var(--accent2);font-family:var(--font-ui)" title="${MOD_EFFECT_NAMES[p.modEffect] ?? ''}">${MOD_EFFECTS[p.modEffect] ?? '?'}</span>
        <span style="color:var(--text3);font-size:9px;margin-left:4px">${p.modOn ? '' : '(off)'}</span>
      `;
    } else {
      tdMod.textContent = '—';
      tdMod.style.color = 'var(--border2)';
    }
    tr.appendChild(tdMod);

    // Tempo
    const tdTempo = document.createElement('td');
    tdTempo.style.cssText = 'padding:5px 6px;font-size:10px;color:var(--text3);font-family:var(--font-ui);';
    tdTempo.textContent = p ? `${p.presetTempo} BPM` : '—';
    tr.appendChild(tdTempo);
  }

  _buildDrumbeatCells(tr, slot, rec) {
    const d = rec?.parsed;

    const tdCat = document.createElement('td');
    tdCat.style.cssText = 'padding:5px 6px;font-size:10px;color:var(--text3);';
    tdCat.textContent = '';
    tr.appendChild(tdCat);

    // Name (editable)
    tr.appendChild(this._buildNameCell(slot));

    // Timebase
    const tdTb = document.createElement('td');
    tdTb.style.cssText = 'padding:5px 6px;font-size:10px;font-family:var(--font-ui);';
    tdTb.textContent = d ? (TIMEBASES[d.timebase] ?? '?') : '—';
    tdTb.style.color = d ? 'var(--amber)' : 'var(--border2)';
    tr.appendChild(tdTb);

    // Tempo
    const tdTempo = document.createElement('td');
    tdTempo.style.cssText = 'padding:5px 6px;font-size:10px;color:var(--text3);font-family:var(--font-ui);';
    tdTempo.textContent = d ? `${d.tempo} BPM` : '—';
    tr.appendChild(tdTempo);
  }

  // ── Name column: click-to-edit inline ──────────────────────────────────────
  _getName(slot) {
    return this.mode === 'preset'
      ? libraryStore.getPresetName(slot)
      : libraryStore.getDrumbeatName(slot);
  }

  _setName(slot, name) {
    return this.mode === 'preset'
      ? libraryStore.setPresetName(slot, name)
      : libraryStore.setDrumbeatName(slot, name);
  }

  _buildNameCell(slot) {
    const td = document.createElement('td');
    td.style.cssText = 'padding:5px 6px;font-size:10px;max-width:140px;';

    const renderText = () => {
      td.innerHTML = '';
      const name = this._getName(slot);
      const span = document.createElement('span');
      span.textContent = name || '+ add name';
      span.style.cssText = name
        ? 'color:var(--text);cursor:text;'
        : 'color:var(--text3);font-style:italic;cursor:text;';
      span.onclick = e => { e.stopPropagation(); startEdit(); };
      td.appendChild(span);
    };

    const startEdit = () => {
      td.innerHTML = '';
      const input = document.createElement('input');
      input.type  = 'text';
      input.value = this._getName(slot);
      input.maxLength = 40;
      input.style.cssText = `
        width:100%;background:var(--bg);border:1px solid var(--accent);color:var(--text);
        font-family:var(--font-label);font-size:10px;padding:2px 4px;border-radius:3px;
      `;
      const commit = () => { this._setName(slot, input.value); renderText(); };
      input.onclick    = e => e.stopPropagation();
      input.onkeydown   = e => {
        e.stopPropagation();
        if (e.key === 'Enter')  input.blur();
        if (e.key === 'Escape') renderText();
      };
      input.onblur = commit;
      td.appendChild(input);
      input.focus();
      input.select();
    };

    renderText();
    return td;
  }

  // ── Copy a cached slot to another slot in the local library ────────────────
  _copySlot(slot) {
    const label = this.mode === 'preset' ? 'preset' : 'drumbeat';
    const input = prompt(`Copy ${label} slot ${slot} to slot (0–199):`, '');
    if (input === null) return;
    const dest = parseInt(input, 10);
    if (isNaN(dest) || dest < 0 || dest > 199) { alert('Invalid slot number (0-199)'); return; }
    if (dest === slot) return;

    const map = this.mode === 'preset' ? libraryStore.presets : libraryStore.drumbeats;
    if (map.has(dest) && !confirm(`Slot ${dest} is occupied. Overwrite?`)) return;

    const copy = this.mode === 'preset'
      ? libraryStore.copyPreset(slot, dest)
      : libraryStore.copyDrumbeat(slot, dest);
    copy.catch(e => alert('Copy failed: ' + e.message));
  }

  // ── Load slot into editor ─────────────────────────────────────────────────
  _loadSlot(slot, rec) {
    if (this.mode === 'preset') {
      presetStore.loadRaw(rec.raw, slot);
      window._activateTab?.('preset');
    } else {
      drumbeatStore.loadRaw(rec.raw, slot);
      window._activateTab?.('drumbeat');
    }
    this._highlightRow(slot);
  }

  _highlightRow(slot) {
    this._rows.forEach((tr, s) => {
      tr.style.outline = s === slot ? '1px solid var(--accent)' : '';
    });
  }

  // ── Fetch single slot ─────────────────────────────────────────────────────
  _fetchSlot(slot) {
    if (!midi.connected) return;
    // Use buildRequestPreset/Drumbeat (ID 0x05/0x06) — direct slot request
    // No need to first select on device; device responds with full preset data.
    // Routed through {preset,drumbeat}Store.requestSlot() (not a raw midi.send)
    // so the store knows which slot to attach to the reply and the Library
    // auto-caches it correctly instead of silently dropping it.
    if (this.mode === 'preset') {
      presetStore.requestSlot(slot);
    } else {
      drumbeatStore.requestSlot(slot);
    }
  }

  // ── Start bulk dump ───────────────────────────────────────────────────────
  _startDump(type) {
    if (!midi.connected) {
      alert('Connect the device first');
      return;
    }
    const label = type === 'preset' ? 'preset' : 'drumbeat';
    const confirmed = confirm(
      `Dump all 200 ${label}s from the device?\n\n` +
      `Takes 1.1 seconds per slot = ~3.7 minutes total.\n` +
      `You can cancel at any time.`
    );
    if (!confirmed) return;

    this._activeDumpType = type;
    libraryStore.startBulkDump(type);

    this._btnDump.style.display     = 'none';
    this._btnDumpDb.style.display   = 'none';
    this._btnDumpStop.style.display = '';
    this._btnRestore.style.display  = 'none';
    this._progressWrap.style.display= 'flex';
  }

  // ── JSON Export ───────────────────────────────────────────────────────────
  // ── Write cached slot(s) back to the device ───────────────────────────────
  async _restore(from, to, scopeText) {
    if (!midi.connected) { alert('Connect the device first'); return; }
    if (libraryStore.busy) return;
    const map = this.mode === 'preset' ? libraryStore.presets : libraryStore.drumbeats;
    let n = 0;
    for (let s = from; s <= to; s++) if (map.has(s)) n++;
    if (!n) { alert('Nothing cached in this range.'); return; }

    const label = this.mode === 'preset' ? 'preset' : 'drumbeat';
    if (from === to) {
      if (!confirm(`Overwrite ${label} slot ${from} on the device with the cached version?\n\nThis writes the device's flash memory.`)) return;
    } else {
      const answer = prompt(
        `This will OVERWRITE ${n} ${label} slot(s) (${scopeText}) in the device's flash memory with the versions cached in this Library.\n\n` +
        `About 1-2 seconds per slot. If the current device contents matter, dump them first.\n\nType RESTORE to confirm.`);
      if (answer !== 'RESTORE') return;
    }
    try { await libraryStore.startRestore(this.mode, from, to); }
    catch (e) { if (e.slot === undefined) alert('Restore failed: ' + e.message); }
  }

  // ── .syx export / import ──────────────────────────────────────────────────
  _exportSyx(slot, rec) {
    const blob = new Blob([buildSyxFile(this.mode, rec.raw)], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${this.mode}_${String(slot).padStart(3, '0')}.syx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  _exportDumpSyx(which) {
    const { bytes, missing } = buildDumpSyx(libraryStore.presets, libraryStore.drumbeats, which);
    const gaps = missing.preset.length + missing.drumbeat.length;
    if (gaps) {
      alert(`${gaps} slot(s) are not in the Library yet (${missing.preset.length} presets, ${missing.drumbeat.length} drumbeats).\n\n` +
        'A dump file holds all 200 slots in order — slot N is the Nth message — so it can only be exported ' +
        'complete. Use "Dump Presets" / "Dump Drumbeats" first. (Export JSON works with a partial Library.)');
      return;
    }
    const name = which === 'all' ? 'all' : which === 'preset' ? 'presets' : 'drumbeats';
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `adrenalinn3_${name}_${new Date().toISOString().slice(0, 10)}.syx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  _importSyx() {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.syx';
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      const { items, skipped } = readSyxFile(new Uint8Array(await file.arrayBuffer()), this.mode);
      const label = this.mode === 'preset' ? 'preset' : 'drumbeat';
      if (!items.length) {
        alert(`No ${label} messages found in ${file.name}${skipped ? ` (${skipped} other message(s) skipped)` : ''}.`);
        return;
      }
      const ans = prompt(
        `Found ${items.length} ${label}(s) in ${file.name}` + (skipped ? ` (${skipped} other message(s) skipped)` : '') + '.\n' +
        (items.length > 1 ? 'They will fill consecutive Library slots starting at the slot you enter.\n' : '') +
        'Import into which slot (0-199)?', '0');
      if (ans === null) return;
      const start = parseInt(ans, 10);
      if (!Number.isInteger(start) || start < 0 || start + items.length - 1 > 199) {
        alert(`Invalid slot: ${items.length} ${label}(s) starting at ${ans} would not fit in slots 0-199.`);
        return;
      }
      const map = this.mode === 'preset' ? libraryStore.presets : libraryStore.drumbeats;
      const overwrites = items.filter((_, i) => map.has(start + i)).length;
      if (overwrites && !confirm(`This replaces ${overwrites} cached ${label}(s) in the Library. Continue?`)) return;
      for (let i = 0; i < items.length; i++) {
        if (this.mode === 'preset') await libraryStore.storePreset(start + i, items[i]);
        else await libraryStore.storeDrumbeat(start + i, items[i]);
      }
      this._renderList();
    };
    input.click();
  }

  _exportJSON() {
    const json = libraryStore.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `adrenalinn3_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── JSON Import ───────────────────────────────────────────────────────────
  _importJSON() {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.json';
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const n = await libraryStore.importJSON(text);
        alert(`Imported ${n} records successfully.`);
      } catch(err) {
        alert('Import failed: ' + err.message);
      }
    };
    input.click();
  }

  // ── Mode switch ───────────────────────────────────────────────────────────
  setMode(mode) {
    this.mode = mode;
    for (const m of ['preset', 'drumbeat', 'famous']) {
      const b = this[`_modeBtn_${m}`];
      b.style.background = m === mode ? 'var(--accent)' : 'var(--bg3)';
      b.style.color      = m === mode ? '#fff' : 'var(--text2)';
    }
    const famous = mode === 'famous';
    this._catSelect.style.display = famous ? 'none' : '';
    this._actionBar.style.display = famous ? 'none' : 'flex';
    this._listWrap.style.display  = famous ? 'none' : 'block';
    this._famousWrap.style.display = famous ? 'block' : 'none';
    this._catFilter = null;
    this._catSelect.value = '';
    if (!famous) {
      this._updateCatSelect();
      this._buildTableHeader();
    }
    this._renderList();
  }

  // ── Store subscriptions ───────────────────────────────────────────────────
  _bindStore() {
    this._unsub.push(libraryStore.on('libraryChange', () => this._renderList()));

    this._unsub.push(libraryStore.on('presetStored', ({ slot }) => {
      this._updateRow(slot);
    }));
    this._unsub.push(libraryStore.on('drumbeatStored', ({ slot }) => {
      this._updateRow(slot);
    }));

    // Fetch/Write buttons must reflect libraryStore.busy — re-render whenever
    // a dump starts/ends so their disabled state (and tooltip) stays correct.
    this._unsub.push(libraryStore.on('dumpStart', () => this._renderList()));

    this._unsub.push(libraryStore.on('dumpProgress', ({ slot, received, total, pct }) => {
      this._progressFill.style.width = pct + '%';
      this._progressLabel.textContent =
        `${this.mode === 'preset' ? 'Preset' : 'Drumbeat'} ${slot}/199 · ${received}/${total} received`;
    }));

    this._unsub.push(libraryStore.on('dumpComplete', ({ received, total }) => {
      this._progressFill.style.width = '100%';
      this._progressLabel.textContent = `Done! ${received}/${total} received.`;
      this._progressFill.style.background = 'var(--green)';
      this._btnDump.style.display     = '';
      this._btnDumpDb.style.display   = '';
      this._btnDumpStop.style.display = 'none';
      this._btnRestore.style.display  = '';
      this._renderList();
      setTimeout(() => {
        this._progressWrap.style.display = 'none';
        this._progressFill.style.background = 'var(--accent)';
      }, 3000);
    }));

    this._unsub.push(libraryStore.on('dumpCancel', () => {
      this._progressWrap.style.display = 'none';
      this._btnDump.style.display      = '';
      this._btnDumpDb.style.display    = '';
      this._btnDumpStop.style.display  = 'none';
      this._btnRestore.style.display   = '';
      this._renderList();
    }));

    // Restore-to-device progress shares the dump progress bar
    const restoreUI = busy => {
      this._btnDump.style.display     = busy ? 'none' : '';
      this._btnDumpDb.style.display   = busy ? 'none' : '';
      this._btnRestore.style.display  = busy ? 'none' : '';
      this._btnDumpStop.style.display = busy ? '' : 'none';
    };
    const hideProgressLater = ms => setTimeout(() => {
      this._progressWrap.style.display = 'none';
      this._progressFill.style.background = 'var(--accent)';
    }, ms);

    this._unsub.push(libraryStore.on('restoreStart', () => {
      restoreUI(true);
      this._progressFill.style.width = '0%';
      this._progressFill.style.background = 'var(--accent)';
      this._progressWrap.style.display = 'flex';
      this._renderList();
    }));
    this._unsub.push(libraryStore.on('restoreProgress', ({ slot, written, total }) => {
      this._progressFill.style.width = Math.round((written / total) * 100) + '%';
      this._progressLabel.textContent = `Writing slot ${slot} · ${written}/${total} written`;
    }));
    this._unsub.push(libraryStore.on('restoreComplete', ({ written, total, cancelled, exactTempo }) => {
      restoreUI(false);
      this._progressFill.style.width = Math.round((written / Math.max(total, 1)) * 100) + '%';
      this._progressFill.style.background = cancelled ? 'var(--amber, #d29922)' : 'var(--green)';
      this._progressLabel.textContent = cancelled
        ? `Stopped — ${written}/${total} written.`
        : `Done! ${written}/${total} written to device.` +
          (exactTempo === false ? ' Could not read the pedal\'s settings, so preset tempos may have changed.' : '');
      this._renderList();
      hideProgressLater(4000);
    }));
    this._unsub.push(libraryStore.on('restoreError', ({ message, written, total }) => {
      restoreUI(false);
      this._progressFill.style.background = 'var(--red, #e5484d)';
      this._progressLabel.textContent = `${message} (${written}/${total} written)`;
      this._renderList();
      hideProgressLater(8000);
    }));
  }

  _updateRow(slot) {
    if (this.mode === 'famous') return;
    const map = this.mode === 'preset' ? libraryStore.presets : libraryStore.drumbeats;
    const rec = map.get(slot);
    const tr  = this._rows.get(slot);
    if (tr && rec) {
      // Rebuild the row in place
      const newTr = this._buildRow(slot, rec);
      tr.replaceWith(newTr);
      this._rows.set(slot, newTr);
      // Flash highlight
      newTr.style.background = 'var(--bg3)';
      newTr.style.outline    = '1px solid var(--green)';
      setTimeout(() => {
        newTr.style.background = '';
        newTr.style.outline    = '';
      }, 800);
    }
  }

  destroy() {
    this._unsub.forEach(fn => typeof fn === 'function' && fn());
    this.container.innerHTML = '';
  }
}
