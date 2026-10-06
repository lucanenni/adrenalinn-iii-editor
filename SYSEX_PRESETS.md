# SysEx examples — AdrenaLinn III

Worked examples that show the byte layout of the messages, using one song with two presets: **Heartbreak Warfare** as the AdrenaLinn III FAQ describes it (opening riff = factory preset 82 "Ping-Pong Filter Spikes" with drumbeat 28 at 97 BPM; solo = factory preset 51 "Octave Fuzz"). Every byte below is **real pedal data** read from a pedal and generated from `src/midi/famousPresets.js`; each message was checked with a `pack7bit` → `unpack7bit` round-trip against the raw data. The same bytes are in the editor: LIBRARY → ⭐ Famous → `</> SysEx`.

---

## Preset 82 "Ping-Pong Filter Spikes" — Heartbreak Warfare, opening riff — edit buffer (ID `0x0B`, 82 bytes)

Raw preset (64 bytes):
```
01 04 63 25 6E C3 22 0F 23 DB 46 00 00 13 48 4E
95 32 01 3C 6F 27 99 14 54 C7 C7 04 0D 0F 61 1C
1D 03 10 0B 32 02 05 26 00 1C 01 42 00 00 01 42
00 00 01 42 00 00 00 3A 12 31 55 80 05 04 09 22
```

Full SysEx (header `F0 00 01 37 03 01 0B`, 74 packed bytes, `F7`):
```
F0 00 01 37 03 01 0B 20 01 04 63 25 6E 43 22 04
0F 23 5B 46 00 00 13 04 48 4E 15 32 01 3C 6F 32
27 19 14 54 47 47 04 00 0D 0F 61 1C 1D 03 10 00
0B 32 02 05 26 00 1C 00 01 42 00 00 01 42 00 00
00 01 42 00 00 00 3A 08 12 31 55 00 05 04 09 00
22 F7
```

Main decoded parameters:

| Byte | Hex | Field | Value |
|------|-----|-------|-------|
| 0 | `01` | Mod Effect | 1 = Filter Tremolo |
| 1 | `04` | Variation (stored −1) | 4 → displayed 5 |
| 2 | `63` | FX-Dry mix | 99 |
| 3 | `25` | Filter type (hi nibble) + Stereo/10 (lo nibble) | type 2, stereo 50 |
| 4 | `6E` | Speed | 110 |
| 5 | `C3` | Depth (stored +99) | 195 → 96 |
| 6 | `22` | Frequency | 34 |
| 7 | `0F` | Resonance | 15 |
| 8 | `23` | LFO wave (hi) + Mod source (lo) | 2 / 3 |
| 9 | `DB` | On/off flags (bits 0-4) + FX order (bits 6-7) | mod ✓ amp ✓ compr – delay ✓ reverb ✓, order 3 |
| 11 | `00` | Amp model | 0 = Fender Bassman |
| 12 | `00` | Amp drive | 0 |
| 19 | `3C` | Delay volume | 60 |
| 20 | `6F` | Delay time | 111 |
| 21 | `27` | Delay repeats | 39 |
| 23 | `14` | Reverb volume | 20 |
| 30 | `61` | Preset tempo | 97 BPM |
| 31 | `1C` | Assigned drumbeat | #28 |
| 32 | `1D` | Sequence steps 1-32 (bit 7 = envelope) | bytes 32-63: level 0-99 per step |

---

## Preset 51 "Octave Fuzz" — Heartbreak Warfare, solo — edit buffer (ID `0x0B`, 82 bytes)

Raw preset (64 bytes):
```
0F 05 63 50 00 63 18 00 10 1F 46 26 24 48 3C 56
95 1E 03 1C 6D 23 90 14 94 C7 C7 0D 11 1A 6D 14
1D 03 10 0B 32 02 05 26 00 1C 01 42 00 00 01 42
00 00 01 42 00 00 00 3A 12 31 55 80 05 04 09 22
```

