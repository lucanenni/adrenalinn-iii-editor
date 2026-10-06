/**
 * A fake AdrenaLinn III for tests — reproduces what was observed on a real pedal
 * (firmware 3.0.3), including the behaviours the spec doesn't mention:
 *   - Save Complete carries the File Version byte; Factory Init is ignored without it
 *     and sends no Save Complete
 *   - writing a preset (ID 2) stamps a tempo into byte 30 chosen by Tempo Source: the
 *     drumbeat edit buffer's tempo (1), the System tempo (0), or the slot's existing tempo (2)
 *   - selecting a preset also selects its assigned drumbeat while "Preset Sets Drumbeat" is on
 *   - a single-param write to a Mod FX / Amp / Delay / Reverb parameter switches that block on,
 *     and a new Mod Effect / Variation loads that effect's defaults
 *   - the System dump is 46 bytes
 * Wire it to the real midiManager with attach(); replies arrive asynchronously.
 */
import { midi } from '../src/midi/midiManager.js';
import { pack7bit, unpack7bit, buildSendPreset, buildSendPresetEditBuf, buildSendDrumbeat } from '../src/midi/sysex.js';
import { buildSendDrumbeatEditBuf, serializeDrumbeat, defaultDrumbeat } from '../src/midi/drumbeatData.js';
import { serializePreset, defaultPreset, filterTypeOptions } from '../src/midi/presetData.js';

const HDR = [0xF0, 0x00, 0x01, 0x37, 0x03, 0x01];
const FACTORY_SYSTEM = () => [
  0, 0, 110, 60, 0, 1, 2, 50, 1, 0, 0, 1, 0, 0, 4, 11, 0,
  ...Array(15).fill(255),
  44, 56, 1, 55, 2, 3, 4, 5, 6, 7, 44, 45, 48, 51,
];
const BLOCK_PARAMS = { 0x01: [2, 4, 5, 6, 7, 10, 0, 1], 0x02: [11, 12, 13, 14, 15, 17], 0x08: [19, 20, 21], 0x10: [23] };

export class FakePedal {
  constructor() { this.factoryReset(); this.log = []; this.factoryInitsObeyed = 0; this.ignored = []; }

  factoryReset() {
    this.slotsP = Array.from({ length: 200 }, (_, n) => {
      const raw = Array.from(serializePreset({ ...defaultPreset(), speed: n % 100, presetTempo: 100, presetDrumbeat: n }));
      return raw;
    });
    this.slotsD = Array.from({ length: 200 }, (_, n) => Array.from(serializeDrumbeat({ ...defaultDrumbeat(), tempo: n === 0 ? 110 : 60 + (n % 90) })));
    this.sys = FACTORY_SYSTEM();
    this.presetEdit = this.slotsP[0].slice();
    this.drumEdit = this.slotsD[0].slice();
  }

  attach() {
    midi.outputPort = { send: data => this.receive(Array.from(data)) };
    midi.inputPort = {};
    midi.connected = true;
    return this;
  }

  reply(bytes) { setTimeout(() => midi._onMidiMessage({ data: Uint8Array.from(bytes) }), 0); }
  saveComplete() { setTimeout(() => this.reply([...HDR, 0x11, 0xF7]), 20); }

  receive(b) {
    this.log.push(b);
    if (b[0] === 0xF0 && b[1] === 0x7E) { // Identity Request → spec-layout reply, firmware 3.0.3
      return this.reply([0xF0, 0x7E, 0x00, 0x06, 0x02, 0x00, 0x01, 0x37, 0x01, 0x00, 0x03, 0x00, 0x33, 0x30, 0x33, 0x00, 0xF7]);
    }
    if (b[1] !== 0x00 || b[2] !== 0x01 || b[3] !== 0x37 || b[4] !== 0x03) return;
    if (b.length === 7) { this.ignored.push(b); return; } // no File Version byte: the real pedal ignores it
    const id = b[6], payload = () => unpack7bit(b.slice(7, -1));
    const nib = () => b[7] | (b[8] << 4);
    switch (id) {
      case 0x01: { // single parameter
        const [buf, addr, val] = [b[7], b[8], b[9] | (b[10] << 4)];
        if (buf === 0) this._presetParam(addr, val);
        else if (buf === 1) { this.drumEdit[addr] = val; if (addr === 8 && this.sys[8] === 1) this.sys[2] = val; } // System tempo follows the drumbeat's while Tempo Source = drumbeat
        else if (buf === 2) this.sys[addr] = val;
        break;
      }
      case 0x02: { // send preset → overwrites the selected slot, stamping the current drumbeat tempo
        const data = payload().slice(0, 64); const slot = this.sys[0], source = this.sys[8];
        data[30] = source === 0 ? this.sys[2] : source === 2 ? this.slotsP[slot][30] : this.drumEdit[8];
        this.slotsP[slot] = data; this.saveComplete(); break;
      }
      case 0x03: { this.slotsD[this.sys[1]] = payload().slice(0, 44); this.saveComplete(); break; }
      case 0x05: this.reply(Array.from(buildSendPreset(this.slotsP[nib()]))); break;
      case 0x06: this.reply(Array.from(buildSendDrumbeat(this.slotsD[nib()]))); break;
      case 0x08: this._selectDrumbeat(nib()); break;
      case 0x09: this._selectPreset(nib()); break;
      case 0x0A: this.reply(Array.from(buildSendPresetEditBuf(this.presetEdit))); break;
      case 0x0B: this.presetEdit = payload().slice(0, 64); break;
      case 0x0C: this.reply(Array.from(buildSendDrumbeatEditBuf(this.drumEdit))); break;
      case 0x0D: this.drumEdit = payload().slice(0, 44); break;
      case 0x0E: this.reply([...HDR, 0x0F, ...pack7bit(this.sys), 0xF7]); break;
      case 0x13: this.factoryInitsObeyed++; this.factoryReset(); break; // obeyed only WITH File Version; no Save Complete
    }
  }

  _selectPreset(n) {
    this.sys[0] = n; this.presetEdit = this.slotsP[n].slice();
    if (this.sys[5] === 1) this._selectDrumbeat(this.slotsP[n][31]); // Preset Sets Drumbeat
  }
  _selectDrumbeat(n) { this.sys[1] = n; this.drumEdit = this.slotsD[n].slice(); if (this.sys[8] === 1) this.sys[2] = this.drumEdit[8]; }

  _presetParam(addr, val) {
    this.presetEdit[addr] = val;
    for (const [flag, addrs] of Object.entries(BLOCK_PARAMS)) if (addrs.includes(addr)) this.presetEdit[9] |= Number(flag);
    if (addr === 0 || addr === 1) { // new effect / variation → that effect's defaults
      const first = filterTypeOptions(this.presetEdit[0])[0] ?? 0;
      this.presetEdit[3] = (first << 4) | (this.presetEdit[3] & 0x0F);
      this.presetEdit[5] = 59; this.presetEdit[8] = 4; this.presetEdit[10] = 50;
    }
  }
}
