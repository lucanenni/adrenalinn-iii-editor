/**
 * Knob — SVG arc knob with mouse/touch drag
 * Usage:
 *   const k = new Knob({ container, label, min, max, value, step, onChange })
 *   k.setValue(50)
 *   k.destroy()
 */
export class Knob {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.container  — where to mount
   * @param {string}  opts.label
   * @param {number}  opts.min
   * @param {number}  opts.max
   * @param {number}  opts.value
   * @param {number}  [opts.step=1]
   * @param {boolean} [opts.bipolar=false]  — centers 0 in the arc
   * @param {string}  [opts.unit='']
   * @param {function} opts.onChange       — called with (value)
   * @param {string[]} [opts.enumValues]   — if set, renders enum selector
   * @param {boolean} [opts.details=false] — italic label style
   */
  constructor(opts) {
    this.opts     = opts;
    this.min      = opts.min   ?? 0;
    this.max      = opts.max   ?? 99;
    this.step     = opts.step  ?? 1;
    this.value    = opts.value ?? this.min;
    this.bipolar  = opts.bipolar ?? false;
    this.unit     = opts.unit  ?? '';
    this._onChange= opts.onChange ?? (() => {});
    this._dragging= false;
    this._startY  = 0;
    this._startVal= 0;

    this._build();
    this._bind();
  }

  // ── Build DOM ─────────────────────────────────────────────────────────────
  _build() {
    const { label, enumValues, details } = this.opts;

    this.root = document.createElement('div');
    this.root.className = 'knob-cell';
    this.root.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;user-select:none;';

    // If enum: dropdown instead of knob
    if (enumValues) {
      this._buildEnum(label, enumValues, details);
      this.opts.container.appendChild(this.root);
      return;
    }

    // SVG knob
    const SIZE = 44;
    const R    = 16;
    const CX   = SIZE / 2;
    const CY   = SIZE / 2;

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', SIZE);
    this.svg.setAttribute('height', SIZE);
    this.svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    this.svg.style.cssText = 'cursor:ns-resize;flex-shrink:0;touch-action:none;';
    // Keyboard / screen-reader access: the knob is a slider (arrows, PageUp/Down, Home/End)
    this.svg.setAttribute('tabindex', '0');
    this.svg.setAttribute('role', 'slider');
    this.svg.setAttribute('aria-label', label);
    this.svg.setAttribute('aria-valuemin', this.min);
    this.svg.setAttribute('aria-valuemax', this.max);

    // Track arc (background)
    const arcBg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arcBg.setAttribute('fill', 'none');
    arcBg.setAttribute('stroke', 'var(--border2)');
    arcBg.setAttribute('stroke-width', '3');
    arcBg.setAttribute('stroke-linecap', 'round');
    arcBg.setAttribute('d', this._arcPath(CX, CY, R, 135, 405));

    // Value arc (foreground)
    this.arcFg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.arcFg.setAttribute('fill', 'none');
    this.arcFg.setAttribute('stroke', 'var(--accent)');
    this.arcFg.setAttribute('stroke-width', '3');
    this.arcFg.setAttribute('stroke-linecap', 'round');

    // Knob body
    this.circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    this.circle.setAttribute('cx', CX);
    this.circle.setAttribute('cy', CY);
    this.circle.setAttribute('r', R - 5);
    this.circle.setAttribute('fill', 'var(--bg3)');
    this.circle.setAttribute('stroke', 'var(--border2)');
    this.circle.setAttribute('stroke-width', '1.5');

    // Indicator dot
    this.dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    this.dot.setAttribute('r', '2.5');
    this.dot.setAttribute('fill', 'var(--accent2)');

    this.svg.append(arcBg, this.arcFg, this.circle, this.dot);

    // Value text
    this.valText = document.createElement('div');
    this.valText.style.cssText = `
      font-family:var(--font-ui);font-size:10px;color:var(--text2);
      background:var(--bg);border:1px solid var(--border);border-radius:3px;
      padding:1px 4px;min-width:32px;text-align:center;cursor:ns-resize;
    `;

    // Label
    this.labelEl = document.createElement('div');
    this.labelEl.style.cssText = `
      font-size:9px;text-transform:uppercase;letter-spacing:.07em;
      color:${details ? 'var(--accent)' : 'var(--text3)'};
      font-style:${details ? 'italic' : 'normal'};
      text-align:center;max-width:52px;line-height:1.2;
    `;
    this.labelEl.textContent = label;

    this.root.append(this.svg, this.valText, this.labelEl);
    this.opts.container.appendChild(this.root);

    this._SIZE = SIZE; this._R = R; this._CX = CX; this._CY = CY;
    this._updateVisuals();
  }

