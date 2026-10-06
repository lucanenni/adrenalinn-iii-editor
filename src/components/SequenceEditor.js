/**
 * SequenceEditor — Canvas-based editor for AdrenaLinn III preset sequences
 *
 * Handles Tremolo / Filter / Arpeggiator sequences (preset bytes 32-63).
 * Each of the 32 steps has:
 *   - level:    0–99  (bar height)
 *   - envelope: bool  (attack/decay shape overlay)
 *
 * Interactions:
 *   - Click+drag on bars → set level
 *   - Right-click → toggle envelope flag
 *   - Double-click → set level to 0
 *   - Scroll on bar → ±1
 *   - Toolbar: copy preset variation, clear all, random, invert
 *
 * MIDI Clock sync: animated playback cursor via setPlayStep()
 */

import { presetStore } from '../store/presetStore.js';
import { midi }        from '../midi/midiManager.js';
import { buildSingleParam } from '../midi/sysex.js';
import { MOD_EFFECTS }      from '../midi/presetData.js';

// ── Which effects have user sequences ────────────────────────────────────────
// Indices: TSE=7, FSE=8, ARP=9
const SEQ_EFFECTS = new Set([7, 8, 9]);

// Labels for y-axis context
const SEQ_TYPE_LABEL = { 7:'Tremolo Seq', 8:'Filter Seq', 9:'Arpeggio Seq' };
const SEQ_Y_LABEL    = { 7:'Volume', 8:'Filter Freq', 9:'Pitch (semitones)' };

// Preset variation sequences (simplified names for the copy-from selector)
const PRESET_VAR_NAMES = Array.from({length:20}, (_,i) => `Preset ${i+1}`);

export class SequenceEditor {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container = container;
    this._steps    = [];   // [{level, envelope}×32]
    this._isSeqActive = false; // true when modEffect is TSE/FSE/ARP — gates all editing
    this._playStep = -1;
    this._drag     = null; // {stepIdx, startY, startLevel}
    this._unsub    = [];
    this._raf      = null;
    this._dirty    = false;

    // Clock tracking
    this._clockCount = 0;
    this._playing    = false;

