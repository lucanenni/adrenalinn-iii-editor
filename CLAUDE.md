# AdrenaLinn III Web Editor — Claude Code Context

## Project description
A complete web editor for the AdrenaLinn III effects processor by Roger Linn Design.
Bidirectional communication via the Web MIDI API (SysEx), real-time preset/drumbeat
editing, a local library with bulk dump, and JSON backups.

## Tech stack
- **Language**: Plain JavaScript ES Modules — ZERO bundler, ZERO framework, ZERO npm dependencies
- **Browser runtime**: Chrome or Edge (Web MIDI API with SysEx requires these browsers)
- **Local storage**: IndexedDB (preset/drumbeat library)
- **Run**: `npx serve .` or `python3 -m http.server 8080`
- **Entry point**: `index.html` (one page)

## File structure
```
adrenalinn-editor/
├── index.html              # Main editor (4 tabs: PRESET cards, DRUMBEAT, LIBRARY, SYSTEM; lazy mount)
├── sw.js                   # Service Worker — offline app-shell cache (hand-maintained file list)
├── manifest.json           # PWA manifest
├── icon.svg                # App icon referenced by manifest.json
├── self-test.html          # Round-trip data test — see "Data round-trip self-test" below
└── src/
    ├── midi/               # MIDI layer — zero UI dependencies
    │   ├── sysex.js        # SysEx builders + pack7bit/unpack7bit
    │   ├── midiManager.js  # Web MIDI API, EventTarget router
    │   ├── presetData.js   # 64-byte preset structure
    │   ├── drumbeatData.js # 44-byte drumbeat structure
    │   ├── systemData.js   # System parameters field table (46 bytes), parse/clamp, single-param builder
    │   ├── syxFile.js      # .syx helpers (pure): splitSysEx, buildSyxFile, readSyxFile, buildDumpSyx (all 200 slots in order), formatBytes (hex / 0x / decimal text)
    │   └── famousPresets.js # famous-song presets (data only)
    ├── store/              # Reactive state management (EventTarget)
    │   ├── presetStore.js
    │   ├── drumbeatStore.js
    │   ├── libraryStore.js # IndexedDB + bulk dump engine
    │   └── systemStore.js  # System parameters (buffer 2) + Factory Init
    └── components/         # UI panels (lazy mount via activateTab())
        ├── Knob.js
        ├── ModFxPanel.js
        ├── AmpPanel.js
        ├── DelayReverbPanel.js
        ├── SequenceEditor.js   # 32-step canvas
        ├── SequencerGrid.js    # 32×4 drumbeat grid
        ├── DrumbeatPanel.js
        ├── PedalAssignPanel.js # PRESET card: expression pedals 1/2 only
        ├── SystemPanel.js      # System parameters tab + Factory Init
        ├── PresetMetaPanel.js  # PRESET card: Tempo, Drumbeat (+ Edit drumbeat button), Effect Switch
        ├── PresetBrowser.js    # 200-slot library (+ ⭐ Famous mode, dump .syx)
        ├── FamousPresetsPanel.js # famous-song list (Load / Load & push)
        └── SysexDialog.js      # `</> SysEx` header dialog: bytes of the current preset/drumbeat, copy / .syx
test/
├── roundtrip.mjs           # Shared round-trip check logic (imported by self-test.html AND run.mjs)
├── run.mjs                 # Node CLI entry point — `node test/run.mjs`
├── fakePedal.mjs           # A fake AdrenaLinn III that reproduces the quirks seen on real hardware (see its header)
├── device.mjs              # Store/write-session tests against the fake pedal — `node test/device.mjs` (~8 s)
├── check-html-scripts.mjs  # Extracts + node --check's index.html's inline <script type="module">
└── check-precache.mjs      # sw.js PRECACHE_URLS vs the files on disk
.github/workflows/checks.yml # CI: runs node --check on every src/**/*.js, the HTML script check, test/run.mjs and test/device.mjs
```

## Architectural rules — do NOT break these
1. **No bundler, no npm install** — import paths are always relative with an explicit `.js` extension
2. **Lazy mount is mandatory** — panels are only created on the first click of their tab, via `activateTab()`
3. **One page** — there are no standalone pages any more: the famous-song presets are the ⭐ Famous mode of the LIBRARY (`FamousPresetsPanel`, data in `src/midi/famousPresets.js`) and the old preset builder is the `</> SysEx` dialog (`SysexDialog`) that shows the bytes of what is in the editor
4. **SysEx 7-bit packing** — all data goes through `pack7bit()`/`unpack7bit()` in `sysex.js`; always verify the round-trip
5. **Single-param vs full buffer** — simple parameters use `buildSingleParam(buffer, addr, val)`; packed parameters (shared bytes) use `buildSendPresetEditBuf()` with a 25-30ms throttle
6. **Explicit `display:none`** — tab-content elements are shown/hidden via `el.style.display` in JS, not via a CSS `.active` class, to avoid components overwriting the hidden state
7. **Keep `sw.js`'s `PRECACHE_URLS` in sync** — it's a hand-maintained file list (no build step to generate it); add new `src/**/*.js` files to it and bump `CACHE_NAME` whenever it or any cached file changes, or clients will keep serving a stale offline copy

