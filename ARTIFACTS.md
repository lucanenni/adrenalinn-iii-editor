# Artifact Inventory — AdrenaLinn III Web Editor

This file tracks what has been produced for the project, its status,
and what's still open. For the current architecture and rules see
[CLAUDE.md](CLAUDE.md); for setup and features see [README.md](README.md).

---

## Project files

### Entry points (3 HTML pages)

| File | Status | Notes |
|------|--------|------|
| `index.html` | ✅ Complete | Main editor, 4 tabs (PRESET cards, DRUMBEAT, LIBRARY, SYSTEM), lazy mount |
| `src/midi/famousPresets.js` + `FamousPresetsPanel.js` | ✅ Complete | 4 songs / 6 presets (John Mayer and Green Day; real factory presets from the III FAQ and the official listing), shown as ⭐ Famous in the LIBRARY (replaces `famous-presets.html`) |
| `SysexDialog.js` | ✅ Complete | `</> SysEx` dialog: bytes of the current preset/drumbeat, copy / .syx (replaces `preset-builder.html`) |

### MIDI layer (`src/midi/`)

| File | Status | Notes |
|------|--------|------|
| `sysex.js` | ✅ Complete | All SysEx builders: ID `0x01`→`0x13` + `pack7bit`/`unpack7bit` |
| `midiManager.js` | ✅ Complete | Web MIDI API, EventTarget router, auto-detect, multi-chunk SysEx accumulation |
| `presetData.js` | ✅ Complete | `parsePreset` + `serializePreset` + lookup tables (AMP, FX, MOD_SRCS…) |
| `drumbeatData.js` | ✅ Complete | `parseDrumbeat` + `serializeDrumbeat` + bass/snare/hihat/perc sounds |

### State management (`src/store/`)

| File | Status | Notes |
|------|--------|------|
| `presetStore.js` | ✅ Complete | `set()`, `saveToSlot()`, `requestSlot()`, dirty tracking, single-param SysEx |
| `drumbeatStore.js` | ✅ Complete | `setStep()`, `cycleStep()`, MIDI Clock step tracking |
| `libraryStore.js` | ✅ Complete | IndexedDB 200+200 slots, bulk dump engine (1.1s/slot), export/import JSON |
| `systemStore.js` | ✅ Complete | System parameters: read via ID 0x0E/0x0F dump (46 bytes on hardware; spec says 14), write via single-param buffer 2, Factory Init |

### UI components (`src/components/`)

| File | Status | Notes |
|------|--------|------|
| `Knob.js` | ✅ Complete | SVG knob drag+touch+wheel + on/off Toggle |
| `ModFxPanel.js` | ✅ Complete | Rows 1-2: all 18 effects + Details mode |
| `AmpPanel.js` | ✅ Complete | Rows 3-4: 40 amp models + compressor |
| `DelayReverbPanel.js` | ✅ Complete | Rows 5-6: Delay + Reverb + preset meta |
| `SequenceEditor.js` | ✅ Complete | 32-step level+envelope canvas, MIDI Clock cursor, toolbar |
| `SequencerGrid.js` | ✅ Complete | 32×4-voice drumbeat grid, playback cursor |
| `DrumbeatPanel.js` | ✅ Complete | Drumbeat settings + sound selection + SequencerGrid |
| `PedalAssignPanel.js` | ✅ Complete | The preset's expression pedals 1/2 (Destination, Amount/Scale); Source CC, foot switches and the CC tester live in `SystemPanel` |
| `PresetBrowser.js` | ✅ Complete | 200-slot table, Dump Presets + Dump Drumbeats, filters, JSON backup |

### Configuration files (for Claude Code)

| File | Status | Notes |
|------|--------|------|
| `CLAUDE.md` | ✅ Complete | Project context, architecture rules, SysEx protocol, to-do list |
| `README.md` | ✅ Complete | User-facing documentation, setup, structure |
| `.gitignore` | ✅ Complete | Node, macOS, editor, temp files |

---

## SysEx worked examples

The preset/drumbeat SysEx byte dumps used as a reference while building
the real factory presets (Boulevard of Broken Dreams, Heartbreak Warfare, and their
drumbeats) live in a dedicated file: **[SYSEX_PRESETS.md](SYSEX_PRESETS.md)**.

---

## Implemented features by phase

### Phase 1 — MIDI engine
- Complete SysEx builder/parser
- Identity Request/Reply with AdrenaLinn III auto-detect
- Web MIDI connection, port management
- `pack7bit` / `unpack7bit` with round-trip verification