    this._build();
    this._bindStore();
    this._syncFromStore();
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  _build() {
    this.container.innerHTML = '';
    this.container.style.cssText = 'display:flex;flex-direction:column;height:100%;';

    // ── Header ──────────────────────────────────────────────────────────
    const hdr = document.createElement('div');
    hdr.style.cssText = `
      display:flex;align-items:center;gap:8px;flex-wrap:wrap;
      padding:8px 14px;background:var(--bg3);border-bottom:1px solid var(--border);
      flex-shrink:0;
    `;
    hdr.innerHTML = `
      <span style="font-size:10px;font-weight:700;letter-spacing:.12em;
        text-transform:uppercase;color:var(--accent2)">USER SEQUENCE</span>
      <span id="seqTypeLabel" style="font-size:10px;color:var(--text3)"></span>
      <span id="seqActiveBadge" style="font-size:9px;padding:2px 6px;border-radius:3px;
        background:var(--accent)33;color:var(--accent2);display:none">ACTIVE</span>
      <div style="display:flex;gap:4px;margin-left:auto;flex-wrap:wrap">
        <button id="seqBtnRandom" class="btn sm" title="Randomize levels">🎲</button>
        <button id="seqBtnInvert" class="btn sm" title="Invert levels">↕</button>
        <button id="seqBtnShiftL" class="btn sm" title="Shift left">←</button>
        <button id="seqBtnShiftR" class="btn sm" title="Shift right">→</button>
        <button id="seqBtnClear"  class="btn sm" title="Clear all steps">⊘ Clear</button>
        <button id="seqBtnSend"   class="btn sm primary" title="Send all steps to device">⬆ Send</button>
      </div>
    `;
    this.container.appendChild(hdr);
    this._typeLabel   = hdr.querySelector('#seqTypeLabel');
    this._activeBadge = hdr.querySelector('#seqActiveBadge');
    this._toolbarBtns = [
      hdr.querySelector('#seqBtnRandom'), hdr.querySelector('#seqBtnInvert'),
      hdr.querySelector('#seqBtnShiftL'), hdr.querySelector('#seqBtnShiftR'),
      hdr.querySelector('#seqBtnClear'),  hdr.querySelector('#seqBtnSend'),
    ];

    // ── Toolbar row 2: copy from preset var ─────────────────────────────
    const toolbar2 = document.createElement('div');
    toolbar2.style.cssText = `
      display:flex;align-items:center;gap:8px;
      padding:6px 14px;background:var(--bg2);border-bottom:1px solid var(--border);
      flex-shrink:0;
    `;
    toolbar2.innerHTML = `
      <span style="font-size:10px;color:var(--text3)">Copy from preset variation:</span>
      <select id="seqCopyFrom" style="
        background:var(--bg3);border:1px solid var(--border);color:var(--text);
        font-family:var(--font-ui);font-size:10px;padding:3px 6px;border-radius:4px;
        appearance:none;cursor:pointer;
      ">
        ${PRESET_VAR_NAMES.map((n,i)=>`<option value="${i}">${n}</option>`).join('')}
      </select>
      <button id="seqBtnCopyVar" class="btn sm">Copy</button>
      <span style="font-size:9px;color:var(--text3);margin-left:8px">
        Right-click bar = toggle envelope · Double-click = zero
      </span>
    `;
    this.container.appendChild(toolbar2);
    this._toolbarBtns.push(toolbar2.querySelector('#seqBtnCopyVar'));

    // ── Canvas area ──────────────────────────────────────────────────────
    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = `
      flex:1;position:relative;overflow:hidden;min-height:200px;
      background:var(--bg);
    `;
    this.container.appendChild(canvasWrap);

    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = 'position:absolute;inset:0;cursor:crosshair;touch-action:none;';
    canvasWrap.appendChild(this._canvas);
    this._wrap = canvasWrap;

    // ── Step info bar ────────────────────────────────────────────────────
    this._infoBar = document.createElement('div');
    this._infoBar.style.cssText = `
      padding:5px 14px;background:var(--bg3);border-top:1px solid var(--border);
      font-family:var(--font-ui);font-size:10px;color:var(--text3);
      display:flex;gap:16px;flex-shrink:0;
    `;
    this._infoBar.innerHTML = `
      <span id="seqStepInfo">Hover a step to inspect</span>
      <span id="seqPlayInfo" style="margin-left:auto;color:var(--text3)">⏸ Stopped</span>
    `;
    this.container.appendChild(this._infoBar);
    this._stepInfo = this._infoBar.querySelector('#seqStepInfo');
    this._playInfo = this._infoBar.querySelector('#seqPlayInfo');

    // Resize observer
    this._resizeObs = new ResizeObserver(() => this._resize());
    this._resizeObs.observe(canvasWrap);

    // Bind canvas events
    this._bindCanvas();

    // Bind toolbar buttons
    hdr.querySelector('#seqBtnRandom').onclick = () => this._randomize();
    hdr.querySelector('#seqBtnInvert').onclick  = () => this._invert();
    hdr.querySelector('#seqBtnShiftL').onclick  = () => this._shift(-1);
    hdr.querySelector('#seqBtnShiftR').onclick  = () => this._shift(1);
    hdr.querySelector('#seqBtnClear').onclick   = () => this._clearAll();
    hdr.querySelector('#seqBtnSend').onclick    = () => this._sendAll();
    toolbar2.querySelector('#seqBtnCopyVar').onclick = () => {
      const v = parseInt(toolbar2.querySelector('#seqCopyFrom').value);
      this._copyFromVariation(v);
    };
  }