## AdrenaLinn III SysEx protocol
- **Manufacturer ID**: `00 01 37` (Roger Linn Design)
- **Product ID**: `03` (AdrenaLinn III)
- **File Version**: `01`
- **Preset edit buffer** (temporary, no flash write): ID `0x0B` — 7 header + 74 packed + 1 EOX = 82 bytes
- **Drumbeat edit buffer** (temporary): ID `0x0D` — 7 header + 51 packed + 1 EOX = 59 bytes
- **Save to slot** (writes flash): ID `0x02` (preset), `0x03` (drumbeat)
- **Request edit buffer**: ID `0x0A` (preset), `0x0C` (drumbeat)
- **Request slot**: ID `0x05` (preset), `0x06` (drumbeat)
- **Save Complete** (device → host): ID `0x11` — the spec shows NO File Version byte, but the real pedal sends `F0 00 01 37 03 01 11 F7` (with it, observed 2026-10-03); `parseSysEx` takes the ID from `bytes[len-2]` for messages ≤ 8 bytes so both layouts work
- **Factory Init**: ID `0x13` — the spec table shows no File Version byte, but the pedal **ignores** that frame and obeys `F0 00 01 37 03 01 13 F7` (verified on hardware: system params, slots and active preset/drumbeat all reset; no Save Complete is sent). Overwrites all 200 presets + 200 drumbeats + System params; active preset/drumbeat become 0/0
- **System parameters**: 46 addressable bytes via Single Param buffer 2. The spec documents the ID `0x0F` dump as 14 bytes, but a real device sends all 46 (confirmed on hardware, 2026-10-02), so every field is readable
- **Single param**: ID `0x01`, buffer 0=preset/1=drumbeat/2=system

## Data structures
- **Preset**: 64 raw bytes (bytes 0-31 parameters, 32-63 sequence steps, 32×1 byte)
- **Drumbeat**: 44 raw bytes (bytes 0-11 parameters, 12-43 steps, 32×1 byte)
- All multi-nibble values are little-endian (LS nibble first in SysEx slot requests)

## Packed byte encoding (preset)
| Byte | Content |
|------|-----------|
| b[3] | hi-nibble=filterType, lo-nibble=stereo/10 |
| b[8] | hi-nibble=lfoWave, lo-nibble=modSource |
| b[9] | bits 0-4=on/off flags (mod/amp/compr/delay/reverb), bits 6-7=fxOrder |
| b[16]| hi-nibble=postTreble/10, lo-nibble=comprVolume/10 |
| b[18]| hi-nibble=(ampBoost/10)-1, lo-nibble=comprDrive/10 |
| b[22]| hi-nibble=delayTreble/10, lo-nibble=delayStereo/10 |
| b[24]| hi-nibble=reverbTreble/10, lo-nibble=reverbTime |

## Useful commands
```bash
# Start the local server
npx serve .
# or
python3 -m http.server 8080

# Open the editor (requires Chrome or Edge)
open http://localhost:8080

# Check a module's JS syntax
node --check src/midi/sysex.js
node --check src/store/presetStore.js

# Extract the inline script from an HTML file and check it
node --input-type=module --eval "
import { readFileSync, writeFileSync } from 'fs';
const h = readFileSync('index.html','utf8');
const m = h.match(/<script type=\"module\">([\s\S]*?)<\/script>/);
writeFileSync('/tmp/check.mjs', m[1]);
"
node --check /tmp/check.mjs
```

## Data round-trip self-test
`self-test.html` independently re-derives the expected value for every packed
byte/nibble in `presetData.js` and `drumbeatData.js` (the shared `test/roundtrip.mjs`, 415 checks in total now) and compares
it against what `parsePreset`/`serializePreset`/`parseDrumbeat`/`serializeDrumbeat`
actually produce — open it over the local server after touching either file.
It already caught two real issues once: the `ampBoost` parsing bug (see below)
and `defaultDrumbeat()` shipping a `trebleDistValue: 90` that silently didn't
survive a round-trip while `trebleDistMode` was `'off'` (fixed to `0`, since
byte 2 is always 0 in that mode regardless of the value field).