### Phase 2 — Preset editor
- SVG Knob with drag/touch/wheel
- On/off Toggle with LED
- ModFxPanel, AmpPanel, DelayReverbPanel
- Dirty tracking + UNSAVED banner
- Real-time single-parameter SysEx send

### Phase 3 — Drumbeat editor
- 44-byte drumbeat data structure
- SequencerGrid, 32×4 voices
- Click cycles level (off/soft/med/loud)
- Synced MIDI Clock cursor
- Timebase-aware step disabling

### Phase 4 — Library
- IndexedDB with multiple object stores
- Bulk dump engine (1.1s/slot, per spec)
- 200-slot table with categories and filters
- Export/Import JSON
- Lazy row update with green flash

### Phase 5 — Sequence editor + Assign
- 32-step canvas with drag, right-click envelope, double-click zero
- Toolbar: Random, Invert, Shift L/R, Clear
- Animated MIDI Clock cursor
- PedalAssignPanel with inline CC tester

### High-priority improvements (post phase 5)
- `saveToSlot(slot)` with Promise + wait for Save Complete (3s timeout)
- `requestSlot(slot)` via direct ID `0x05`/`0x06`
- Drumbeat bulk dump exposed in PresetBrowser
- `_fetchSlot` uses `buildRequestPreset/Drumbeat` directly
- "Save to Slot" dialog with slot preview and library auto-cache
- MIDI Clock step counter on the display (`S.XX`)