Full SysEx (header `F0 00 01 37 03 01 0B`, 74 packed bytes, `F7`):
```
F0 00 01 37 03 01 0B 00 0F 05 63 50 00 63 18 00
00 10 1F 46 26 24 48 04 3C 56 15 1E 03 1C 6D 3A
23 10 14 14 47 47 0D 00 11 1A 6D 14 1D 03 10 00
0B 32 02 05 26 00 1C 00 01 42 00 00 01 42 00 00
00 01 42 00 00 00 3A 08 12 31 55 00 05 04 09 00
22 F7
```

Main decoded parameters:

| Byte | Hex | Field | Value |
|------|-----|-------|-------|
| 0 | `0F` | Mod Effect | 15 = Fixed Filter |
| 1 | `05` | Variation (stored −1) | 5 → displayed 6 |
| 2 | `63` | FX-Dry mix | 99 |
| 3 | `50` | Filter type (hi nibble) + Stereo/10 (lo nibble) | type 5, stereo 0 |
| 4 | `00` | Speed | 0 |
| 5 | `63` | Depth (stored +99) | 99 → 0 |
| 6 | `18` | Frequency | 24 |
| 7 | `00` | Resonance | 0 |
| 8 | `10` | LFO wave (hi) + Mod source (lo) | 1 / 0 |
| 9 | `1F` | On/off flags (bits 0-4) + FX order (bits 6-7) | mod ✓ amp ✓ compr ✓ delay ✓ reverb ✓, order 0 |
| 11 | `26` | Amp model | 38 = Octave Fuzz |
| 12 | `24` | Amp drive | 36 |
| 19 | `1C` | Delay volume | 28 |
| 20 | `6D` | Delay time | 109 |
| 21 | `23` | Delay repeats | 35 |
| 23 | `14` | Reverb volume | 20 |
| 30 | `6D` | Preset tempo | 109 BPM |
| 31 | `14` | Assigned drumbeat | #20 |
| 32 | `1D` | Sequence steps 1-32 (bit 7 = envelope) | bytes 32-63: level 0-99 per step |

---

## Drumbeat 28 "Basic beat with Tambourine" — for the opening riff — edit buffer (ID `0x0D`, 59 bytes)

Raw drumbeat (44 bytes), sent at the preset's tempo:
```
3C C9 00 02 45 27 1D 27 61 00 00 00 F3 00 20 00
FC 00 20 00 F3 00 20 00 FC 00 20 00 F3 00 20 00
FC 00 20 00 F3 00 20 00 FC 00 20 00
```

Full SysEx (header `F0 00 01 37 03 01 0D`, 51 packed bytes, `F7`):
```
F0 00 01 37 03 01 0D 02 3C 49 00 02 45 27 1D 20
27 61 00 00 00 73 00 44 20 00 7C 00 20 00 73 08
00 20 00 7C 00 20 00 11 73 00 20 00 7C 00 20 22
00 73 00 20 00 7C 00 00 20 00 F7
```

Main decoded parameters:

| Byte | Hex | Field | Value |
|------|-----|-------|-------|
| 0 | `3C` | Volume | 60 |
| 1 | `C9` | FX send | 201 (reverb) |
| 2 | `00` | Treble/Distortion | off |
| 3 | `02` | Timebase | 2 = 1/16 Notes |
| 4 | `45` | Bass sound (hi) + volume (lo) | sound 4 (Tight 80s kick), vol 5 |
| 5 | `27` | Snare sound + volume | sound 2 (Gated reverb snare), vol 7 |
| 6 | `1D` | Hihat sound + volume | sound 1 (Metallic closed (shank)), vol 13 |
| 7 | `27` | Percussion bank + volume | bank 2, vol 7 |
| 8 | `61` | Tempo | 97 BPM |
| 9 | `00` | Unused (device holds non-zero values) | 00 00 00 |
| 12 | `F3` | Steps 1-32: 2 bits per voice | bass bits 0-1, snare 2-3, hihat 4-5, percussion 6-7 |

---

## Drumbeat 20 "Purple Haze" — the solo preset's own drumbeat (the FAQ gives none) — edit buffer (ID `0x0D`, 59 bytes)

