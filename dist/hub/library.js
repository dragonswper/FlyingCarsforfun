export const STORAGE_KEY = 'playdock.library.v1';
export const GAME_URL = 'https://flyingcarsforfun.connstors.workers.dev/';
export const GAMES = Object.freeze([
  {
    id: 'boost-circuit',
    title: 'Boost Circuit',
    genre: 'Sports',
    description:
      'Hit the pitch. Chase the perfect touch. Car soccer, aerial tricks and Hoops in one browser game.',
    url: GAME_URL,
    image: 'assets/hero.jpg',
    access: 'Public',
    tags: ['Multiplayer', 'Car soccer'],
    controls: 'Keyboard, controller and touch',
  },
  {
    id: 'skybreak',
    title: 'Skybreak',
    genre: 'Action',
    description:
      'Build your way through a browser arena. Experiment with structures and sharpen your aim in this early prototype.',
    url: 'https://skybreak-build-arena.bobistheman2049.chatgpt.site/',
    image: 'assets/skybreak.svg',
    access: 'Private prototype',
    tags: ['Building', 'Arena'],
    controls: 'Keyboard and mouse',
  },
  {
    id: 'riftfall',
    title: 'Riftfall',
    genre: 'Action',
    description:
      'Drop onto a 3D island for solo bot skirmishes and building practice. An early browser recreation to explore.',
    url: 'https://riftfall-magnesium-web.bobistheman2049.chatgpt.site/',
    image: 'assets/riftfall.svg',
    access: 'Private prototype',
    tags: ['Island', 'Solo bots'],
    controls: 'Keyboard and mouse',
  },
  {
    id: 'random-eras',
    title: 'Random Era’s',
    genre: 'Adventure',
    description:
      'Explore procedural strongholds and try third-person melee duels in this browser prototype.',
    url: 'https://random-eras-frontier.bobistheman2049.chatgpt.site/',
    image: 'assets/random-eras.svg',
    access: 'Private prototype',
    tags: ['Exploration', 'Melee'],
    controls: 'Keyboard and mouse',
  },
]);

// Links are navigations only. No credentials, accounts or other game data are
// copied into the hub, and saved links never become executable HTML.
export function safeGameUrl(value) {
  try {
    const u = new URL(String(value).trim());
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.href.length > 2048
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}

export function newState() {
  return {
    favourites: [],
    recent: [],
    custom: [],
    name: 'Player',
    newTab: true,
  };
}
export function normalizeState(input) {
  const state = newState();
  if (!input || typeof input !== 'object') return state;
  if (typeof input.name === 'string' && input.name.trim())
    state.name = input.name.trim().slice(0, 30);
  state.newTab = input.newTab !== false;
  const builtIn = new Set(GAMES.map((g) => g.id));
  for (const game of Array.isArray(input.custom)
    ? input.custom.slice(0, 40)
    : []) {
    if (
      !game ||
      typeof game.id !== 'string' ||
      !/^custom-[a-z0-9-]{1,64}$/.test(game.id) ||
      builtIn.has(game.id)
    )
      continue;
    const url = safeGameUrl(game.url),
      title =
        typeof game.title === 'string' ? game.title.trim().slice(0, 60) : '';
    if (!url || !title) continue;
    builtIn.add(game.id);
    state.custom.push({
      id: game.id,
      title,
      url,
      description:
        typeof game.description === 'string'
          ? game.description.slice(0, 180)
          : 'A game from your personal collection.',
      genre: ['Sports', 'Action', 'Adventure', 'Puzzle', 'Other'].includes(
        game.genre,
      )
        ? game.genre
        : 'Other',
      access: 'Your link',
      image: 'assets/custom.svg',
      tags: ['Custom link'],
      controls: 'See the game for controls',
      custom: true,
    });
  }
  state.favourites = [
    ...new Set(Array.isArray(input.favourites) ? input.favourites : []),
  ].filter((id) => builtIn.has(id));
  const seen = new Set();
  state.recent = (Array.isArray(input.recent) ? input.recent : [])
    .filter((r) => {
      if (
        !r ||
        !builtIn.has(r.id) ||
        seen.has(r.id) ||
        !Number.isFinite(r.at) ||
        r.at <= 0
      )
        return false;
      seen.add(r.id);
      return true;
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, 30)
    .map((r) => ({ id: r.id, at: r.at }));
  return state;
}
export function loadState(storage) {
  try {
    return normalizeState(JSON.parse(storage.getItem(STORAGE_KEY)));
  } catch {
    return newState();
  }
}
export function saveState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
    return true;
  } catch {
    return false;
  }
}
export function recordLaunch(state, id, at = Date.now()) {
  const games = [...GAMES, ...state.custom];
  if (!games.some((g) => g.id === id)) return;
  state.recent = [{ id, at }, ...state.recent.filter((r) => r.id !== id)].slice(
    0,
    30,
  );
}
export function selectGames(
  state,
  { view = 'library', genre = 'All', query = '' } = {},
) {
  let games = [...GAMES, ...state.custom];
  if (view === 'favourites')
    games = games.filter((g) => state.favourites.includes(g.id));
  if (view === 'recent')
    games = state.recent
      .map((r) => games.find((g) => g.id === r.id))
      .filter(Boolean);
  if (genre !== 'All') games = games.filter((g) => g.genre === genre);
  const q = query.trim().toLocaleLowerCase();
  if (q)
    games = games.filter((g) =>
      [g.title, g.description, g.genre, ...g.tags]
        .join(' ')
        .toLocaleLowerCase()
        .includes(q),
    );
  return games;
}