  _buildEnum(label, enumValues, details) {
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', label);
    const named = !!this.opts.valueNames;
    // With full names the closed select shows "CODE · Name", so it is wider
    sel.style.cssText = `
      background:var(--bg3);border:1px solid var(--border);color:var(--text);
      font-family:var(--font-ui);font-size:10px;padding:3px 4px;
      border-radius:4px;width:${named ? 190 : 56}px;max-width:100%;appearance:none;cursor:pointer;
      text-overflow:ellipsis;
    `;
    enumValues.forEach((v, i) => {
      const name = this.opts.valueNames?.[i];
      sel.appendChild(new Option(name ? `${v} · ${name}` : v, i));
    });
    sel.value = String(Math.min(this.value, enumValues.length - 1));
    sel.onchange = () => {
      this.value = parseInt(sel.value);
      this._onChange(this.value);
    };
    this.enumSel = sel;

    const lbl = document.createElement('div');
    lbl.style.cssText = `
      font-size:9px;text-transform:uppercase;letter-spacing:.07em;
      color:${details ? 'var(--accent)' : 'var(--text3)'};
      font-style:${details ? 'italic' : 'normal'};
      text-align:center;max-width:${named ? 190 : 56}px;line-height:1.2;
    `;
    lbl.textContent = label;

    this.root.append(sel, lbl);
  }

  // ── Arc path math ─────────────────────────────────────────────────────────
  _arcPath(cx, cy, r, startDeg, endDeg) {
    const toRad = d => (d - 90) * Math.PI / 180;
    const s = toRad(startDeg), e = toRad(endDeg);
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
    const large = (endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  }

  _updateVisuals() {
    if (!this.svg) return;
    const { _SIZE: SIZE, _R: R, _CX: CX, _CY: CY } = this;
    const t      = (this.value - this.min) / (this.max - this.min);
    const tClamped = Math.max(0, Math.min(1, t));

    // Arc: 135° to 405° = 270° total travel
    const startDeg = 135;
    const endDeg   = this.bipolar
      ? (this.value >= 0 ? 270 : 270 - (0 - t) * 270)
      : startDeg + tClamped * 270;

    const effectiveEnd = startDeg + tClamped * 270;
    this.arcFg.setAttribute('d', this._arcPath(CX, CY, R, startDeg, effectiveEnd));
    this.arcFg.setAttribute('stroke', tClamped > 0.75 ? 'var(--accent2)' : 'var(--accent)');

    // Dot position
    const dotAngle = startDeg + tClamped * 270;
    const dotRad   = (dotAngle - 90) * Math.PI / 180;
    const dotR     = R - 5;
    this.dot.setAttribute('cx', CX + dotR * Math.cos(dotRad));
    this.dot.setAttribute('cy', CY + dotR * Math.sin(dotRad));

    // Value text
    const disp = this.opts.valueLabels?.[this.value]
      ?? (this.unit ? `${this.value}${this.unit}` : String(this.value));
    this.valText.textContent = disp;
    this.svg.setAttribute('aria-valuenow', this.value);
    this.svg.setAttribute('aria-valuetext', disp);
  }

  // ── Drag binding ──────────────────────────────────────────────────────────
  _bind() {
    if (!this.svg) return;
    const dragEl = this.svg;

    // Mouse
    dragEl.addEventListener('mousedown', e => {
      e.preventDefault();
      this._startDrag(e.clientY);
    });
    window.addEventListener('mousemove', e => { if (this._dragging) this._drag(e.clientY); });
    window.addEventListener('mouseup',   () => { if (this._dragging) this._endDrag(); });

    // Touch
    dragEl.addEventListener('touchstart', e => {
      e.preventDefault();
      this._startDrag(e.touches[0].clientY);
    }, { passive: false });
    window.addEventListener('touchmove', e => {
      if (this._dragging) { e.preventDefault(); this._drag(e.touches[0].clientY); }
    }, { passive: false });
    window.addEventListener('touchend', () => { if (this._dragging) this._endDrag(); });

    // Keyboard
    dragEl.addEventListener('keydown', e => {
      const big = this.step * 10;
      const next = {
        ArrowUp: this.value + this.step, ArrowRight: this.value + this.step,
        ArrowDown: this.value - this.step, ArrowLeft: this.value - this.step,
        PageUp: this.value + big, PageDown: this.value - big,
        Home: this.min, End: this.max,
      }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      this._applyValue(next);
    });

    // Scroll wheel
    dragEl.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? this.step : -this.step;
      this._applyDelta(delta);
    }, { passive: false });

