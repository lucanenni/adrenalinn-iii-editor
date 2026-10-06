/**
 * SequencerGrid — 32-step × 4-voice drum sequencer grid
 *
 * Layout mirrors the AdrenaLinn III front panel:
 *   Row labels: BASS | SNARE | HIHAT | PERC
 *   Columns: Bar1 steps 1-16, Bar2 steps 17-32
 *   Each cell cycles: off → soft → med → loud (→ off)
 *   Perc row: off → perc1 → perc2 → perc3 (→ off)
 *
 * Click → cycle value
 * Right-click → clear cell
 * Playing step is highlighted via setPlayStep()
 */

import { drumbeatStore } from '../store/drumbeatStore.js';
import { physicalStepIndex } from '../midi/drumbeatData.js';

const VOICES = ['bass','snare','hihat','perc'];
const VOICE_COLORS = {
  bass:  { off:'#1a1a22', s1:'#1a2840', s2:'#1e4080', s3:'#2060e0', active:'#4a9eff', cursor:'#6ab4ff' },
  snare: { off:'#1a1a22', s1:'#2a1a1a', s2:'#601818', s3:'#c02020', active:'#e85030', cursor:'#ff7a52' },
  hihat: { off:'#1a1a22', s1:'#1a2a1a', s2:'#185518', s3:'#22aa22', active:'#3ecf6a', cursor:'#70ef90' },
  perc:  { off:'#1a1a22', s1:'#252018', s2:'#554010', s3:'#aa8020', active:'#f0a030', cursor:'#ffc060' },
};

const STEP_LABELS = [
  '1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16',
  '1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16',
];

export class SequencerGrid {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container   = container;
    this._cells      = {};     // `${voice}_${step}` → td element
    this._playStep   = -1;
    this._unsub      = [];
    this._timebase   = 2;      // 16n default
    this._steps      = [];