### Medium-priority improvements
See [CLAUDE.md](CLAUDE.md#implemented-improvements-medium-priority) for
details — preset/drumbeat naming, A/B comparison, undo/redo, and
copy-slot-to-slot are all implemented.

---

## Before using this in production

- [x] **Test on real hardware** — done (2026-10-03/04, see the items below); verify every SysEx message produces the expected effect on the physical device
- [x] **Verify `saveToSlot`** — verified on hardware (2026-10-03): select + 50 ms + send works, Save Complete arrives in ~1.7 s, the slot reads back exactly, neighbouring slots untouched. Found and fixed: the pedal stamps the current drumbeat tempo into the written preset (see `writeSession.js`)
- [x] **Verify drumbeat round-trip** — verified on hardware (2026-10-03): a real drumbeat and a real preset parse→serialize back to the device's exact bytes (after preserving the "unused" bytes 9-11, which hold 16/32/16)
- [x] **Test bulk dump interruption** — verified on hardware (2026-10-03): a 3-slot dump takes ~1 s/slot; Stop mid-dump leaves the link working (a request right after is answered)
- [x] **Identity Reply / Auto-detect** — verified on hardware (2026-10-03): the pedal answers the spec layout, firmware 3.0.3, auto-connect + initial sync (System 46 bytes, preset 64, drumbeat 44) all work
- [x] **Unplug / replug** — verified on hardware by the user (2026-10-04): unplugging flips the UI to "disconnected", replugging reconnects by itself, and unplugging in the middle of a dump stops it (progress bar gone) and a second dump then runs normally. A Restore interrupted the same way wasn't tried (same code path: `libraryStore` cancels on `connectionChange`)
- [x] **Filter Type per effect** — measured on the pedal with generated signals (2026-10-04, white noise and a 440 Hz tone through the audio interface, spectra compared with Mod FX bypassed): the raw value is applied as the type it names, whatever the effect — 0 = unprocessed; 1 LP2 ≈ 12 dB/oct low-pass, 2 LP4 ≈ 24 dB/oct, 3 band-pass, 4 notch, 5 high-pass; 6 FLA comb filtering; 7 FLI comb with ~17 dB bass cut; 8 VIB pitch modulation (≈500 cents peak-to-peak on Tremolo, ≈60 on Vibrato); 9 VOL volume modulation (≈52 dB depth on Tremolo, no pitch change). The manual's per-effect lists are the intended pairings; other combinations are accepted and give hybrid sounds (e.g. Tremolo + 8 = deep vibrato; Fixed Flanger reacts mostly to 6/7). Rotary/Sci-Fi untested
- [x] **Chrome permissions** — SysEx access works on `localhost:8080`, and the first-time permission prompt on a fresh browser profile was confirmed by the user (2026-10-04)
- [x] **System parameters** — the dump is 46 bytes on hardware (spec: 14) and single-param writes to buffer 2 read back exactly (11 fields + 2 foot switch bytes tested and restored, 2026-10-03); they survive a power cycle (verified 2026-10-04: noise gate, master volume, Direct/Amp, dump mode, PC bank, pedal sources, MIDI Drums and two foot switch bytes all came back; slots written by Restore/Save, preset tempo included, too). Not persisted: the active preset/drumbeat selected over SysEx (the pedal booted on 199/0 again) and the edit buffer. MIDI Sync is resolved too (tested 2026-10-04): the pedal's four options ---/in/out/i-o are values 0-3.
- [x] **Foot switch destinations** — verified on the pedal's own display (2026-10-04): the 14 factory defaults, plus Left Foot Hold = BMC (raw 22) and MIDI Controller 83 = BYP (raw 38) written from the editor — so the manual's order holds from the single effects through the pairs and triples to Bypass (positions 39-56 follow the same list but weren't individually displayed)
- [x] **Save Complete framing** — verified: the real pedal sends `F0 00 01 37 03 01 11 F7` (WITH the File Version byte); the parser accepts both
- [x] **Tempo Source ≠ Drumbeat tempo** — verified on hardware (2026-10-04): with "System tempo" the pedal stamps the System tempo into a written preset, with "Preset tempo" it keeps the slot's existing tempo; the data's own tempo is ignored in both. Restore / Save to Slot now switch Tempo Source to "Drumbeat tempo" for the write and put it (and the System tempo) back; 100 and 150 were stored exactly under sources 0 and 2
- [x] **Restore to Device / Write** — verified on hardware (2026-10-03) for presets and drumbeats: each slot lands in the right place, Save Complete arrives per slot (~1.2-2.6 s/slot), cancel works between slots, a 10-slot Restore is byte-exact after the tempo fix. All 200 preset slots were re-read and match the pre-test backup
- [x] **Factory Init** — verified on hardware (2026-10-04): the pedal ignores the spec's frame (`F0 00 01 37 03 13 F7`) and obeys the one WITH the File Version byte (`… 03 01 13 F7`); System params, slots and active preset/drumbeat reset, no Save Complete is sent. The editor now sends the working frame
- [x] **BLE MIDI** — confirmed by the user (2026-10-04) that Web MIDI over Bluetooth works in their Chrome (tested with a Chocolate+ pedal and a BT-MIDI receiver; macOS pairing). Not tried with the AdrenaLinn itself (DIN only, via a BT-MIDI adapter): expect slower SysEx than USB. Not natively available on Windows
- [x] **Famous presets on the pedal** — verified on hardware (2026-10-06, no guitar): *Send live* of Heartbreak Warfare left the pedal's preset edit buffer byte-equal to the preset and its drumbeat edit buffer byte-equal to factory drumbeat 28, touched no slot, and only moved the active drumbeat (28) and the System tempo (113), which follow the drumbeat; *Write to slot* (blank slot 198 through Save Slot) stored the preset byte-exact (tempo 97, drumbeat 28) with every System setting unchanged except the active preset (198). Slot, buffers and active preset were restored afterwards. Chrome had to be restarted once: its MIDI input from the Studio 24c had gone silent until then
- [x] **Final Factory Init** — run from the editor on 2026-10-06 after all hardware tests: all 200 presets and 200 drumbeats read back from the pedal match the 2026-10-03 factory backup except preset 199's tempo byte (backup 110, factory 100 — the same difference seen after the previous Factory Init); System parameters, active preset/drumbeat 0/0 at factory defaults. A fresh backup read from the pedal right after the reset is in `backups/factory-after-reset-2026-10-06/` (git-ignored): the full JSON, `.syx` dumps (presets / drumbeats / all) and one `.syx` per slot

---

## Original project resources

Reference PDFs used during development, all published on the official
[Roger Linn Design AdrenaLinn III support page](https://www.rogerlinndesign.com/support/support-adrenalinn):

| File | Content |
|------|---------|
| [MIDI Implementation](https://cdn.prod.website-files.com/5ad24a891dee8925107423d0/5e6955fd0f5a6069d69d92f8_adrenalinn_iii_midi_implementation%2C_8-1-07.pdf) | Full MIDI spec — primary source for all SysEx messages |
| [User's Manual](https://cdn.prod.website-files.com/5ad24a891dee8925107423d0/5e69542a4b96309cc90a9c12_adrenalinn-iii-users-manual%2C-v302%2C-5-14-08.pdf) | Parameter details, effect variations |
| [Presets & Drumbeats Manual](https://cdn.prod.website-files.com/5ad24a891dee8925107423d0/5e695429681006b84c9cc4f0_adrenalinn-iii-presets---drumbeats-manual%2C-11-25-07.pdf) | Factory preset/drumbeat list with names and categories |
| `SoundTower_editor` | A pre-existing third-party desktop editor for the AdrenaLinn III |

The three PDFs are hosted externally and not included in this repository.
`SoundTower_editor` has no official public link.
