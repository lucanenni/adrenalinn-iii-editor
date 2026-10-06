/**
 * AdrenaLinn III Web Editor — Service Worker
 *
 * Caches the app shell (the 3 entry points + every src/ module) so the
 * editor keeps working offline after it has been loaded at least once.
 * This does NOT remove the need for an HTTP server on first load — the
 * Web MIDI API and ES modules both require a secure context (http(s) or
 * localhost), never file://. What it removes is the need for that server
 * to be *running* on every later visit.
 *
 * No bundler, no build step (per project rules) — this file list is
 * maintained by hand. Add new src/ files here when you add them to the
 * project, and bump CACHE_NAME whenever the list or any cached file
 * changes, so clients pick up a clean cache instead of a stale mix.
 */
const CACHE_NAME = 'al3-editor-v39';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './src/midi/sysex.js',
  './src/midi/midiManager.js',
  './src/midi/presetData.js',
  './src/midi/drumbeatData.js',
  './src/midi/systemData.js',
  './src/midi/syxFile.js',
  './src/midi/famousPresets.js',
  './src/store/presetStore.js',
  './src/store/drumbeatStore.js',
  './src/store/libraryStore.js',
  './src/store/systemStore.js',
  './src/store/writeSession.js',
  './src/components/Knob.js',
  './src/components/ModFxPanel.js',
  './src/components/AmpPanel.js',
  './src/components/DelayReverbPanel.js',
  './src/components/SequenceEditor.js',
  './src/components/SequencerGrid.js',
  './src/components/DrumbeatPanel.js',
  './src/components/PedalAssignPanel.js',
  './src/components/PresetBrowser.js',
  './src/components/FamousPresetsPanel.js',
  './src/components/SysexDialog.js',
  './src/components/SystemPanel.js',
  './src/components/PresetMetaPanel.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate for same-origin GETs: answer instantly from cache
// (so the app works offline and feels fast), while refreshing the cache
// from the network in the background so edits show up on the next load.
// Cross-origin requests (Google Fonts) are left untouched — the CSS
// already falls back to a system monospace/sans-serif font, so failing
// closed offline is fine and doesn't need caching here.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request).then(resp => {
        if (resp.ok) cache.put(event.request, resp.clone());
        return resp;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
