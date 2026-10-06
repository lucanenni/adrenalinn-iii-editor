/**
 * AdrenaLinn III — famous-song presets
 *
 * Data only (no UI, no MIDI). Only songs that Roger Linn Design itself documents are here, and every
 * preset is a real factory preset of the pedal (read from a real one). Everything needed to write it
 * from scratch is stored as raw bytes, so it still works if the factory slots on a pedal were edited:
 *   raw           the 64 preset bytes: the factory preset with the tempo/drumbeat the FAQ sets already
 *                 applied (raw[30] = preset tempo, raw[31] = drumbeat number)
 *   drumbeat      the 44 bytes of the factory drumbeat that goes with it (`drumbeatSlot`, name in `drumbeatName`)
 *   base          { slot, name, changes[] } — the factory preset it comes from, its official name and what
 *                 was changed (the tempo/drumbeat settings from the FAQ)
 * Sources:
 *   - AdrenaLinn III FAQ, panel 2: rogerlinndesign.com/support/support-adrenalinn-faqs — Heartbreak Warfare
 *     (preset 82, drumbeat 28, tempo 97; solo preset 51), I Don't Trust Myself (preset 73 pulsing filter,
 *     preset 160 auto-wah, drumbeat 1, tempo 84), Bigger Than My Body (preset 150)
 *   - official "Preset & Drumbeat Listing" (Presets & Drumbeats manual PDF): preset names and descriptions,
 *     drumbeat names; it names presets 140 (Boulevard of Broken Dreams) and 150 (Bigger Than My Body)
 *     after the songs
 * Only John Mayer and Green Day songs that Roger Linn Design documents are listed. Do not use the AdrenaLinn II FAQ
 * (support-adrenalinn-2-faqs) as a source: its preset numbers are for older models.
 */
