/**
 * AdrenaLinn III MIDI Manager
 * Handles Web MIDI API connection, port selection, message routing
 */

import { buildIdentityRequest, parseSysEx, parseIdentityReply } from './sysex.js';

export class MidiManager extends EventTarget {
  constructor() {
    super();
    this.access = null;
    this.inputPort = null;
    this.outputPort = null;
    this.connected = false;
    this.deviceName = null;
    this._sysexBuffer = [];
    this._collecting = false;
    this._lastIds = null; // {inputId, outputId} of the last connection; cleared by an explicit disconnect() so only unplugging auto-reconnects
    this._onMidiMessage = this._onMidiMessage.bind(this);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async init() {
    if (!navigator.requestMIDIAccess) {
      throw new Error('Web MIDI API not supported. Use Chrome or Edge.');
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: true });
      this.access.onstatechange = (e) => this._onStateChange(e);
      this._emit('ready', { inputs: this.getInputs(), outputs: this.getOutputs() });
    } catch (err) {
      throw new Error(`MIDI access denied: ${err.message}`);
    }
  }

  // ── Port enumeration ──────────────────────────────────────────────────────
  getInputs() {
    if (!this.access) return [];
    return Array.from(this.access.inputs.values()).map(p => ({
      id: p.id, name: p.name, manufacturer: p.manufacturer,
    }));
  }

  getOutputs() {
    if (!this.access) return [];
    return Array.from(this.access.outputs.values()).map(p => ({
      id: p.id, name: p.name, manufacturer: p.manufacturer,
    }));
  }

  // ── Connect to specific ports ─────────────────────────────────────────────
  connect(inputId, outputId) {
    if (this.inputPort) {
      this.inputPort.onmidimessage = null;
    }
    this.inputPort = this.access.inputs.get(inputId) || null;
    this.outputPort = this.access.outputs.get(outputId) || null;

    if (this.inputPort) {
      this.inputPort.onmidimessage = this._onMidiMessage;
    }
    this.connected = !!(this.inputPort && this.outputPort);
    if (this.connected) this._lastIds = { inputId, outputId };
    this._emit('connectionChange', { connected: this.connected, inputPort: this.inputPort, outputPort: this.outputPort });
    return this.connected;
  }

  disconnect() {
    this._lastIds = null;
    this._dropConnection('user');
  }

  _dropConnection(reason) {
    if (this.inputPort) this.inputPort.onmidimessage = null;
    this._sysexBuffer = [];
    this._collecting  = false;
    this.inputPort = null;
    this.outputPort = null;
    this.connected = false;
    this.deviceName = null;
    this._emit('connectionChange', { connected: false, reason });
  }

  // ── Auto-detect AdrenaLinn III ────────────────────────────────────────────
  async autoDetect(timeoutMs = 2000) {
    const outputs = Array.from(this.access.outputs.values());
    const inputs = Array.from(this.access.inputs.values());

    // Try every output/input pair, send Identity Request
    for (const out of outputs) {
      for (const inp of inputs) {
        const found = await this._probePort(inp, out, timeoutMs / outputs.length);
        if (found) {
          this.connect(inp.id, out.id);
          return { inputId: inp.id, outputId: out.id, name: this.deviceName };
        }
      }
    }
    return null;
  }

  _probePort(input, output, timeoutMs) {
    return new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => { if (!resolved) { resolved = true; cleanup(); resolve(false); } }, timeoutMs);

      const handler = (e) => {
        const id = parseIdentityReply(Array.from(e.data));
        if (id) {
          resolved = true;
          this.deviceName = `AdrenaLinn III (v${id.version})`;
          clearTimeout(timer);
          cleanup();
          resolve(true);
        }
      };

      const cleanup = () => { input.onmidimessage = null; };
      input.onmidimessage = handler;
      output.send(buildIdentityRequest());
    });
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  send(data) {
    if (!this.outputPort) { console.warn('No output port'); return false; }
    try {
      this.outputPort.send(data);
      this._emit('send', { data });
      return true;
    } catch (e) {
      console.error('MIDI send error', e);
      return false;
    }
  }

  // Send with a delay (for bulk dump sequences requiring 1s between messages)
  sendWithDelay(data, delayMs = 1100) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(this.send(data));
      }, delayMs);
    });
  }

  // ── Incoming message handler ───────────────────────────────────────────────
  _onMidiMessage(e) {
    const data = Array.from(e.data);
    this._emit('raw', { data });

    // System real-time messages (0xF8-0xFF) are always a single byte with no
    // channel nibble to mask off, and the spec allows them to legally arrive
    // interleaved with anything else — including mid-SysEx. Handle them here,
    // before both the `& 0xF0` mask below (which would collapse all of them
    // to 0xF0, making them indistinguishable) and the SysEx accumulator
    // (which would otherwise splice a stray byte into an in-progress buffer).
    if (data.length === 1 && data[0] >= 0xF8) {
      switch (data[0]) {
        case 0xF8: this._emit('clock', {}); break;
        case 0xFA: this._emit('start', {}); break;
        case 0xFC: this._emit('stop', {}); break;
        default:   this._emit('midi', { data });
      }
      return;
    }

    // SysEx accumulator
    if (data[0] === 0xF0) {
      this._sysexBuffer = [...data];
      if (data[data.length - 1] === 0xF7) {
        this._dispatchSysEx(this._sysexBuffer);
        this._sysexBuffer = [];
      } else {
        this._collecting = true;
      }
      return;
    }
    if (this._collecting) {
      this._sysexBuffer.push(...data);
      if (data.includes(0xF7)) {
        this._collecting = false;
        this._dispatchSysEx(this._sysexBuffer);
        this._sysexBuffer = [];
      }
      return;
    }

    // Regular MIDI messages
    const status = data[0] & 0xF0;
    const channel = (data[0] & 0x0F) + 1;

    switch (status) {
      case 0xB0: // CC
        this._emit('cc', { channel, cc: data[1], value: data[2] });
        break;
      case 0xC0: // Program Change
        this._emit('programChange', { channel, program: data[1] });
        break;
      default:
        this._emit('midi', { data });
    }
  }

  _dispatchSysEx(bytes) {
    const parsed = parseSysEx(bytes);
    if (parsed) {
      this._emit('sysex', parsed);
      this._emit(`sysex:${parsed.type}`, parsed);
    } else {
      this._emit('sysex:unknown', { raw: bytes });
    }
  }

  // ── State change (port connect/disconnect) ────────────────────────────────
  _onStateChange(e) {
    const port = e.port;
    this._emit('portChange', {
      port: { id: port.id, name: port.name, type: port.type, state: port.state, connection: port.connection },
    });
    // Cable unplugged: drop the stale connection so the UI and any running
    // transfer find out, instead of silently sending into a dead port.
    if (port.state === 'disconnected' && this.connected &&
        (port.id === this.inputPort?.id || port.id === this.outputPort?.id)) {
      this._dropConnection('lost');
    }
    // Same ports back (and the user never pressed Disconnect): reconnect.
    else if (port.state === 'connected' && !this.connected && this._lastIds &&
             this.access.inputs.has(this._lastIds.inputId) &&
             this.access.outputs.has(this._lastIds.outputId) &&
             (port.id === this._lastIds.inputId || port.id === this._lastIds.outputId)) {
      if (this.connect(this._lastIds.inputId, this._lastIds.outputId)) this._emit('reconnected', {});
    }
    // Re-emit updated port lists
    this._emit('portsUpdated', { inputs: this.getInputs(), outputs: this.getOutputs() });
  }

  // ── EventTarget helper ────────────────────────────────────────────────────
  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  // ── Convenience listener ──────────────────────────────────────────────────
  on(type, handler) {
    const wrapped = (e) => handler(e.detail);
    this.addEventListener(type, wrapped);
    return () => this.removeEventListener(type, wrapped);
  }

  once(type) {
    return new Promise((resolve) => {
      const handler = (e) => {
        this.removeEventListener(type, handler);
        resolve(e.detail);
      };
      this.addEventListener(type, handler);
    });
  }

  onceWithTimeout(type, ms = 3000) {
    return Promise.race([
      this.once(type),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), ms)),
    ]);
  }
}

// Singleton
export const midi = new MidiManager();