    this._build();
    this._bindStore();
    this._syncFromStore();
  }

  // ── Build table ───────────────────────────────────────────────────────────
  _build() {
    this.container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'overflow-x:auto;padding:12px 14px;';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;';
    toolbar.innerHTML = `
      <span style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3)">Sequencer</span>
      <div style="display:flex;gap:4px;margin-left:auto" id="seqVoiceBtns">
        <button class="seq-vbtn active" data-voice="all" style="font-size:10px;padding:3px 7px">ALL</button>
        <button class="seq-vbtn" data-voice="bass"  style="font-size:10px;padding:3px 7px;color:var(--blue)">BASS</button>
        <button class="seq-vbtn" data-voice="snare" style="font-size:10px;padding:3px 7px;color:var(--accent2)">SNARE</button>
        <button class="seq-vbtn" data-voice="hihat" style="font-size:10px;padding:3px 7px;color:var(--green)">HIHAT</button>
        <button class="seq-vbtn" data-voice="perc"  style="font-size:10px;padding:3px 7px;color:var(--amber)">PERC</button>
      </div>
      <div id="seqClearBtns" style="display:flex;gap:4px">
        <button class="seq-clr" data-voice="bass"  title="Clear bass"  style="font-size:9px;padding:2px 6px;color:var(--blue)">CLR B</button>
        <button class="seq-clr" data-voice="snare" title="Clear snare" style="font-size:9px;padding:2px 6px;color:var(--accent2)">CLR S</button>
        <button class="seq-clr" data-voice="hihat" title="Clear hihat" style="font-size:9px;padding:2px 6px;color:var(--green)">CLR H</button>
        <button class="seq-clr" data-voice="perc"  title="Clear perc"  style="font-size:9px;padding:2px 6px;color:var(--amber)">CLR P</button>
      </div>
    `;
    wrapper.appendChild(toolbar);

    // Step number row (bar labels)
    const barRow = document.createElement('div');
    barRow.style.cssText = 'display:flex;align-items:center;gap:2px;margin-bottom:4px;';
    barRow.innerHTML = `
      <div style="width:52px;flex-shrink:0"></div>
      <div style="flex:1;display:grid;grid-template-columns:repeat(16,1fr);gap:2px;text-align:center">
        ${STEP_LABELS.slice(0,16).map(n=>`<div style="font-size:8px;color:var(--text3)">${n}</div>`).join('')}
      </div>
      <div style="width:8px;flex-shrink:0"></div>
      <div style="flex:1;display:grid;grid-template-columns:repeat(16,1fr);gap:2px;text-align:center">
        ${STEP_LABELS.slice(16,32).map(n=>`<div style="font-size:8px;color:var(--text3)">${n}</div>`).join('')}
      </div>
    `;
    wrapper.appendChild(barRow);

    // Grid table
    const grid = document.createElement('div');
    grid.id = 'seqGrid';
    grid.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

    VOICES.forEach(voice => {
      const row = this._buildRow(voice);
      grid.appendChild(row);
    });

    wrapper.appendChild(grid);
    this.container.appendChild(wrapper);

    // Bar labels
    const barLbl = document.createElement('div');
    barLbl.style.cssText = 'display:flex;padding:4px 14px 0;gap:4px;';
    barLbl.innerHTML = `
      <div style="width:52px;flex-shrink:0"></div>
      <div style="flex:1;font-size:9px;color:var(--text3);text-align:center;border-top:1px solid var(--border);padding-top:3px">BAR 1</div>
      <div style="width:8px;flex-shrink:0"></div>
      <div style="flex:1;font-size:9px;color:var(--text3);text-align:center;border-top:1px solid var(--border);padding-top:3px">BAR 2</div>
    `;
    this.container.appendChild(barLbl);

    // Legend
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:12px;padding:8px 14px;flex-wrap:wrap;';
    legend.innerHTML = `
      <span style="font-size:9px;color:var(--text3)">Click: cycle level &nbsp;|&nbsp; Right-click: clear &nbsp;|&nbsp; Dim = disabled step</span>
      ${['off','soft','med','loud'].map((l,i)=>{
        const bg = i===0?'var(--bg3)':i===1?'#444':i===2?'#888':'#ccc';
        return `<span style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--text2)">
          <span style="width:10px;height:10px;border-radius:2px;background:${bg};display:inline-block"></span>${l}
        </span>`;
      }).join('')}
    `;
    this.container.appendChild(legend);

    // Wire toolbar events
    toolbar.querySelectorAll('.seq-vbtn').forEach(btn => {
      btn.style.cssText += ';background:var(--bg3);border:1px solid var(--border2);border-radius:4px;cursor:pointer;';
      btn.onclick = () => {
        toolbar.querySelectorAll('.seq-vbtn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        this._setVoiceFilter(btn.dataset.voice);
      };
    });

    toolbar.querySelectorAll('.seq-clr').forEach(btn => {
      btn.style.cssText += ';background:var(--bg3);border:1px solid var(--border2);border-radius:4px;cursor:pointer;';
      btn.onclick = () => {
        if (confirm(`Clear all ${btn.dataset.voice} steps?`)) {
          drumbeatStore.clearVoice(btn.dataset.voice);
        }
      };
    });

    this._voiceFilter = 'all';
  }

  _buildRow(voice) {
    const colors = VOICE_COLORS[voice];
    const row = document.createElement('div');
    row.dataset.voice = voice;
    row.style.cssText = 'display:flex;align-items:center;gap:2px;';

    // Voice label
    const label = document.createElement('div');
    const voiceColor = { bass:'var(--blue)', snare:'var(--accent2)', hihat:'var(--green)', perc:'var(--amber)' };
    label.style.cssText = 'width:52px;flex-shrink:0;font-size:10px;font-weight:700;letter-spacing:.08em;' +
      'text-transform:uppercase;color:' + voiceColor[voice] + ';text-align:right;padding-right:8px;';
    label.textContent = voice;
    row.appendChild(label);

    // Bar 1 (steps 0-15)
    const bar1 = document.createElement('div');
    bar1.style.cssText = 'flex:1;display:grid;grid-template-columns:repeat(16,1fr);gap:2px;';
    for (let i = 0; i < 16; i++) this._buildCell(bar1, voice, i, colors);
    row.appendChild(bar1);

    // Spacer
    const sep = document.createElement('div');
    sep.style.cssText = 'width:8px;flex-shrink:0;border-left:1px solid var(--border);height:100%;';
    row.appendChild(sep);

    // Bar 2 (steps 16-31)
    const bar2 = document.createElement('div');
    bar2.style.cssText = 'flex:1;display:grid;grid-template-columns:repeat(16,1fr);gap:2px;';
    for (let i = 16; i < 32; i++) this._buildCell(bar2, voice, i, colors);
    row.appendChild(bar2);

    return row;
  }

  _buildCell(parent, voice, stepIdx, colors) {
    const cell = document.createElement('div');
    cell.dataset.step  = stepIdx;
    cell.dataset.voice = voice;
    cell.style.cssText = 'height:26px;border-radius:3px;cursor:pointer;' +
      'background:' + colors.off + ';border:1px solid var(--border);' +
      'transition:background .1s,transform .05s;position:relative;';

    cell.addEventListener('click', e => {
      e.preventDefault();
      drumbeatStore.cycleStep(stepIdx, voice);
    });
    cell.addEventListener('contextmenu', e => {
      e.preventDefault();
      drumbeatStore.setStep(stepIdx, voice, 0);
    });
    // Touch: long-press = clear
    let longPress;
    cell.addEventListener('touchstart', () => {
      longPress = setTimeout(() => drumbeatStore.setStep(stepIdx, voice, 0), 500);
    }, { passive: true });
    cell.addEventListener('touchend', () => clearTimeout(longPress), { passive: true });

    this._cells[`${voice}_${stepIdx}`] = cell;
    parent.appendChild(cell);
  }

  // ── Update a single cell's appearance ────────────────────────────────────
  _updateCell(voice, stepIdx, value) {
    const cell = this._cells[`${voice}_${stepIdx}`];
    if (!cell) return;
    const colors = VOICE_COLORS[voice];

    const isActive = this._playStep === stepIdx;
    const isDisabled = !this._isStepActive(stepIdx);

    let bg;
    if (isDisabled) {
      bg = value > 0 ? colors.s1 + '88' : '#111114';
    } else if (isActive) {
      bg = value > 0 ? colors.cursor : '#2a2a35';
    } else {
      bg = [colors.off, colors.s1, colors.s2, colors.s3][value] ?? colors.off;
    }

    cell.style.background = bg;
    cell.style.boxShadow  = isActive ? ('0 0 6px ' + colors.cursor + '88') : 'none';
    cell.style.opacity    = isDisabled ? '0.45' : '1';
    cell.title            = voice + ' step ' + (stepIdx+1) + ': ' + (['off','soft','med','loud'][value] ?? '?');
  }

  // ── Is a step active for current timebase? ────────────────────────────────
  _isStepActive(stepIdx) {
    const tb = this._timebase;
    if (tb === 0) return stepIdx % 2 === 0;  // 1/8n: even steps only
    if (tb === 1) return stepIdx % 4 !== 3;  // 1/8t: every 4th disabled
    return true;                             // 1/16*: all active
  }

  // ── Full grid repaint ────────────────────────────────────────────────────
  _repaint() {
    const steps = this._steps;
    VOICES.forEach(voice => {
      for (let i = 0; i < 32; i++) {
        const val = steps[i]?.[voice] ?? 0;
        this._updateCell(voice, i, val);
      }
    });
  }

  // ── Set playing step (cursor) ─────────────────────────────────────────────
  setPlayStep(step) {
    const prev = this._playStep;
    this._playStep = step;

    // Repaint prev and current step for all voices
    if (prev >= 0) {
      VOICES.forEach(voice => {
        this._updateCell(voice, prev, this._steps[prev]?.[voice] ?? 0);
      });
    }
    if (step >= 0) {
      VOICES.forEach(voice => {
        this._updateCell(voice, step, this._steps[step]?.[voice] ?? 0);
      });
    }
  }

  // ── Voice filter (show only one row highlighted) ──────────────────────────
  _setVoiceFilter(voice) {
    this._voiceFilter = voice;
    document.querySelectorAll('[data-voice]').forEach(el => {
      if (el.tagName === 'DIV' && el.style.display !== undefined && !el.dataset.step) {
        // Row
        if (voice === 'all') {
          el.style.opacity = '1';
        } else {
          el.style.opacity = el.dataset.voice === voice ? '1' : '0.3';
        }
      }
    });
  }

  // ── Sync from store ───────────────────────────────────────────────────────
  _syncFromStore() {
    const db = drumbeatStore.db;
    this._steps    = db.steps;
    this._timebase = db.timebase;
    this._repaint();
  }

  // ── Store subscriptions ───────────────────────────────────────────────────
  _bindStore() {
    this._unsub.push(drumbeatStore.on('load', () => this._syncFromStore()));

    this._unsub.push(drumbeatStore.on('stepChange', ({ stepIndex, voice, steps }) => {
      this._steps = steps;
      if (stepIndex === -1) {
        // Full repaint (clear voice)
        this._repaint();
      } else {
        const val = steps[stepIndex]?.[voice] ?? 0;
        this._updateCell(voice, stepIndex, val);
        // Animate: brief scale
        const cell = this._cells[voice + '_' + stepIndex];
        if (cell && val > 0) {
          cell.style.transform = 'scale(1.15)';
          setTimeout(() => { if (cell) cell.style.transform = ''; }, 80);
        }
      }
    }));

    this._unsub.push(drumbeatStore.on('change:timebase', ({ value }) => {
      this._timebase = value;
      this._repaint();
    }));

    this._unsub.push(drumbeatStore.on('playStep', ({ step, playing }) => {
      // step is a logical "Nth active step" index — map it to the physical
      // grid column before highlighting, or the cursor walks the wrong cells
      // whenever the timebase isn't 1/16 (see physicalStepIndex).
      this.setPlayStep(playing ? physicalStepIndex(this._timebase, step) : -1);
    }));
  }

  destroy() {
    this._unsub.forEach(fn => typeof fn === 'function' && fn());
    this.container.innerHTML = '';
    this._cells = {};
  }
}