  // ── Canvas sizing ─────────────────────────────────────────────────────────
  _resize() {
    const r = this._wrap.getBoundingClientRect();
    this._canvas.width  = r.width  * devicePixelRatio;
    this._canvas.height = r.height * devicePixelRatio;
    this._canvas.style.width  = r.width  + 'px';
    this._canvas.style.height = r.height + 'px';
    this._W = r.width;
    this._H = r.height;
    this._draw();
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  _draw() {
    const canvas = this._canvas;
    if (!canvas.width || !canvas.height) return;
    const ctx = canvas.getContext('2d');
    const dpr = devicePixelRatio;
    const W   = canvas.width;
    const H   = canvas.height;

    // Fixed pixel padding (in canvas px = css px × dpr)
    const PL = 38 * dpr;  // left  — y-axis labels
    const PR =  6 * dpr;  // right
    const PT = 18 * dpr;  // top   — step numbers
    const PB = 18 * dpr;  // bottom — bar labels

    const gW = W - PL - PR;
    const gH = H - PT - PB;
    const N  = 32;
    const sw = gW / N;

    // Full clear
    ctx.clearRect(0, 0, W, H);

    // Grid background
    ctx.fillStyle = '#0d0d0f';
    ctx.fillRect(PL, PT, gW, gH);

    // ── Horizontal grid lines: only at 0, 25, 50, 75, 99 ────────────────
    const gridLevels = [99, 75, 50, 25, 0];
    gridLevels.forEach(lvl => {
      // y=PT → level 99 (top), y=PT+gH → level 0 (bottom)
      const y = PT + gH - (lvl / 99) * gH;
      ctx.strokeStyle = lvl === 0 || lvl === 99 ? '#3a3a48' : '#222228';
      ctx.lineWidth   = lvl === 50 ? 1.5 * dpr : 1;
      ctx.setLineDash(lvl === 50 ? [4*dpr, 3*dpr] : []);
      ctx.beginPath();
      ctx.moveTo(PL, y);
      ctx.lineTo(PL + gW, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Y-axis label
      ctx.fillStyle   = '#5a5a68';
      ctx.font        = (9 * dpr) + 'px monospace';
      ctx.textAlign   = 'right';
      ctx.textBaseline= 'middle';
      ctx.fillText(String(lvl), PL - 4, y);
    });

    // ── Bar 1 / Bar 2 divider ────────────────────────────────────────────
    const midX = PL + gW / 2;
    ctx.strokeStyle = '#4a4a58';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3*dpr, 3*dpr]);
    ctx.beginPath();
    ctx.moveTo(midX, PT);
    ctx.lineTo(midX, PT + gH);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Bar labels (below grid) ──────────────────────────────────────────
    ctx.fillStyle    = '#5a5a68';
    ctx.font         = (8 * dpr) + 'px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('BAR 1', PL + gW / 4,     PT + gH + 3 * dpr);
    ctx.fillText('BAR 2', PL + 3 * gW / 4, PT + gH + 3 * dpr);

    // ── Steps ────────────────────────────────────────────────────────────
    this._steps.forEach((step, i) => {
      const x   = PL + i * sw;
      const lvl = step.level ?? 0;

      // Bar height: level 0 → 0px, level 99 → gH px
      const bH  = (lvl / 99) * gH;
      const by  = PT + gH - bH;

      const isPlay    = this._playStep === i;
      const isHover   = this._hoverStep === i;

      // Bar colour: cool-to-warm gradient based on level
      const t  = lvl / 99;
      const r_ = Math.round(40  + t * 215);
      const g_ = Math.round(80  + t * 30);
      const b_ = Math.round(180 - t * 160);
      const barColor = isPlay
        ? '#ff7a52'
        : ('rgb(' + r_ + ',' + g_ + ',' + b_ + ')');

      // Draw bar only if level > 0
      if (lvl > 0) {
        ctx.fillStyle = barColor;
        ctx.fillRect(x + 1, by, sw - 2, bH);

        // Subtle top highlight
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x + 1, by, sw - 2, Math.min(3 * dpr, bH));
      }

      // Envelope triangle overlay
      if (step.envelope && lvl > 0) {
        ctx.strokeStyle = isPlay ? '#ffdd88' : '#ffbb20';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 2,      PT + gH);
        ctx.lineTo(x + sw / 2, by - 2);
        ctx.lineTo(x + sw - 2, PT + gH);
        ctx.stroke();
        ctx.fillStyle = isPlay ? '#ffdd88' : '#ffbb20';
        ctx.beginPath();
        ctx.arc(x + sw / 2, by - 3, 2.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Playing step: bright orange outline
      if (isPlay) {
        ctx.strokeStyle = '#ff7a52';
        ctx.lineWidth   = 2;
        ctx.strokeRect(x + 1, PT, sw - 2, gH);
      }

      // Hover outline
      if (isHover && !isPlay) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(x, PT, sw, gH);
      }

      // Step number label (every 4th + step 16 + step 32)
      const stepNum = i < 16 ? i + 1 : i - 15;
      if (i % 4 === 0 || i === 15 || i === 31) {
        ctx.fillStyle    = '#5a5a68';
        ctx.font         = (7.5 * dpr) + 'px monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(stepNum), x + sw / 2, PT - 2);
      }
    });