Raw drumbeat (44 bytes), sent at the preset's tempo:
```
46 C9 00 03 1D 1D 31 27 6D 10 20 10 33 00 00 00
3C 00 00 04 33 00 00 00 3C 00 00 00 33 00 00 00
3C 00 00 04 33 00 03 00 3C 00 01 00
```

Full SysEx (header `F0 00 01 37 03 01 0D`, 51 packed bytes, `F7`):
```
F0 00 01 37 03 01 0D 02 46 49 00 03 1D 1D 31 00
27 6D 10 20 10 33 00 00 00 00 3C 00 00 04 33 00
00 00 00 3C 00 00 00 00 33 00 00 00 3C 00 00 00
04 33 00 03 00 3C 00 00 01 00 F7
```

Main decoded parameters:

| Byte | Hex | Field | Value |
|------|-----|-------|-------|
| 0 | `46` | Volume | 70 |
| 1 | `C9` | FX send | 201 (reverb) |
| 2 | `00` | Treble/Distortion | off |
| 3 | `03` | Timebase | 3 = 1/16 Half-swing |
| 4 | `1D` | Bass sound (hi) + volume (lo) | sound 1 (Deep kick (room)), vol 13 |
| 5 | `1D` | Snare sound + volume | sound 1 (Rimshot (room)), vol 13 |
| 6 | `31` | Hihat sound + volume | sound 3 (Metallic closed hihat), vol 1 |
| 7 | `27` | Percussion bank + volume | bank 2, vol 7 |
| 8 | `6D` | Tempo | 109 BPM |
| 9 | `10` | Unused (device holds non-zero values) | 10 20 10 |
| 12 | `33` | Steps 1-32: 2 bits per voice | bass bits 0-1, snare 2-3, hihat 4-5, percussion 6-7 |

---

## Full footswitch sequence — switch A and switch B

To send preset + drumbeat with a single footswitch press:

**Switch A — opening riff:**
```
t=0ms:   F0 00 01 37 03 01 0B 20 01 04 63 25 6E 43 22 04 0F 23 5B 46 00 00 13 04 48 4E 15 32 01 3C 6F 32 27 19 14 54 47 47 04 00 0D 0F 61 1C 1D 03 10 00 0B 32 02 05 26 00 1C 00 01 42 00 00 01 42 00 00 00 01 42 00 00 00 3A 08 12 31 55 00 05 04 09 00 22 F7
t=50ms:  F0 00 01 37 03 01 0D 02 3C 49 00 02 45 27 1D 20 27 61 00 00 00 73 00 44 20 00 7C 00 20 00 73 08 00 20 00 7C 00 20 00 11 73 00 20 00 7C 00 20 22 00 73 00 20 00 7C 00 00 20 00 F7
```

**Switch B — solo:**
```
t=0ms:   F0 00 01 37 03 01 0B 00 0F 05 63 50 00 63 18 00 00 10 1F 46 26 24 48 04 3C 56 15 1E 03 1C 6D 3A 23 10 14 14 47 47 0D 00 11 1A 6D 14 1D 03 10 00 0B 32 02 05 26 00 1C 00 01 42 00 00 01 42 00 00 00 01 42 00 00 00 3A 08 12 31 55 00 05 04 09 00 22 F7
t=50ms:  F0 00 01 37 03 01 0D 02 46 49 00 03 1D 1D 31 00 27 6D 10 20 10 33 00 00 00 00 3C 00 00 04 33 00 00 00 00 3C 00 00 00 00 33 00 00 00 3C 00 00 00 04 33 00 03 00 3C 00 00 01 00 F7
```

> **Timing note**: 50 ms between preset and drumbeat is a conservative margin. The edit buffer (ID `0x0B`/`0x0D`) is **temporary** — nothing is written to flash, so no Save Complete reply is sent and 50 ms is enough. Messages that *do* write to flash (ID `0x02`/`0x03`) are answered by a Save Complete (`F0 00 01 37 03 01 11 F7`) about 1.7 s later: wait for it before sending the next one.
>
> The drumbeats are sent at the preset's tempo (97 and 109 BPM); with Tempo Source = Drumbeat tempo the pedal would otherwise play the drumbeat's own tempo.