## Known bugs and fixes applied
- **Template literal with a hex alpha suffix**: `` `color${val}88` `` crashes some parsers — use string concatenation instead: `'color' + val + '88'`
- **Duplicate `display:none`**: `#editorWrap` had `display:none` written twice in the HTML — keep only one
- **`min-height:0` is required**: any flex container that needs to propagate height down to a canvas `ResizeObserver` must have `min-height:0`
- **Lazy mount is critical**: panels that set `this.container.style.display='flex'` overwrite the parent's `display:none` — the only fix is lazy mounting
- **Real-time MIDI bytes (Clock/Start/Stop) were never recognized**: `midiManager.js`'s incoming-message switch masked the status byte with `& 0xF0` before comparing against `0xF8`/`0xFA`/`0xFC` — but those bytes have no channel nibble, so the mask collapsed all of them to `0xF0` and the cases could never match. Fixed by intercepting single-byte real-time messages (`data.length===1 && data[0]>=0xF8`) before the mask, which also fixes them being spliced into an in-progress SysEx buffer if they arrive mid-transfer
- **Bulk dump clobbering the live edit buffer**: `libraryStore`'s per-slot dump replies routed through the same `loadRaw()` as manual loads, silently overwriting unsaved edits — fixed with `presetStore.setAutoLoadSuspended()`/`drumbeatStore.setAutoLoadSuspended()`, toggled around a dump
- **SequenceEditor bypassing undo/redo**: step edits mutated `presetStore` internals directly instead of calling `set()` — fixed by routing through `presetStore.set(field, value, {send:false})` (the `send` option lets a caller suppress the throttled full-buffer resend when it's about to send the change itself via a cheaper single-param message)
- **Sequence canvas editable when inactive**: the Sequence tab stayed fully interactive even when the active Mod Effect wasn't TSE/FSE/ARP, so edits/sends had no effect on the device — fixed by disabling the canvas (`pointer-events:none`) and toolbar buttons unless a sequence effect is active
- **`requestSlot()` replies always tagged `slot:null`**: broke the Library's auto-cache-on-fetch — fixed by tracking `_pendingSlot` on the store, consumed by the next matching SysEx reply
- **Fetch racing a bulk dump**: a single-slot Fetch could arrive indistinguishable from the dump's own next expected reply — fixed by disabling per-row Fetch buttons while `libraryStore.dumpActive`
- **`serializePreset()` truncating instead of rounding**: several packed nibble fields (e.g. `postTreble`, `ampBoost`) divided without `Math.round()`, diverging from the independent encoders in `preset-builder.html`/`famous-presets.html` for non-multiple-of-10 values — fixed to round consistently everywhere
- **`decodeSV()` flooring a genuine `sound:0` to `1`**: broke round-tripping a factory all-zero "Blank" drumbeat slot — removed the floor (the encoder already preserves `0` via `??`)
- **Drumbeat playhead cursor using the wrong step map**: `SequencerGrid` compared the clock-driven `playingStep` (a logical "Nth active step" index) directly against physical 0-31 grid columns, so the cursor visited the wrong cells for any timebase other than 1/16 — fixed by adding `physicalStepIndex()` to `drumbeatData.js` (the counterpart to the previously-unused `activeStepCount()`) and mapping through it before highlighting
- **Save Complete never recognized**: `parseSysEx` read the message ID at `bytes[6]`, but Save Complete has no File Version byte, so the ID is at `bytes[5]` and `bytes[6]` is `0xF7` — `saveComplete` never fired and `saveToSlot()` always ran into its 3 s timeout. Fixed in `parseSysEx` (see above)
- **`on()` unsubscribe was a no-op**: `presetStore`/`drumbeatStore`/`libraryStore`/`midiManager` registered a wrapper listener but removed the original `fn`, so the returned unsubscribe function never removed anything — now removes the wrapper
- **Filter Type wrote indices instead of raw values, and mis-grouped effects**: the Filter knob stored its own 0..N index, so on flanger-type effects FLA/FLI/VIB/VOL were written as 1-4 instead of the spec's 6/7/8/9; `FLANGER_EFFECTS` also omitted Arpeggiator and Talk Box. Per the spec + manual the valid raw values per effect are: 1-5 (LP2 LP4 BNP NOT HIP) for FTR/RFI/FSE/AFI/PDL/FFI, 6-7 (FLA FLI) for FCH/RFL/ARP/TAL/FFL, 8 (VIB) for Vibrato, 9 (VOL) for TRE/TSE/VOL/PAN, none documented for ROT/SFI. `presetData.js` now has `filterTypeOptions(modEffect)` + `FILTER_TYPE_LABELS`; `ModFxPanel` maps knob index ↔ raw value, coerces to the first valid option only when the *user* switches effect, and never rewrites a value that was merely loaded from a preset. `defaultPreset().filterType` is 9 (TRE's only option) instead of 1
- **Speed knob range**: max was 118; the spec says 0-99 plus 100-115 (16 tempo-synced rates) — Delay Time is the one that goes to 118. Fixed in `ModFxPanel` and `preset-builder.html`
- **Identity Reply parsed one byte off**: the 06 02 "inquiry reply" bytes sit at indices 3-4 (`F0 7E <ch> 06 02 …`, MIDI Implementation p. 2) but `parseSysEx`, `midiManager._probePort` and both standalone pages looked for them at 4-5 (and read the version at 14-16 instead of 12-14), so Auto-detect could never match a spec-conforming reply. All four now share `parseIdentityReply()` in `sysex.js` (tolerates one extra byte after `F0 7E`, checks manufacturer + product ID)
- **Unplugging the cable went unnoticed**: `portChange` only refreshed the port list, so `midi.connected` stayed true and transfers kept sending into a dead port. `midiManager` now drops the connection on a `disconnected` state change (`connectionChange` carries `reason: 'lost' | 'user'`), `libraryStore` cancels a running dump/restore, and the same ports coming back auto-reconnect (only if the user never pressed Disconnect)
- **Writing a preset stamps the current drumbeat tempo into it** (hardware, 2026-10-03): when a preset (ID 2) is written to a slot the pedal replaces byte 30 (Preset Tempo) with the *current drumbeat tempo*, and selecting a slot first loads its assigned drumbeat while "Preset Sets Drumbeat" is on. A plain select+send therefore silently changed the tempo of every restored/saved preset (Restore of 5 slots changed them all from 100 to 110; Save to Slot ignored the editor's Tempo). `src/store/writeSession.js` `withPresetTempoControl()` switches "Preset Sets Drumbeat" off, puts the wanted tempo into the drumbeat edit buffer before each write, then restores the flag, the drumbeat edit buffer and (Restore) the active preset. What the pedal stamps depends on Tempo Source (hardware): Drumbeat tempo → the drumbeat edit buffer's tempo; System tempo → the System tempo; Preset tempo → the tempo the slot already had (the data's own tempo is ignored in the last two). So the session also switches Tempo Source to "Drumbeat tempo" while it runs and puts it back — plus the System tempo, which then follows the drumbeat's. Verified on hardware for all three sources (100 and 150 stored exactly, settings put back). After the fix a 10-slot Restore and a Save to Slot are byte-exact
- **The pedal changes more than the byte it is sent**: a single-param write to a Mod FX / Amp / Delay / Reverb parameter switches that block ON, and a new Mod Effect or Variation reloads that effect's defaults (Depth, Mod Source, Mod Volume, Filter/Stereo). Pedals, Effect Switch, tempo and drumbeat params and everything in the drumbeat buffer have no side effects; a full edit-buffer send (ID 0x0B) is echoed exactly. `presetStore` now reads the edit buffer back 400 ms after the last edit and adopts it (`_scheduleDeviceSync` / `adoptDeviceState`: no change to dirty flag, undo history, revert baseline or slot number; ignored if the user edited again meanwhile). `ModFxPanel` no longer coerces Filter Type itself when a pedal is connected — it adopts the pedal's choice
- **Preset byte 9 bit 5** is "always 0" in the spec but set in factory preset 104; kept as `reservedBit5` so a resend doesn't clear it (all 200 factory presets and 200 drumbeats now round-trip byte-exactly)
- **Device facts** (hardware): a drumbeat's single-param writes (volume, FX send, timebase, tempo, steps) and full resend are exact; the pedal accepts any Filter Type 0-9 regardless of effect and applies the raw value as the type it names (measured with generated audio: 1 LP2, 2 LP4, 3 band-pass, 4 notch, 5 high-pass, 6 FLA, 7 FLI with a bass cut, 8 VIB pitch modulation, 9 VOL volume modulation, 0 none) — so the per-effect table is the manual's intended pairing, not a validator (3 factory presets use other combinations: FCH=4 ×2, PDL=7; the manual says the options also depend on the Variation); System bytes 17-31 read 0xFF; after a power cycle System parameters and slots written by Restore/Save are still there, but a preset/drumbeat selected over SysEx and the edit buffer are not (the pedal boots on its previous active preset, here 199/0) and the System tempo follows the booted drumbeat; Sync has four values — 0 `---`, 1 `in`, 2 `out`, 3 `in-out` (the MIDI doc lists only three and calls 2 "in+out"): with 2 or 3 the pedal sends MIDI Clock continuously (24 ppq, 89 clocks in 2 s at 110 BPM); only 3 follows a clock sent to it (re-emitted at ~157 BPM for our 150 BPM clock), 2 keeps its own tempo, plus Start/Stop events when a drumbeat starts/stops; a 200-slot dump takes ~1.1 s/slot; Save Complete arrives ~1.7 s after a preset write
- **Pedal source defaults are CC4 / CC11, not 27 / 32**: the MIDI Implementation doc says 27/32, but the User's Manual ("Pedal 1 Source … controller 4, Pedal 2 … controller 11") and a real pedal (reads 4 and 11) agree on CC4/CC11. The original code was right; an earlier "fix" to 27/32 was wrong and has been reverted (`systemData.js`). Lesson: the MIDI doc has errors (this, the 14-byte System dump) — check the manual and the hardware before trusting it
- **Drumbeat "unused" bytes 9-11 were zeroed on every resend**: a real device holds 16, 32, 16 there (round-trip of a real drumbeat differed in exactly those 3 bytes). `parseDrumbeat` now keeps them in `unused` and `serializeDrumbeat` writes them back. (Preset round-trip of real data: 0 differing bytes. System bytes 17-31 read 0xFF; they are never written, we only use single-param writes)
- **ALL-tab listener leak**: `_mountPanel`'s `case 'all':` branch never assigned to `PANELS.all`, so the lazy-mount guard never triggered and `buildAllParamsPanel()` re-ran on every tab revisit, stacking a fresh un-unsubscribed `presetStore.on('change', ...)` listener each time — fixed by setting `PANELS.all = true` before building

## Implemented improvements (high priority)
- [x] `presetStore.saveToSlot(slot)` — saves to flash and waits for Save Complete (Promise, 3s timeout)
- [x] `presetStore.requestSlot(slot)` — requests a specific slot via ID `0x05`
- [x] Drumbeat bulk dump in `PresetBrowser` — separate "Dump Drumbeats" button
- [x] `_fetchSlot` uses `buildRequestPreset/Drumbeat` directly instead of select+request
- [x] "Save to Slot" dialog in `index.html` with slot preview, status, and library auto-cache
- [x] MIDI Clock display in the topbar (`S.XX` during playback)

## Implemented improvements (medium priority)
- [x] **Preset name field** — local `{slot → name}` dictionary in IndexedDB (`presetNames`/`drumbeatNames` object stores, `DB_VERSION=2`), editable column in `PresetBrowser`, name field in the "Save to Slot" dialog, included in JSON export/import
- [x] **A/B comparison** — `presetStore.copyToB()`/`swapAB()`, A/B side badge in the topbar, "📋→B" / "⇄ A/B" buttons
- [x] **Undo/Redo** — 20-state history debounced per field in `presetStore` (`undo()`/`redo()`), ↶/↷ buttons and `Ctrl+Z`/`Ctrl+Y`/`Ctrl+Shift+Z`
- [x] **Copy preset slot→slot** — `libraryStore.copyPreset/copyDrumbeat` (local copy, name included) + "⧉ Copy" button in `PresetBrowser`

## Implemented improvements (low priority)
- [x] **Dark/Light mode** — `:root[data-theme="light"]` override block + 🌙/☀️ toggle button in the header, `localStorage` key `al3-theme`, early inline script to avoid a flash of the wrong theme
- [x] **Keyboard shortcuts** (`index.html` only) — `Ctrl+S` sends the preset (clicks `btnSendPreset`); `Space` toggles sending MIDI Start (`0xFA`)/Stop (`0xFC`) to the device via a new `▶ Start`/`⏹ Stop` button in the sidebar; with a tab focused, `←`/`→`/`Home`/`End` move between tabs (ARIA tablist; `Enter`/`Space` activate). `Tab` is never intercepted — an earlier version hijacked it whenever nothing was focused, which made every control unreachable by keyboard
- [x] **Cross-parameter range validation** — fixed concrete, verifiable latent bugs rather than adding speculative hardware-behavior warnings:
  - `presetData.js` `ampBoost` parsing had an operator-precedence bug (`& 0x0F + 1` parsed as `& (0x0F+1)`) that always produced 0, so every pulled/imported preset displayed Boost as 10 regardless of the real device value — fixed to `((b[18]>>4) & 0x0F) + 1`
  - `ModFxPanel`'s Filter Type knob always showed the `FILTER_TYPES_FILTER` label set (LP2/LP4/BNP/NOT/HIP) even for flanger-family effects, where the device's own `FILTER_TYPES_FLANGER` set (FLA/FLI/VIB/VOL) applies — that second array existed but was never wired up; `_onEffectChange` now swaps `Knob.setEnumValues()` based on `modEffect`, and persists the clamped value to `presetStore` (previously a `variation`/`filterType` range clamp on effect switch only updated the knob display, not the stored preset)
  - `DelayReverbPanel`'s Delay Time knob showed a bare integer (e.g. `83`) instead of a musical label (`8n`, `240ms`) — two independently-authored, unused label arrays (`DELAY_LABELS` in ModFxPanel.js, `DELAY_TIME_LABELS` in DelayReverbPanel.js) existed for this; added `Knob` `valueLabels` support and wired the surviving array in
  - `PedalAssignPanel`'s pedal Amount knob stayed draggable while "Scale mode" was on, visually moving without persisting (the write was silently dropped) — added `Knob.setEnabled()` and disabled the knob while SCA is active
  - Removed dead code found along the way: unused `PEDAL_DESTS` import (`DelayReverbPanel.js`, `PedalAssignPanel.js`), unused `TIMEBASES`/`activeStepCount` import (`SequencerGrid.js`)
- [x] **Famous presets** — `src/midi/famousPresets.js` (data only: 4 songs / 6 presets — John Mayer and Green Day only, ALL real factory presets, `kind` always `factory`.) shown by `FamousPresetsPanel` as the ⭐ Famous mode of the LIBRARY. Per preset: ✏ Load (preset + its drumbeat into the editor), ⬆ Send live (both edit buffers, nothing saved), 💾 Write to slot… (loads it and clicks the editor's Save Slot — tested write path, name prefilled; only the preset is written), `</> SysEx` (`window._openSysexDialog({title, preset, drumbeat})` — fixed-source mode of `SysexDialog`, does not touch the editor). Live/write buttons only exist while connected (the panel re-renders on `connectionChange`). Each preset stores `raw` (64 bytes: the factory preset + the FAQ's tempo/drumbeat), `drumbeat` (44 bytes of the factory drumbeat), `base: {slot, name, changes[]}`, `drumbeatSlot`/`drumbeatName` — so it can be written from scratch even if the pedal's factory slots were edited. **Sources**: the AdrenaLinn III FAQ (`rogerlinndesign.com/support/support-adrenalinn-faqs`, panel 2): Heartbreak Warfare riff = preset 82 + drumbeat 28 + 97 BPM, solo = preset 51; I Don't Trust Myself = presets 73 (pulsing filter) and 160 (auto-wah) + drumbeat 1 + 84 BPM; Bigger Than My Body = preset 150. The official **Preset & Drumbeat Listing** (Presets & Drumbeats manual PDF, a scanned/image PDF — read it page by page) names preset 140 "Boulevard of Broken Dreams" (how-to chords Em G D A) and 150 "Bigger Than My Body", and gives all factory preset and drumbeat names (e.g. 73 "1/8 Note Filter Tremolo", 82 "Ping-Pong Filter Spikes", 51 "Octave Fuzz", 160 "Auto Wah"; drumbeats #1 "Basic Boom Chik Ba-Boom Chik beat", #20 "Purple Haze", #28 "Basic beat with Tambourine"). **Do NOT use the AdrenaLinn II FAQ page (`support-adrenalinn-2-faqs`)** — its numbers (F43, F82, AM4…) are for older models. There are no standalone `famous-presets.html` / `preset-builder.html` pages any more: the list lives in the LIBRARY and the builder's output is the `</> SysEx` dialog
- [x] **Service Worker / PWA** — `sw.js` (stale-while-revalidate, hand-maintained `PRECACHE_URLS`; `test/check-precache.mjs` fails CI if a module is missing from it or a listed file doesn't exist), `manifest.json` + `icon.svg` for installability. This does not remove the need for an HTTP server on the *first* load — Web MIDI and ES modules both require a secure context (http(s)/localhost), never `file://` — it removes the need for that server to still be running on *later* loads

## Implemented improvements (system)
- [x] **System Parameters tab** — `systemData.js` (field table from the spec, `parseSystem`, `clampSystemValue`, `buildSystemParam`), `systemStore.js`, `SystemPanel.js`. Controls write via Single Parameter buffer 2 and read from the full 46-byte dump; a field the device didn't report (short 14-byte dumps) shows "—" instead of an invented default. Foot switch assignments (bytes 32-45) are labelled selects over `FOOT_DESTINATIONS` (57 entries, manual order; the value is the position in the list — all 14 factory defaults confirmed on hardware, plus raw 22 = BMC and 38 = BYP on the pedal's display; 39-56 rely on the same list). A device value outside the list is shown as `#n`, never as something else. Requested automatically on connect.
- [x] **Factory Init** — behind a `window.prompt` that requires typing `FACTORY`; sent WITH the File Version byte; the pedal sends no Save Complete, so `systemStore.factoryInit()` waits 2.5 s (a Save Complete would end it early) then re-reads System params, the preset edit buffer and the drumbeat edit buffer. Verified on hardware: after it the whole memory matched the factory content (the only slot that differed from the pre-reset backup was 199's Preset Tempo, 110 → factory 100)
- [x] **Restore to Device** — `libraryStore.startRestore(type, from, to)`: per cached slot, select it, send the full preset/drumbeat message (ID 2/3), then wait for the device's real Save Complete (3 s timeout); stops at the first unconfirmed slot instead of blasting the rest; `cancelRestore()` takes effect before the next slot. Mutually exclusive with bulk dump via `libraryStore.busy`. UI: "Restore to Device" (typed `RESTORE` confirmation) and per-row "Write" (confirm) in `PresetBrowser`
- [x] **.syx import/export per slot** — per-row "⬇ .syx" download; "Import .syx" accepts files with one or many preset/drumbeat messages (Send or Edit Buffer) and fills consecutive Library slots from a chosen start slot
- [x] **Dump files (.syx)** — LIBRARY buttons `⬆ Dump .syx` (current list) and `⬆ Dump .syx (all)` (200 presets then 200 drumbeats): `buildDumpSyx()` concatenates the Send (ID 2/3) messages of slots 0-199 in order. The messages carry no slot number, so slot N is the Nth message of its kind and the export is refused while any slot is missing from the Library (Dump first). Re-import with Import .syx (it picks the right kind from a mixed file); a generic SysEx player would write every message to the same slot, so restoring to the pedal goes through Restore to Device. JSON stays the complete backup (names, System params, edit buffers)
- [x] **`</> SysEx` dialog** (`SysexDialog.js`, lazy-imported by the header button) — the bytes of the current preset/drumbeat, following the editor live: Edit buffer (ID 0B/0D), Send (ID 02/03) or the raw 64/44 bytes, as spaced hex, continuous hex, `0x` array or decimal (`formatBytes`), Copy or Download (.syx / .bin). It replaces the old preset-builder page's output pane (offline editing is the editor's "Edit Offline")

- [x] **Identity + auto-connect** (`index.html`) — Identity Request is sent automatically after a manual Connect and after an auto-reconnect. With exactly one MIDI input and one output (page load or hot-plug) `tryAutoConnect()` connects and asks for the Identity; the connection is kept only if an AdrenaLinn III answers within 2 s, otherwise it is dropped (no SysEx is sent on to an unknown device). Pressing Disconnect suspends auto-connect until the user connects again. Software ports (IAC Driver, Midi Through, GS Wavetable, network sessions — `isVirtualPort`) don't count. With several real ports nothing is done automatically (use Auto-detect)
- [x] **Initial device sync** (`index.html` `syncFromDevice()`) — on the first Identity Reply of each connection: read System parameters, then the preset edit buffer, then the drumbeat edit buffer (sequential, each awaited, so replies can't interleave), so the editor opens on what the pedal is doing and the SYSTEM tab is populated without a manual Pull. The device's active slots (System bytes 0-1) are adopted as the slot numbers of those clean buffers via `adoptSlotNumber()`. Skipped (with a log line) if there are unsaved edits, so offline work is never overwritten. `setConnected(true)` also calls `showEditor()`, so a connected device always opens the editor even if a read fails
- [x] **Details names** — FX ORDER, MOD SRC, LFO WAVE and FILTER (always visible) show `CODE · Name` too (`FX_ORDER_NAMES`, `MOD_SOURCE_NAMES`, `LFO_WAVE_NAMES`, `FILTER_TYPE_NAMES` in `presetData.js`; `Knob.setEnumValues(values, names)` for the dynamic Filter list)
- [x] **Full effect/amp/effect-switch names** — `MOD_EFFECT_NAMES` / `AMP_MODEL_NAMES` / `EFFECT_SWITCH_NAMES` in `presetData.js` (same order as the 3-letter codes, from the manual; spot-checked by tests; `FOOT_DESTINATIONS` in `systemData.js` is built from `EFFECT_SWITCH_NAMES`). `Knob` has an optional `valueNames` for enum knobs: the select becomes wide (190px) and shows `CODE · Name`. Also shown in the Library (tooltip + search by name)
- [x] **PRESET card** — Tempo / Drumbeat / FX Switch live in `PresetMetaPanel`, not in the Delay/Reverb panel (they aren't delay/reverb settings)
- [x] **Opening tab** — the editor opens on PRESET (`_initialTabShown`); the connect-time drumbeat read no longer jumps to the Drumbeat tab (`_syncing`), only an explicit "Pull Drumbeat" does
- [x] **Tab structure** (`index.html`) — only four tabs: **PRESET**, **DRUMBEAT**, **LIBRARY**, **SYSTEM** (`activateTab`/`_mountPanel`; the ALL tab, the Assign tab and the Details / Cards switches no longer exist). PRESET shows every part of the single preset as collapsible `.card`s in a grid (`#tab-preset > .cards`, each panel mounted into its `#card-*` body: MOD FX, AMP, DELAY / REVERB, PRESET (`PresetMetaPanel`), EXPRESSION PEDALS (`PedalAssignPanel`), SEQUENCE — wide). Details are always visible (panels' `detailsMode` defaults to true). Card bodies get panel-set inline `cssText`, so the sequence height and the collapsed state use `!important` CSS. `grid-auto-rows:max-content` is required or rows shrink to the container height (cards are `overflow:hidden`). What used to be in ASSIGN: pedals → PRESET card; Source CC, foot switch assignments, CC test sender and quick reference → SYSTEM tab
- [x] **Edit drumbeat button** — in the PRESET card, next to the Drumbeat knob: opens the DRUMBEAT tab on the preset's assigned drumbeat (`presetDrumbeat`): from the device when connected (`drumbeatStore.requestSlot`), else from the Library, else a message; asks before discarding unsaved drumbeat edits; blocked during a dump/restore
- [x] **Keyboard / screen-reader access** — tabs are a tablist (`role=tab`, `aria-selected`, arrows), card titles are buttons (`aria-expanded`, Enter/Space), SVG knobs are sliders (`role=slider`, `aria-valuenow/text`; arrows ±step, PageUp/Down ±10 steps, Home/End), enum selects carry `aria-label`; a global `:focus-visible` ring
- [x] **Narrow screens** (`@media (max-width:820px)`) — header wraps, sidebar stacks *below* the editor (`order:-1` on the panel area), the page scrolls instead of inner panels, the tab bar scrolls horizontally; grid columns use `minmax(0,1fr)` (a plain `1fr`/`auto` column widened the layout to the header's max-content)
- [x] **Auto-reload on app update** — when a new Service Worker takes over (`CACHE_NAME` bumped) the page reloads once so it isn't left running the stale copy it was served from cache; skipped on first install and while there are unsaved edits (preset/drumbeat dirty)
- [x] **Fake pedal + device tests** (`test/fakePedal.mjs`, `test/device.mjs`, run in CI) — the hardware quirks (tempo stamping, auto-on blocks, effect defaults, File Version byte, no Save Complete after Factory Init, 46-byte System dump) are modelled in Node so they can't regress silently. It already caught a real bug in the resync code: a debounced device resync could fire in the middle of a Save to Slot / Restore, when the pedal's edit buffer is the slot just selected, and adopt the wrong preset into the editor — `writeSessionActive()` now blocks resync during write sessions

## Pending improvements (low priority)
_(none — all backlog items above are implemented; remaining work is the pre-production hardware checklist in [ARTIFACTS.md](ARTIFACTS.md))_

## Resources
- Official support page: https://www.rogerlinndesign.com/support/support-adrenalinn
- [MIDI Implementation](https://cdn.prod.website-files.com/5ad24a891dee8925107423d0/5e6955fd0f5a6069d69d92f8_adrenalinn_iii_midi_implementation%2C_8-1-07.pdf) — primary source for all SysEx messages
- [User's Manual](https://cdn.prod.website-files.com/5ad24a891dee8925107423d0/5e69542a4b96309cc90a9c12_adrenalinn-iii-users-manual%2C-v302%2C-5-14-08.pdf)
- [Presets & Drumbeats Manual](https://cdn.prod.website-files.com/5ad24a891dee8925107423d0/5e695429681006b84c9cc4f0_adrenalinn-iii-presets---drumbeats-manual%2C-11-25-07.pdf) — factory preset/drumbeat names and categories
- AdrenaLinn III FAQs: https://www.rogerlinndesign.com/support/support-adrenalinn-faqs (the `-2-` page is the AdrenaLinn II one: do not use it for preset numbers)