    // Double-click → value input
    this.valText?.addEventListener('dblclick', () => {
      const v = prompt(`Set ${this.opts.label} (${this.min}–${this.max}):`, this.value);
      if (v !== null) {
        const n = parseFloat(v);
        if (!isNaN(n)) this.setValue(Math.round(n / this.step) * this.step);
      }
    });
  }

  _startDrag(y) {
    this._dragging  = true;
    this._startY    = y;
    this._startVal  = this.value;
    this.svg?.style && (this.svg.style.cursor = 'ns-resize');
    this.circle?.setAttribute('stroke', 'var(--accent)');
  }

  _drag(y) {
    const dy    = this._startY - y;              // up = positive
    const range = this.max - this.min;
    const delta = (dy / 120) * range;            // 120px = full range
    const raw   = this._startVal + delta;
    const snapped = Math.round(raw / this.step) * this.step;
    this._applyValue(snapped);
  }

  _endDrag() {
    this._dragging = false;
    this.circle?.setAttribute('stroke', 'var(--border2)');
  }

  _applyDelta(delta) {
    this._applyValue(this.value + delta);
  }

  _applyValue(v) {
    const clamped = Math.max(this.min, Math.min(this.max, v));
    if (clamped === this.value) return;
    this.value = clamped;
    this._updateVisuals();
    this._onChange(this.value);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  setValue(v, silent = false) {
    const clamped = Math.max(this.min, Math.min(this.max, v));
    this.value = clamped;
    if (this.enumSel) {
      this.enumSel.value = String(Math.min(clamped, this.opts.enumValues.length - 1));
    } else {
      this._updateVisuals();
    }
    if (!silent) return;
  }

  setHighlight(on) {
    if (this.circle) this.circle.setAttribute('stroke', on ? 'var(--accent2)' : 'var(--border2)');
  }

  // Swap the option list of an enum-style knob (e.g. when a sibling field
  // like modEffect changes what the current value actually means).
  // Returns the clamped value so the caller can persist it if it changed.
  setEnumValues(values, names) {
    if (!this.enumSel) return this.value;
    this.opts.enumValues = values;
    if (names) this.opts.valueNames = names;
    this.max = values.length - 1;
    this.enumSel.innerHTML = '';
    values.forEach((v, i) => {
      const name = this.opts.valueNames?.[i];
      this.enumSel.appendChild(new Option(name ? `${v} · ${name}` : v, i));
    });
    this.value = Math.min(this.value, this.max);
    this.enumSel.value = String(this.value);
    return this.value;
  }

  // Visually and interactively disable the knob (e.g. while a sibling
  // "scale mode" toggle makes this value meaningless on the device).
  setEnabled(enabled) {
    this.root.style.opacity = enabled ? '' : '.4';
    this.root.style.pointerEvents = enabled ? '' : 'none';
  }

  destroy() {
    this.root?.remove();
  }
}

// ── Toggle switch component ───────────────────────────────────────────────
export class Toggle {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.container
   * @param {string} opts.label
   * @param {boolean} opts.value
   * @param {function} opts.onChange
   * @param {boolean} [opts.details]
   */
  constructor(opts) {
    this.opts = opts;
    this.value = opts.value ?? false;
    this._onChange = opts.onChange ?? (() => {});
    this._build();
  }

  _build() {
    this.root = document.createElement('div');
    this.root.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;';

    // Toggle track
    const wrap = document.createElement('label');
    wrap.style.cssText = 'position:relative;width:36px;height:18px;cursor:pointer;flex-shrink:0;';

    this.input = document.createElement('input');
    this.input.type = 'checkbox';
    this.input.checked = this.value;
    this.input.style.cssText = 'opacity:0;position:absolute;width:0;height:0;';

    this.track = document.createElement('span');
    this.track.style.cssText = `
      position:absolute;inset:0;border-radius:9px;
      background:${this.value ? 'var(--accent)' : 'var(--border2)'};
      transition:background .2s;
    `;

    this.thumb = document.createElement('span');
    this.thumb.style.cssText = `
      position:absolute;top:2px;left:${this.value ? '20px' : '2px'};
      width:14px;height:14px;border-radius:50%;
      background:${this.value ? '#fff' : 'var(--text3)'};
      transition:left .2s,background .2s;
    `;

    this.input.addEventListener('change', () => {
      this.value = this.input.checked;
      this._update();
      this._onChange(this.value);
    });

    wrap.append(this.input, this.track, this.thumb);

    const lbl = document.createElement('div');
    lbl.style.cssText = `
      font-size:9px;text-transform:uppercase;letter-spacing:.07em;
      color:${this.opts.details ? 'var(--accent)' : 'var(--text3)'};
      font-style:${this.opts.details ? 'italic' : 'normal'};
      text-align:center;
    `;
    lbl.textContent = this.opts.label;

    // LED indicator
    this.led = document.createElement('div');
    this.led.style.cssText = `
      width:6px;height:6px;border-radius:50%;
      background:${this.value ? 'var(--led-green)' : 'var(--led-off)'};
      box-shadow:${this.value ? '0 0 5px var(--led-green)' : 'none'};
      transition:all .2s;
    `;

    this.root.append(this.led, wrap, lbl);
    this.opts.container.appendChild(this.root);
  }

  _update() {
    this.track.style.background = this.value ? 'var(--accent)' : 'var(--border2)';
    this.thumb.style.left       = this.value ? '20px' : '2px';
    this.thumb.style.background = this.value ? '#fff' : 'var(--text3)';
    this.led.style.background   = this.value ? 'var(--led-green)' : 'var(--led-off)';
    this.led.style.boxShadow    = this.value ? '0 0 5px var(--led-green)' : 'none';
  }

  setValue(v, silent = false) {
    this.value = !!v;
    this.input.checked = this.value;
    this._update();
  }

  destroy() { this.root?.remove(); }
}