export const FAMOUS_SONGS = [
  {
    emoji: "🎸",
    title: "Bigger Than My Body",
    artist: "John Mayer · Heavier Things (2003) — AdrenaLinn 1 → III port",
    kind: "factory",
    sourceLabel: "🏭 Factory #150 (III FAQ + official listing)",
    desc: "The AdrenaLinn III FAQ says: use preset 150, and the official Preset Listing names that preset after the song. This is that factory preset exactly as it ships — an Arpeggiator Sequence (the arpeggiator doesn't generate its own notes, it re-triggers the notes you play, so even muted strings work).",
    presets: [
      {
        id: "btmb",
        name: "Bigger Than My Body — preset 150",
        tags: ["Arpeggiator Sequence var 1","RLD Crisp"],
        howto: "<strong>How to play:</strong><br> Bar 1: hold an <code>Esus</code> chord for the whole bar.<br> Bar 2: play <code>Esus</code> then <code>E major</code> across the first two octaves. Repeat.",
        base: {"slot":150,"name":"Bigger Than My Body","changes":[]},
        drumbeatSlot: 61,
        drumbeatName: "1/16 hihat beat with 1/16 shakers",
        drumbeat: Uint8Array.from([
        60,201,0,2,99,49,29,12,117,16,32,16,179,64,128,64,
        188,64,128,64,179,64,128,64,188,64,128,64,179,64,128,64,
        188,64,131,64,176,64,131,64,188,64,130,64,
      ]),
        raw: Uint8Array.from([
        9,0,54,98,33,198,12,92,26,151,60,28,0,91,47,62,
        148,40,65,20,111,20,144,15,148,199,106,1,5,14,117,61,
        29,3,16,11,50,2,5,38,0,28,1,66,0,0,1,66,
        0,0,1,66,0,0,0,58,18,49,85,128,5,4,9,34,
      ]),
      },
    ],
  },
  {
    emoji: "🎵",
    title: "I Don't Trust Myself (With Loving You)",
    artist: "John Mayer · Continuum (2006) — AdrenaLinn II",
    kind: "factory",
    sourceLabel: "🏭 Factory #73 / #160 (III FAQ)",
    desc: "Two factory presets named by the AdrenaLinn III FAQ: preset 73 is the pulsing filter of the opening chord riff, preset 160 the auto-wah of the melody line that follows. For the drumbeat the FAQ says drumbeat 1 and tempo 84 — applied to both.",
    presets: [
      {
        id: "idtm1",
        name: "Opening chord riff — pulsing filter (preset 73)",
        tags: ["Filter Tremolo var 1","Fender Bassman"],
        howto: "<strong>How to play:</strong> Play the opening chord riff with repeated chords; the filter pulses on its own.",
        base: {"slot":73,"name":"1/8 Note Filter Tremolo","changes":["Tempo 109 → 84 BPM (FAQ)","Drumbeat 4 → 1 (FAQ)"]},
        drumbeatSlot: 1,
        drumbeatName: "Basic Boom Chik Ba-Boom Chik beat",
        drumbeat: Uint8Array.from([
        60,100,0,2,99,39,28,33,100,16,32,16,51,0,16,0,
        60,0,17,0,51,0,16,0,60,0,16,0,51,0,16,0,
        60,0,17,0,51,0,16,0,60,0,16,0,
      ]),
        raw: Uint8Array.from([
        1,0,99,32,110,149,40,0,19,219,70,0,0,19,72,78,
        149,60,1,47,2,5,146,15,148,199,149,4,6,2,84,1,
        29,3,16,11,50,2,5,38,0,28,1,66,0,0,1,66,
        0,0,1,66,0,0,0,58,18,49,85,128,5,4,9,34,
      ]),
      },
      {
        id: "idtm2",
        name: "Melody line — auto-wah (preset 160)",
        tags: ["Auto Filter var 1","Fender Bassman"],
        howto: "<strong>How to play:</strong> Single notes: each one opens the auto-wah. Used for the melody that follows the opening riff.",
        base: {"slot":160,"name":"Auto Wah","changes":["Tempo 103 → 84 BPM (FAQ)","Drumbeat 46 → 1 (FAQ)"]},
        drumbeatSlot: 1,
        drumbeatName: "Basic Boom Chik Ba-Boom Chik beat",
        drumbeat: Uint8Array.from([
        60,100,0,2,99,39,28,33,100,16,32,16,51,0,16,0,
        60,0,17,0,51,0,16,0,60,0,16,0,51,0,16,0,
        60,0,17,0,51,0,16,0,60,0,16,0,
      ]),
        raw: Uint8Array.from([
        10,0,99,48,0,152,3,48,20,211,80,0,0,70,70,72,
        149,60,68,20,111,20,144,10,148,169,199,8,1,2,84,1,
        29,3,16,11,50,2,5,38,0,28,1,66,0,0,1,66,
        0,0,1,66,0,0,0,58,18,49,85,128,5,4,9,34,
      ]),
      },
    ],
  },
  {
    emoji: "💔",
    title: "Heartbreak Warfare",
    artist: "John Mayer · Battle Studies (2009) — AdrenaLinn III",
    kind: "factory",
    sourceLabel: "🏭 Factory #82 / #51 (III FAQ)",
    desc: "Mayer's first prominent use of the AdrenaLinn <strong>III</strong>. The FAQ: for the opening riff use preset 82, drumbeat 28 and tempo 97; for the solo sound use preset 51. Keep the playing very simple — the AdrenaLinn does the heavy lifting.",
    presets: [
      {
        id: "hbw",
        name: "Opening riff (preset 82, drumbeat 28, 97 BPM)",
        tags: ["Filter Tremolo var 5","Fender Bassman"],
        howto: "<strong>How to play (intro/verse):</strong><br> • <strong>2nd eighth-note</strong> of each bar: gently pluck the G string, 14th fret<br> • <strong>3rd eighth-note</strong>: pluck the B string, 17th fret. Let both ring out.<br> Roll the guitar's tone control all the way down.",
        base: {"slot":82,"name":"Ping-Pong Filter Spikes","changes":["Tempo 110 → 97 BPM (FAQ)","Drumbeat 6 → 28 (FAQ)"]},
        drumbeatSlot: 28,
        drumbeatName: "Basic beat with Tambourine",
        drumbeat: Uint8Array.from([
        60,201,0,2,69,39,29,39,113,0,0,0,243,0,32,0,
        252,0,32,0,243,0,32,0,252,0,32,0,243,0,32,0,
        252,0,32,0,243,0,32,0,252,0,32,0,
      ]),
        raw: Uint8Array.from([
        1,4,99,37,110,195,34,15,35,219,70,0,0,19,72,78,
        149,50,1,60,111,39,153,20,84,199,199,4,13,15,97,28,
        29,3,16,11,50,2,5,38,0,28,1,66,0,0,1,66,
        0,0,1,66,0,0,0,58,18,49,85,128,5,4,9,34,
      ]),
      },
      {
        id: "hbws",
        name: "Solo sound (preset 51)",
        tags: ["Fixed Filter var 6","Octave Fuzz"],
        howto: "",
        base: {"slot":51,"name":"Octave Fuzz","changes":[]},
        drumbeatSlot: 20,
        drumbeatName: "Purple Haze",
        drumbeat: Uint8Array.from([
        70,201,0,3,29,29,49,39,109,16,32,16,51,0,0,0,
        60,0,0,4,51,0,0,0,60,0,0,0,51,0,0,0,
        60,0,0,4,51,0,3,0,60,0,1,0,
      ]),
        raw: Uint8Array.from([
        15,5,99,80,0,99,24,0,16,31,70,38,36,72,60,86,
        149,30,3,28,109,35,144,20,148,199,199,13,17,26,109,20,
        29,3,16,11,50,2,5,38,0,28,1,66,0,0,1,66,
        0,0,1,66,0,0,0,58,18,49,85,128,5,4,9,34,
      ]),
      },
    ],
  },
  {
    emoji: "🌃",
    title: "Boulevard of Broken Dreams",
    artist: "Green Day · American Idiot (2004) — AdrenaLinn III factory preset #140",
    kind: "factory",
    sourceLabel: "🏭 Factory #140 (official listing)",
    desc: "Factory preset 140 — the official AdrenaLinn III Preset Listing names it \"Boulevard of Broken Dreams\": Tremolo Sequence 11, recreating the guitar sound of Green Day's 2004 hit (the listing's how-to: sustain Em, G, D, A for one bar each and repeat). The sequencer pulses the volume, accenting every fourth 1/16 step (levels 99-50-50-50), with a Bogner Uberschall amp and delay.",
    presets: [
      {
        id: "bobd",
        name: "Boulevard of Broken Dreams — TSE #11",
        tags: ["TSE #11","Bogner Uberschall"],
        howto: "<strong>How to play:</strong> Hold chords — <code>Em, G, D, A</code> — one per bar, repeat. The tremolo does the work. Use the neck or bridge humbucker.<br> Tempo: <code>~87 BPM</code> (the factory value).",
        base: {"slot":140,"name":"Boulevard of Broken Dreams","changes":[]},
        drumbeatSlot: 13,
        drumbeatName: "Slow rock beat, Boom Chik Ba-Boom Chik",
        drumbeat: Uint8Array.from([
        60,100,0,2,29,29,29,30,87,16,32,16,115,0,96,0,
        124,0,81,0,115,0,96,0,124,0,80,0,115,0,96,0,
        124,0,81,0,115,0,96,0,124,0,80,0,
      ]),
        raw: Uint8Array.from([
        7,10,99,144,33,198,0,0,17,203,99,16,23,85,86,49,
        149,36,66,43,4,14,144,15,148,199,96,4,3,2,87,13,
        227,178,178,178,227,178,178,178,227,178,178,178,227,178,178,227,
        227,178,178,178,227,178,178,178,227,178,178,178,227,178,178,227,
      ]),
      },
    ],
  },
];

export const FAMOUS_KIND_LABELS = {
  factory: 'A factory preset of this pedal, read from a real one — preset numbers from the AdrenaLinn III FAQ and the official Preset Listing',
};
