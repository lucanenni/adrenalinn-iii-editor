/**
 * AdrenaLinn III SysEx Engine
 * Based on MIDI Implementation v3.0.0
 */

// ── Manufacturer & Product IDs ─────────────────────────────────────────────
export const RLD_ID = [0x00, 0x01, 0x37];
export const PRODUCT_ID = 0x03;
export const FILE_VERSION = 0x01;

// ── Message IDs ────────────────────────────────────────────────────────────
export const MSG = {
  RECEIVE_SINGLE_PARAM:     0x01,
  SEND_RECV_PRESET:         0x02,
  SEND_RECV_DRUMBEAT:       0x03,
  REQUEST_PRESET:           0x05,
  REQUEST_DRUMBEAT:         0x06,
  SELECT_DRUMBEAT:          0x08,
  SELECT_PRESET:            0x09,
  REQUEST_PRESET_EDITBUF:   0x0A,
  SEND_RECV_PRESET_EDITBUF: 0x0B,
  REQUEST_DB_EDITBUF:       0x0C,
  SEND_RECV_DB_EDITBUF:     0x0D,
  REQUEST_SYSTEM:           0x0E,
  SEND_RECV_SYSTEM:         0x0F,
  SAVE_COMPLETE:            0x11,
  FACTORY_INIT:             0x13,
};

// ── SysEx header builder ────────────────────────────────────────────────────
function header(msgId) {
  return [0xF0, ...RLD_ID, PRODUCT_ID, FILE_VERSION, msgId];
}

// ── Identity Request (Universal SysEx) ─────────────────────────────────────
export function buildIdentityRequest() {
  return Uint8Array.from([0xF0, 0x7E, 0x00, 0x06, 0x01, 0xF7]);
}

// ── Identity Reply (Universal SysEx) ────────────────────────────────────────
// Spec layout: F0 7E <ch> 06 02 00 01 37 01 00 03 00 <v1> <v2> <v3> 00 F7
// (the 06 "inquiry" byte is at index 3). Index 4 is tolerated as well in case a
// unit inserts an extra byte, so detection doesn't depend on that one detail.
// Returns { version } for an AdrenaLinn III, null for anything else.
export function parseIdentityReply(b) {
  if (b[0] !== 0xF0 || b[1] !== 0x7E) return null;
  for (const o of [3, 4]) {
    if (b[o] === 0x06 && b[o + 1] === 0x02 &&
        b[o + 2] === RLD_ID[0] && b[o + 3] === RLD_ID[1] && b[o + 4] === RLD_ID[2] &&
        b[o + 7] === PRODUCT_ID && b[o + 8] === 0x00) {
      const digits = [b[o + 9], b[o + 10], b[o + 11]];
      const version = digits.every(c => c >= 0x20 && c < 0x7F) ? String.fromCharCode(...digits) : '?';
      return { version };
    }
  }
  return null;
}

// ── Single Parameter ────────────────────────────────────────────────────────
/**
 * @param {0|1|2} buffer  0=preset, 1=drumbeat, 2=system
 * @param {number} address  parameter address
 * @param {number} value    0-255
 */
export function buildSingleParam(buffer, address, value) {
  return Uint8Array.from([
    ...header(MSG.RECEIVE_SINGLE_PARAM),
    buffer & 0x03,
    address & 0x3F,
    value & 0x0F,
    (value >> 4) & 0x0F,
    0xF7,
  ]);
}

// ── Request Preset / Drumbeat ───────────────────────────────────────────────
export function buildRequestPreset(number) {
  return Uint8Array.from([
    ...header(MSG.REQUEST_PRESET),
    number & 0x0F,
    (number >> 4) & 0x0F,
    0xF7,
  ]);
}

export function buildRequestDrumbeat(number) {
  return Uint8Array.from([
    ...header(MSG.REQUEST_DRUMBEAT),
    number & 0x0F,
    (number >> 4) & 0x0F,
    0xF7,
  ]);
}

export function buildRequestPresetEditBuf() {
  return Uint8Array.from([...header(MSG.REQUEST_PRESET_EDITBUF), 0xF7]);
}

export function buildRequestSystem() {
  return Uint8Array.from([...header(MSG.REQUEST_SYSTEM), 0xF7]);
}

// Initialize to Factory Status (ID 19): overwrites ALL 200 presets and 200
// drumbeats with factory data and resets System parameters. The spec table shows
// no File Version byte for this message, but the real pedal IGNORES it that way
// (verified on hardware) and obeys F0 00 01 37 03 01 13 F7 — like Save Complete,
// the spec omits a byte the device uses. The pedal sends no Save Complete after it.
export function buildFactoryInit() {
  return Uint8Array.from([...header(MSG.FACTORY_INIT), 0xF7]);
}

// ── Select Preset / Drumbeat ────────────────────────────────────────────────
export function buildSelectPreset(number) {
  return Uint8Array.from([
    ...header(MSG.SELECT_PRESET),
    number & 0x0F,
    (number >> 4) & 0x0F,
    0xF7,
  ]);
}

