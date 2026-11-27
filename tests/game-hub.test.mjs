import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  GAMES,
  STORAGE_KEY,
  GAME_URL,
  newState,
  normalizeState,
  safeGameUrl,
  loadState,
  saveState,
  recordLaunch,
  selectGames,
} from '../dist/hub/library.js';

test('the featured game opens the current public game, while prototype URLs retain their own access', () => {
  assert.equal(GAMES[0].url, 'https://flyingcarsforfun.connstors.workers.dev/');
  assert.equal(GAME_URL, GAMES[0].url);
  assert.equal(new Set(GAMES.map((g) => g.id)).size, GAMES.length);
  assert.ok(
    GAMES.filter((g) => g.id !== 'boost-circuit').every(
      (g) => g.access === 'Private prototype',
    ),
  );
  for (const game of GAMES) assert.equal(safeGameUrl(game.url), game.url);
});
test('user-added links require HTTPS and cannot contain credentials or script URLs', () => {
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,<script>',
    'http://example.com',
    'file:///etc/passwd',
    'https://name:secret@example.com',
    'not a url',
    '//example.com',
  ])
    assert.equal(safeGameUrl(url), null, url);
  assert.equal(
    safeGameUrl(' https://example.com/play?q=car#start '),
    'https://example.com/play?q=car#start',
  );
});
test('corrupt or blocked storage recovers without preventing game launches', () => {
  assert.deepEqual(loadState(null), newState());
  assert.deepEqual(
    loadState({
      getItem() {
        return '{broken';
      },
    }),
    newState(),
  );
  assert.equal(
    saveState(
      {
        setItem() {
          throw Error('Quota exceeded');
        },
      },
      newState(),
    ),
    false,
  );
  let value, key;
  const memory = {
    getItem() {
      return value;
    },
    setItem(k, v) {
      key = k;
      value = v;
    },
  };
  const state = newState();
  state.name = 'Rocket friend';
  state.favourites = ['boost-circuit'];
  recordLaunch(state, 'boost-circuit', 1200);
  assert.equal(saveState(memory, state), true);
  assert.equal(key, STORAGE_KEY);
  assert.deepEqual(loadState(memory), state);
});
test('normalization rejects unsafe custom games and removes orphaned history and favourites', () => {
  const s = normalizeState({
    name: '  Driver  ',
    newTab: false,
    custom: [
      { id: 'custom-valid', title: 'My game', url: 'https://example.com/' },
      { id: 'custom-bad', title: 'Bad', url: 'javascript:alert(1)' },
      { id: 'custom-valid', title: 'Duplicate', url: 'https://other.example/' },
      { id: 'boost-circuit', title: 'Spoof', url: 'https://other.example/' },
    ],
    favourites: ['custom-valid', 'ghost', 'boost-circuit', 'boost-circuit'],
    recent: [
      { id: 'ghost', at: 300 },
      { id: 'boost-circuit', at: 20 },
      { id: 'custom-valid', at: 30 },
      { id: 'boost-circuit', at: 10 },
      { id: 'skybreak', at: NaN },
    ],
  });
  assert.equal(s.name, 'Driver');
  assert.equal(s.newTab, false);
  assert.equal(s.custom.length, 1);
  assert.deepEqual(s.favourites, ['custom-valid', 'boost-circuit']);
  assert.deepEqual(s.recent, [
    { id: 'custom-valid', at: 30 },
    { id: 'boost-circuit', at: 20 },
  ]);
});
test('launch history, favourites, game style and search compose without changing the catalogue', () => {
  const s = newState();
  s.favourites = ['boost-circuit', 'random-eras'];
  recordLaunch(s, 'boost-circuit', 100);
  recordLaunch(s, 'skybreak', 200);
  recordLaunch(s, 'boost-circuit', 300);
  recordLaunch(s, 'invalid', 400);
  assert.deepEqual(
    selectGames(s, { view: 'recent' }).map((g) => g.id),
    ['boost-circuit', 'skybreak'],
  );
  assert.deepEqual(
    selectGames(s, { view: 'favourites', genre: 'Sports', query: 'CAR' }).map(
      (g) => g.id,
    ),
    ['boost-circuit'],
  );
  assert.equal(selectGames(s, { genre: 'Puzzle' }).length, 0);
  assert.equal(selectGames(s, { query: 'building' }).length, 2);
  assert.equal(GAMES.length, 4);
  assert.equal(s.recent.length, 2);
});
test('stored personal collections stay bounded and cannot override trusted artwork or launch targets', () => {
  const custom = Array.from({ length: 80 }, (_, i) => ({
    id: 'custom-' + i,
    title: 'Game ' + i,
    url: 'https://example.com/' + i,
    image: 'javascript:bad',
    access: 'Public',
  }));
  const s = normalizeState({ custom });
  assert.equal(s.custom.length, 40);
  assert.ok(
    s.custom.every(
      (g) => g.image === 'assets/custom.svg' && g.access === 'Your link',
    ),
  );
});
test('the static page has unique IDs, all direct JS targets and a working no-JavaScript game link', () => {
  const html = readFileSync(
    new URL('../dist/hub/index.html', import.meta.url),
    'utf8',
  );
  const js = readFileSync(new URL('../dist/hub/app.js', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const m of js.matchAll(/\$\('#([\w-]+)'\)/g))
    assert.ok(
      ids.includes(m[1]) || ['remove-game'].includes(m[1]),
      m[1] + ' missing from static HTML',
    );
  assert.match(
    html,
    /<noscript\b[\s\S]*https:\/\/flyingcarsforfun\.connstors\.workers\.dev\//,
  );
  assert.ok(!html.includes('<iframe'));
  assert.equal((html.match(/class="featured"/g) || []).length, 1);
});
test('all linked catalogue images and local static assets are packaged', () => {
  const html = readFileSync(
    new URL('../dist/hub/index.html', import.meta.url),
    'utf8',
  );
  const css = readFileSync(
    new URL('../dist/hub/styles.css', import.meta.url),
    'utf8',
  );
  const files = [
    ...GAMES.map((g) => g.image),
    ...Array.from(html.matchAll(/(?:src|href)="([^"#]+)"/g), (m) => m[1]),
    ...Array.from(css.matchAll(/url\('([^']+)'\)/g), (m) => m[1]),
  ].filter((p) => !p.includes('://'));
  for (const p of files)
    assert.ok(
      existsSync(new URL('../dist/hub/' + p, import.meta.url)),
      p + ' missing',
    );
});
