/**
 * Write session — makes "write a preset to a slot" store the preset's OWN tempo.
 *
 * Device behaviour, verified on hardware: when a preset (ID 2) is written, the
 * pedal replaces the preset's Tempo byte (byte 30) with the *current drumbeat
 * tempo*, and selecting a slot first loads the preset's assigned drumbeat when
 * "Preset Sets Drumbeat" is on. So a plain select+send silently changes every
 * written preset's tempo to whatever drumbeat is loaded.
 *
 * withPresetTempoControl() switches "Preset Sets Drumbeat" off, hands the caller a
 * setTempo(T) that puts T into the drumbeat edit buffer right before each write,
 * and — always — puts everything back (the system flag, the drumbeat edit buffer,
 * optionally the previously active preset).
 *
 * What the pedal stamps depends on Tempo Source (hardware): "Drumbeat tempo" → the
 * drumbeat edit buffer's tempo; "System tempo" → the System tempo; "Preset tempo" → the
 * tempo the slot already had. Only the first can be set per write without side effects, so
 * the session switches Tempo Source to "Drumbeat tempo" while it runs and puts it back.
 * `exact` is false only if the System parameters couldn't be read.
 */
import { midi } from '../midi/midiManager.js';
import { buildSingleParam, buildRequestSystem, buildSelectPreset, buildSelectDrumbeat } from '../midi/sysex.js';
import { buildRequestDrumbeatEditBuf, buildSendDrumbeatEditBuf } from '../midi/drumbeatData.js';
import { buildSystemParam, systemField } from '../midi/systemData.js';
import { drumbeatStore } from './drumbeatStore.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function once(type, ms) {
  return new Promise(resolve => {
    const off = midi.on(type, d => { clearTimeout(t); off(); resolve(d); });
    const t = setTimeout(() => { off(); resolve(null); }, ms);
  });
}
async function ask(type, msg, ms = 1500) {
  const reply = once(type, ms);
  midi.send(msg);
  return reply;
}

// System parameters are saved to flash by the device on every change: write, then
// read back until the value is there before sending anything else.
async function setSystem(key, value) {
  const addr = systemField(key).addr;
  midi.send(buildSystemParam(key, value));
  for (let i = 0; i < 15; i++) {
    await sleep(200);
    const sys = await ask('sysex:system', buildRequestSystem(), 600);
    if (sys && sys.raw[addr] === value) return true;
  }
  return false;
}

// While a session runs the pedal's edit buffer is whatever slot was just selected, so the
// editor must not adopt it (presetStore checks this before resyncing from the pedal).
let sessions = 0;
export const writeSessionActive = () => sessions > 0;

/**
 * @param {(ctl: {exact: boolean, setTempo: (bpm:number)=>Promise<void>}) => Promise<any>} fn
 * @param {{reselect?: boolean}} [opts] reselect: select the previously active preset again at the end
 */
export async function withPresetTempoControl(fn, opts) {
  sessions++;
  try { return await runSession(fn, opts); }
  finally { sessions--; }
}

async function runSession(fn, { reselect = false } = {}) {
  const sys  = await ask('sysex:system', buildRequestSystem());
  // Read the drumbeat edit buffer only to put it back later — keep it out of the editor's drumbeat state
  drumbeatStore.setAutoLoadSuspended(true);
  let drum;
  try { drum = sys && await ask('sysex:drumbeatEditBuf', buildRequestDrumbeatEditBuf()); }
  finally { drumbeatStore.setAutoLoadSuspended(false); }
  if (!sys || !drum) return fn({ exact: false, setTempo: async () => {} });

  const saved = { tempoSource: sys.raw[8], systemTempo: sys.raw[2], setsDrumbeat: sys.raw[5], preset: sys.raw[0], drumbeatNumber: sys.raw[1], drumbeat: Uint8Array.from(drum.raw.slice(0, 44)) };
  let switchedOff = false, switchedSource = false;
  try {
    if (saved.tempoSource !== 1) {
      switchedSource = true;
      if (!(await setSystem('tempoSource', 1))) throw new Error('Could not switch Tempo Source to "Drumbeat tempo"');
    }
    if (saved.setsDrumbeat !== 0) {
      switchedOff = true;
      if (!(await setSystem('presetSetsDmbt', 0))) throw new Error('Could not switch off "Preset Sets Drumbeat"');
    }
    return await fn({
      exact: true,
      setTempo: async bpm => {
        midi.send(buildSingleParam(1, 8, Math.max(30, Math.min(250, bpm | 0))));
        await sleep(100);
      },
    });
  } finally {
    if (switchedOff) await setSystem('presetSetsDmbt', saved.setsDrumbeat);
    if (switchedSource) {
      await setSystem('tempoSource', saved.tempoSource);
      // With "Drumbeat tempo" the System tempo follows the drumbeat tempo we poked — put the user's value back
      const now = await ask('sysex:system', buildRequestSystem());
      if (now && now.raw[2] !== saved.systemTempo) await setSystem('globalTempo', saved.systemTempo);
    }
    // Selecting the old preset loads its assigned drumbeat again while "Preset Sets Drumbeat" is on —
    // so reselect first, then put the drumbeat that was active (and its edit buffer) back
    if (reselect) { midi.send(buildSelectPreset(saved.preset)); await sleep(300); }
    midi.send(buildSelectDrumbeat(saved.drumbeatNumber)); await sleep(200);
    midi.send(buildSendDrumbeatEditBuf(saved.drumbeat)); await sleep(150);
  }
}