export function buildSelectDrumbeat(number) {
  return Uint8Array.from([
    ...header(MSG.SELECT_DRUMBEAT),
    number & 0x0F,
    (number >> 4) & 0x0F,
    0xF7,
  ]);
}

// ── 7-bit Data Packing / Unpacking ──────────────────────────────────────────
/**
 * Pack raw bytes into 7-bit MIDI SysEx format.
 * Groups of 7 bytes → 8 MIDI bytes (MS bits packed first).
 */
export function pack7bit(data) {
  const out = [];
  for (let i = 0; i < data.length; i += 7) {
    const chunk = data.slice(i, i + 7);
    let msByte = 0;
    for (let j = 0; j < chunk.length; j++) {
      if (chunk[j] & 0x80) msByte |= (1 << j);
    }
    out.push(msByte);
    for (const b of chunk) out.push(b & 0x7F);
  }
  return out;
}

/**
 * Unpack 7-bit MIDI SysEx data back to raw bytes.
 */
export function unpack7bit(data) {
  const out = [];
  for (let i = 0; i < data.length; i += 8) {
    const msByte = data[i];
    const chunk = data.slice(i + 1, i + 8);
    for (let j = 0; j < chunk.length; j++) {
      out.push(chunk[j] | ((msByte >> j) & 1) << 7);
    }
  }
  return out;
}

// ── Build Preset SysEx from raw 64-byte array ───────────────────────────────
export function buildSendPreset(rawBytes) {
  const packed = pack7bit(rawBytes);
  return Uint8Array.from([...header(MSG.SEND_RECV_PRESET), ...packed, 0xF7]);
}

// Send Drumbeat (ID 3): overwrites the drumbeat currently selected on the device.
export function buildSendDrumbeat(rawBytes) {
  const packed = pack7bit(rawBytes);
  return Uint8Array.from([...header(MSG.SEND_RECV_DRUMBEAT), ...packed, 0xF7]);
}

export function buildSendPresetEditBuf(rawBytes) {
  const packed = pack7bit(rawBytes);
  return Uint8Array.from([...header(MSG.SEND_RECV_PRESET_EDITBUF), ...packed, 0xF7]);
}

// ── Parse incoming SysEx ────────────────────────────────────────────────────
/**
 * Returns { type, data } or null if not a valid AdrenaLinn III message.
 */
export function parseSysEx(bytes) {
  // Identity Reply (only ours — other devices' replies are not ours to handle)
  if (bytes[0] === 0xF0 && bytes[1] === 0x7E) {
    const id = parseIdentityReply(bytes);
    return id ? { type: 'identity', raw: bytes, version: id.version } : null;
  }

  // Must start F0, then RLD IDs, then product ID
  if (
    bytes[0] !== 0xF0 ||
    bytes[1] !== RLD_ID[0] ||
    bytes[2] !== RLD_ID[1] ||
    bytes[3] !== RLD_ID[2] ||
    bytes[4] !== PRODUCT_ID
  ) return null;

  // Save Complete (ID 17) and Factory Init (ID 19) have no File Version byte
  // in the spec (F0 00 01 37 03 <id> F7), so the ID sits at bytes[5]; tolerate a
  // File Version byte too (<id> at bytes[6]) rather than assume either layout.
  // Every other device→host message carries a payload (> 8 bytes), ID at [6].
  const msgId = bytes.length <= 8 ? bytes[bytes.length - 2] : bytes[6];

  switch (msgId) {
    case MSG.SEND_RECV_PRESET:
    case MSG.SEND_RECV_PRESET_EDITBUF: {
      const packed = Array.from(bytes.slice(7, bytes.length - 1));
      const raw = unpack7bit(packed);
      return { type: msgId === MSG.SEND_RECV_PRESET ? 'preset' : 'presetEditBuf', raw };
    }
    case MSG.SEND_RECV_DRUMBEAT:
    case MSG.SEND_RECV_DB_EDITBUF: {
      const packed = Array.from(bytes.slice(7, bytes.length - 1));
      const raw = unpack7bit(packed);
      return { type: msgId === MSG.SEND_RECV_DRUMBEAT ? 'drumbeat' : 'drumbeatEditBuf', raw };
    }
    case MSG.SEND_RECV_SYSTEM: {
      const packed = Array.from(bytes.slice(7, bytes.length - 1));
      const raw = unpack7bit(packed);
      return { type: 'system', raw };
    }
    case MSG.SAVE_COMPLETE:
      return { type: 'saveComplete' };
    default:
      return { type: 'unknown', msgId, raw: bytes };
  }
}

// ── MIDI CC helpers ─────────────────────────────────────────────────────────
export function buildCC(channel, cc, value) {
  return Uint8Array.from([0xB0 | (channel - 1), cc & 0x7F, value & 0x7F]);
}

export function buildProgramChange(channel, program) {
  return Uint8Array.from([0xC0 | (channel - 1), program & 0x7F]);
}