    // ── Left border ──────────────────────────────────────────────────────
    ctx.strokeStyle = '#3a3a48';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(PL, PT);
    ctx.lineTo(PL, PT + gH);
    ctx.stroke();

    // Store geometry for hit testing
    this._geo = { PL, PR, PT, PB, gW, gH, N, sw, dpr };
  }

  // ── Canvas interactions ───────────────────────────────────────────────────
  _bindCanvas() {
    const c = this._canvas;

    c.addEventListener('mousedown',  e => this._onDown(e));
    c.addEventListener('mousemove',  e => this._onMove(e));
    c.addEventListener('mouseup',    e => this._onUp(e));
    c.addEventListener('mouseleave', () => { this._hoverStep = -1; this._drag = null; this._draw(); });
    c.addEventListener('contextmenu',e => { e.preventDefault(); this._onRightClick(e); });
    c.addEventListener('dblclick',   e => this._onDblClick(e));
    c.addEventListener('wheel',      e => { e.preventDefault(); this._onWheel(e); }, { passive:false });

    // Touch
    c.addEventListener('touchstart', e => { e.preventDefault(); this._onDown(e.touches[0]); }, { passive:false });
    c.addEventListener('touchmove',  e => { e.preventDefault(); this._onMove(e.touches[0]); }, { passive:false });
    c.addEventListener('touchend',   e => { e.preventDefault(); this._onUp(e); }, { passive:false });

    window.addEventListener('mouseup', () => { if (this._drag) { this._drag = null; } });

    this._hoverStep = -1;
  }

  _hitTest(e) {
    if (!this._geo) return -1;
    const rect = this._canvas.getBoundingClientRect();
    const px   = (e.clientX - rect.left)  * devicePixelRatio;
    const py   = (e.clientY - rect.top)   * devicePixelRatio;
    const { PL, PT, gW, gH, N, sw } = this._geo;

    if (px < PL || px > PL + gW) return -1;
    if (py < PT || py > PT + gH) return -1;

    const idx = Math.floor((px - PL) / sw);
    return Math.max(0, Math.min(N - 1, idx));
  }

  _levelFromY(e) {
    if (!this._geo) return 0;
    const rect = this._canvas.getBoundingClientRect();
    const py   = (e.clientY - rect.top) * devicePixelRatio;
    const { PT, gH } = this._geo;
    const t    = 1 - (py - PT) / gH;
    return Math.max(0, Math.min(99, Math.round(t * 99)));
  }

  _onDown(e) {
    const idx = this._hitTest(e);
    if (idx < 0) return;
    const lvl = this._levelFromY(e);
    this._drag = { startIdx: idx, lastIdx: idx };
    this._setLevel(idx, lvl);
  }

  _onMove(e) {
    const idx = this._hitTest(e);
    this._hoverStep = idx;

    if (this._drag) {
      if (idx >= 0) {
        const lvl = this._levelFromY(e);
        // Fill all steps between last and current
        const from = Math.min(this._drag.lastIdx, idx);
        const to   = Math.max(this._drag.lastIdx, idx);
        for (let i = from; i <= to; i++) this._setLevel(i, lvl);
        this._drag.lastIdx = idx;
      }
    } else if (idx >= 0) {
      const s = this._steps[idx];
      if (this._stepInfo && s) {
        this._stepInfo.textContent =
          `Step ${idx+1} (${idx < 16 ? 'Bar 1' : 'Bar 2'}) · Level: ${s.level} · Envelope: ${s.envelope ? 'ON' : 'OFF'}`;
      }
    }
    this._draw();
  }

  _onUp() {
    this._drag = null;
  }

  _onRightClick(e) {
    const idx = this._hitTest(e);
    if (idx < 0) return;
    this._toggleEnvelope(idx);
  }

  _onDblClick(e) {
    const idx = this._hitTest(e);
    if (idx < 0) return;
    this._setLevel(idx, 0);
  }

  _onWheel(e) {
    const idx = this._hitTest(e);
    if (idx < 0) return;
    const delta = e.deltaY < 0 ? 1 : -1;
    const cur   = this._steps[idx]?.level ?? 0;
    this._setLevel(idx, Math.max(0, Math.min(99, cur + delta)));
  }

  // ── Step mutations ────────────────────────────────────────────────────────
  _setLevel(idx, level) {
    if (!this._steps[idx]) return;
    if (this._steps[idx].level === level) return;
    this._steps[idx] = { ...this._steps[idx], level };
    this._dirty = true;
    this._pushStep(idx);
    this._draw();
  }

  _toggleEnvelope(idx) {
    if (!this._steps[idx]) return;
    this._steps[idx] = { ...this._steps[idx], envelope: !this._steps[idx].envelope };
    this._dirty = true;
    this._pushStep(idx);
    this._draw();
  }

  // Send single step to device (bytes 32-63 → addr 0x20+idx)
  _pushStep(idx) {
    const s   = this._steps[idx];
    const byte= (s.level & 0x7F) | (s.envelope ? 0x80 : 0);
    // send:false — we send this step's own single-param message below
    // instead of the full-buffer resend presetStore.set() would otherwise
    // schedule (sequenceSteps has no PARAM_ADDR entry).
    presetStore.set('sequenceSteps', [...this._steps], { send: false });

    if (midi.connected) {
      // Sequence steps are at preset buffer addresses 0x20..0x3F
      midi.send(buildSingleParam(0, 0x20 + idx, byte));
    }
  }

  // ── Toolbar actions ───────────────────────────────────────────────────────
  _randomize() {
    this._steps = this._steps.map(s => ({
      ...s,
      level: Math.floor(Math.random() * 100),
    }));
    this._dirty = true;
    this._sendAll();
    this._draw();
  }

  _invert() {
    this._steps = this._steps.map(s => ({ ...s, level: 99 - s.level }));
    this._dirty = true;
    this._sendAll();
    this._draw();
  }

  _shift(dir) {
    const arr = [...this._steps];
    if (dir < 0) arr.push(arr.shift());
    else          arr.unshift(arr.pop());
    this._steps = arr;
    this._dirty = true;
    this._sendAll();
    this._draw();
  }

  _clearAll() {
    this._steps = this._steps.map(() => ({ level: 0, envelope: false }));
    this._dirty = true;
    this._sendAll();
    this._draw();
  }

  // Copy from a numbered variation (simplified: generate pattern from variation index)
  _copyFromVariation(varIdx) {
    // Generate representative patterns for demo
    const patterns = [
      // var 0: all 99
      Array(32).fill(99),
      // var 1: boom-chik accent on 1,3
      Array.from({length:32}, (_,i) => (i%4===0)?99:(i%4===2)?60:30),
      // var 2: ascending
      Array.from({length:32}, (_,i) => Math.round((i/31)*99)),
      // var 3: descending
      Array.from({length:32}, (_,i) => Math.round(99-(i/31)*99)),
      // var 4: alternating hi-lo
      Array.from({length:32}, (_,i) => i%2===0?99:20),
      // var 5: sine-ish
      Array.from({length:32}, (_,i) => Math.round(49+49*Math.sin((i/32)*Math.PI*2))),
      // var 6: 3-against-4
      Array.from({length:32}, (_,i) => [99,0,0,50,0,0,99,0,0,50,0,0,99,0,0,50,0,0,99,0,0,50,0,0,99,0,0,50,0,0,99,0][i]||0),
      // var 7: random spikes
      Array.from({length:32}, () => Math.random()<0.3?99:0),
      // var 8: every 3rd
      Array.from({length:32}, (_,i) => i%3===0?99:0),
    ];
    const pat = patterns[varIdx % patterns.length] ?? patterns[0];
    this._steps = this._steps.map((s,i) => ({ ...s, level: pat[i] ?? 0 }));
    this._dirty = true;
    this._sendAll();
    this._draw();
  }

  _sendAll() {
    // send:false — we explicitly send the full edit buffer immediately
    // below instead of the throttled resend presetStore.set() would
    // otherwise schedule.
    presetStore.set('sequenceSteps', this._steps.map(s=>({...s})), { send: false });
    if (midi.connected) presetStore.sendToDevice();
  }

  // ── Playback cursor ───────────────────────────────────────────────────────
  setPlayStep(step) {
    this._playStep = step;
    if (this._playInfo) {
      this._playInfo.textContent = step >= 0
        ? `▶ Step ${step+1} / 32`
        : '⏸ Stopped';
    }
    this._draw();
  }

  // ── Sync from store ───────────────────────────────────────────────────────
  _syncFromStore() {
    const p = presetStore.preset;
    this._steps = p.sequenceSteps
      ? p.sequenceSteps.map(s=>({...s}))
      : Array(32).fill(null).map(()=>({level:0,envelope:false}));

    // Update type label
    const isSeq = SEQ_EFFECTS.has(p.modEffect);
    this._isSeqActive = isSeq;
    if (this._typeLabel) {
      this._typeLabel.textContent = isSeq
        ? `${SEQ_TYPE_LABEL[p.modEffect] ?? ''} · Y: ${SEQ_Y_LABEL[p.modEffect] ?? 'Level'}`
        : 'No sequence effect active';
    }
    if (this._activeBadge) {
      this._activeBadge.style.display = isSeq ? '' : 'none';
    }
    // Editing has zero effect on the device unless a sequence effect is
    // active — disable the canvas and toolbar rather than letting the user
    // silently edit/send a sequence that does nothing.
    if (this._wrap) {
      this._wrap.style.opacity = isSeq ? '' : '.4';
      this._wrap.style.pointerEvents = isSeq ? '' : 'none';
    }
    this._toolbarBtns?.forEach(btn => { if (btn) btn.disabled = !isSeq; });

    this._dirty = false;
    this._draw();
  }

  // ── Store subscriptions ───────────────────────────────────────────────────
  _bindStore() {
    this._unsub.push(presetStore.on('load', () => this._syncFromStore()));
    this._unsub.push(presetStore.on('change', ({ field, value }) => {
      if (field === 'sequenceSteps') {
        this._steps = value.map(s=>({...s}));
        this._draw();
      }
      if (field === 'modEffect') {
        this._syncFromStore();
      }
    }));

    // Clock → step cursor
    this._unsub.push(midi.on('clock', () => {
      if (!this._playing) return;
      this._clockCount = (this._clockCount + 1) % 6;
      if (this._clockCount === 0) {
        this._playStep = (this._playStep + 1) % 32;
        this.setPlayStep(this._playStep);
      }
    }));
    this._unsub.push(midi.on('start', () => {
      this._playing   = true;
      this._playStep  = -1;
      this._clockCount= 0;
      if (this._playInfo) this._playInfo.textContent = '▶ Playing';
    }));
    this._unsub.push(midi.on('stop', () => {
      this._playing = false;
      this.setPlayStep(-1);
    }));
  }

  destroy() {
    this._unsub.forEach(fn => typeof fn === 'function' && fn());
    this._resizeObs?.disconnect();
    cancelAnimationFrame(this._raf);
    this.container.innerHTML = '';
  }
}
