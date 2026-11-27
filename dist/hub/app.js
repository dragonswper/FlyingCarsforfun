import {
  STORAGE_KEY,
  GAMES,
  loadState,
  saveState,
  recordLaunch,
  selectGames,
  safeGameUrl,
} from './library.js';
const $ = (s) => document.querySelector(s);
let storage;
try {
  storage = localStorage;
} catch {
  storage = null;
}
let state = loadState(storage),
  view = 'library',
  genre = 'All',
  query = '',
  toastTimer,
  detailId;
const allGames = () => [...GAMES, ...state.custom];
const svg = (id) => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
// Escape all dynamic text, including locally added game names and URLs.
const esc = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}
function persist() {
  if (!saveState(storage, state))
    toast('Browser storage is unavailable. Changes last for this visit.');
}
function launchAttrs(game) {
  return `href="${esc(game.url)}" data-game="${esc(game.id)}" ${state.newTab ? 'target="_blank"' : ''} rel="noopener noreferrer"`;
}
function playButton(game, label = 'Play') {
  return `<a class="card-play launch-link" ${launchAttrs(game)} aria-label="Play ${esc(game.title)}${state.newTab ? ', opens in a new tab' : ''}">${svg('play')}${label}</a>`;
}
function card(game) {
  const favourite = state.favourites.includes(game.id),
    badge =
      game.id === 'boost-circuit' ? 'public' : game.custom ? 'custom' : '';
  return `<article class="game-card"><button class="game-art" data-details="${esc(game.id)}" aria-label="About ${esc(game.title)}"><img src="${esc(game.image)}" alt="" loading="lazy" width="480" height="300"><span class="card-style">${esc(game.genre)}</span></button><button class="favourite" data-favourite="${esc(game.id)}" aria-pressed="${favourite}" aria-label="${favourite ? 'Remove' : 'Add'} ${esc(game.title)} ${favourite ? 'from' : 'to'} favourites">${svg('heart')}</button><div class="card-content"><button class="card-title" data-details="${esc(game.id)}">${esc(game.title)}</button><div class="card-tags">${game.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div><div class="card-bottom"><span class="access-badge ${badge}">${esc(game.access)}</span>${playButton(game)}</div></div></article>`;
}
function timeAgo(at) {
  const min = Math.max(0, Math.floor((Date.now() - at) / 60000));
  return min < 1
    ? 'Opened just now'
    : min < 60
      ? `Opened ${min} min ago`
      : min < 1440
        ? 'Opened today'
        : `Opened ${new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
function render() {
  const results = selectGames(state, { view, genre, query });
  $('.featured').hidden = view !== 'library' || !!query || genre !== 'All';
  $('.welcome').hidden = view !== 'library' || !!query || genre !== 'All';
  $('#library-title').innerHTML =
    `${view === 'favourites' ? 'Your favourites' : view === 'recent' ? 'Recently played' : 'Your game library'} <span id="result-count">${results.length}</span>`;
  $('#section-eyebrow').textContent =
    view === 'recent'
      ? 'READY FOR ANOTHER ROUND?'
      : view === 'favourites'
        ? 'THE ONES YOU KEEP COMING BACK TO'
        : 'FIND YOUR NEXT FAVOURITE';
  $('#game-grid').innerHTML = results.map(card).join('');
  $('#empty-state').hidden = !!results.length;
  const noFilters = !query && genre === 'All';
  $('#empty-title').textContent =
    noFilters && view === 'favourites'
      ? 'Keep your favourites close.'
      : noFilters && view === 'recent'
        ? 'Your next game starts here.'
        : 'No games found';
  $('#empty-description').textContent =
    noFilters && view === 'favourites'
      ? 'Tap the heart on any game to save it here.'
      : noFilters && view === 'recent'
        ? 'Games you open from Playdock will appear here.'
        : 'Try another title or game style, or add a game to your collection.';
  $('#reset-filters').hidden = noFilters;
  $('#access-note').hidden = !results.some(
    (g) => g.access === 'Private prototype',
  );
  $('#collection-count').textContent =
    `${allGames().length} games in your collection`;
  $('#breadcrumb-view').textContent =
    view === 'favourites'
      ? 'Favourites'
      : view === 'recent'
        ? 'Recently played'
        : 'Library';
  $('#nav-count').textContent = allGames().length;
  $('#favourite-count').textContent = state.favourites.length;
  for (const b of document.querySelectorAll('[data-view]')) {
    b.classList.toggle('active', b.dataset.view === view);
    if (b.dataset.view === view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  for (const b of document.querySelectorAll('[data-filter]')) {
    b.classList.toggle('active', b.dataset.filter === genre);
    b.setAttribute('aria-pressed', String(b.dataset.filter === genre));
    if (b.dataset.filter === 'Other')
      b.hidden = !state.custom.some((g) => g.genre === 'Other');
  }
  for (const b of document.querySelectorAll('[data-genre]'))
    b.classList.toggle('active', b.dataset.genre === genre);
  const recent = selectGames(state, { view: 'recent' }).slice(0, 3);
  $('#continue-section').hidden =
    view !== 'library' || !noFilters || !recent.length;
  $('#continue-list').innerHTML = recent
    .map(
      (g) =>
        `<article class="continue-game"><img src="${esc(g.image)}" alt="" width="58" height="48"><div class="continue-copy"><strong>${esc(g.title)}</strong><small>${esc(timeAgo(state.recent.find((r) => r.id === g.id).at))}</small></div>${playButton(g, 'Play again')}</article>`,
    )
    .join('');
  $('.profile').innerHTML =
    `<span class="avatar">${esc(state.name.slice(0, 1).toLocaleUpperCase())}</span><span class="profile-label"><span class="profile-name">${esc(state.name)}</span><span class="profile-sub">Your personal arcade</span></span>${svg('grid')}`;
  const mainLink = $('.play-main');
  mainLink.toggleAttribute('target', state.newTab);
  if (state.newTab) mainLink.target = '_blank';
  mainLink.setAttribute(
    'aria-label',
    `Play Boost Circuit${state.newTab ? ', opens in a new tab' : ''}`,
  );
  $('#launch-note').textContent =
    `${state.newTab ? 'Opens in a new tab · ' : ''}No install`;
  document.title = `${view === 'library' ? 'Playdock' : view === 'favourites' ? 'Favourites' : 'Recently played'} — Your browser arcade`;
}
function closeNav() {
  $('#sidebar').classList.remove('open');
  $('#nav-shade').hidden = true;
  $('#nav-open').setAttribute('aria-expanded', 'false');
  $('#sidebar').removeAttribute('aria-modal');
  $('#sidebar').removeAttribute('role');
  $('#sidebar').inert = window.matchMedia('(max-width:767px)').matches;
  $('.app-shell').inert = false;
  document.body.style.overflow = '';
}
function setView(next, updateHash = true) {
  view = ['library', 'favourites', 'recent'].includes(next) ? next : 'library';
  genre = 'All';
  query = '';
  $('#search-input').value = '';
  if (updateHash) history.replaceState(null, '', `#${view}`);
  closeNav();
  render();
}
function openAdd() {
  $('#add-form').reset();
  $('#add-error').textContent = '';
  $('#add-dialog').showModal();
}
function openSettings() {
  $('#player-name').value = state.name;
  $('#new-tab').checked = state.newTab;
  $('#settings-dialog').showModal();
}
function details(id) {
  const g = allGames().find((g) => g.id === id);
  if (!g) return;
  detailId = id;
  $('#details-content').innerHTML =
    `<img class="detail-cover" src="${esc(g.image)}" alt=""><div class="dialog-heading"><div><p class="eyebrow">${esc(g.genre.toUpperCase())}</p><h2 id="detail-title">${esc(g.title)}</h2></div><button class="icon-button" data-close="details-dialog" aria-label="Close game details">${svg('close')}</button></div><div class="detail-tags">${g.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div><p>${esc(g.description)}</p>${g.access === 'Private prototype' ? '<p class="detail-access">This prototype requires an invited account. Opening it here does not change its sharing settings.</p>' : ''}${g.custom ? '<p class="detail-access">A link saved by you on this device. This game opens on its own website.</p>' : ''}<p class="detail-controls">${svg('game')} ${esc(g.controls)}</p><div class="dialog-actions detail-actions">${g.custom ? '<button type="button" class="text-button delete-link" id="remove-game">Remove from library</button>' : ''}<a class="button primary launch-link" ${launchAttrs(g)}>${svg('play')} Play game</a></div>`;
  $('#details-dialog').showModal();
}

// Navigation and games use native links; no embedded game frames are needed.
$('#search-form').addEventListener('submit', (e) => e.preventDefault());

document.addEventListener('click', (e) => {
  const b = e.target.closest('button,a');
  if (!b) return;
  if (b.tagName === 'A' && b.getAttribute('href') === '#library') {
    e.preventDefault();
    setView('library');
  }
  if (b.dataset.close) document.getElementById(b.dataset.close).close();
  if (b.dataset.view) setView(b.dataset.view);
  if (b.dataset.genre) {
    setView('library');
    genre = b.dataset.genre;
    render();
  }
  if (b.dataset.filter) {
    genre = b.dataset.filter;
    render();
  }
  if (b.dataset.details) details(b.dataset.details);
  if (b.dataset.favourite) {
    const id = b.dataset.favourite;
    const active = state.favourites.includes(id);
    state.favourites = active
      ? state.favourites.filter((x) => x !== id)
      : [...state.favourites, id];
    persist();
    render();
    document
      .querySelector(`[data-favourite="${CSS.escape(id)}"]`)
      ?.focus({ preventScroll: true });
    toast(active ? 'Removed from favourites' : 'Added to favourites');
  }
  if (b.classList.contains('launch-link')) {
    recordLaunch(state, b.dataset.game);
    persist();
    setTimeout(render, 0);
  }
  if (['add-game-top', 'add-game-bottom'].includes(b.id)) openAdd();
  if (['profile-button', 'privacy-button'].includes(b.id)) openSettings();
  if (b.id === 'reset-filters') {
    query = '';
    genre = 'All';
    $('#search-input').value = '';
    render();
  }
  if (b.id === 'empty-action') setView('library');
  if (b.id === 'show-recent') {
    setView('recent');
    $('#main').scrollIntoView({ block: 'start' });
  }
  if (b.id === 'remove-game') {
    state.custom = state.custom.filter((g) => g.id !== detailId);
    state.favourites = state.favourites.filter((x) => x !== detailId);
    state.recent = state.recent.filter((r) => r.id !== detailId);
    persist();
    $('#details-dialog').close();
    render();
    toast('Game removed from this device');
  }
  if (b.id === 'nav-open') {
    $('#sidebar').inert = false;
    $('#sidebar').classList.add('open');
    $('#nav-shade').hidden = false;
    b.setAttribute('aria-expanded', 'true');
    $('#sidebar').setAttribute('aria-modal', 'true');
    $('#sidebar').setAttribute('role', 'dialog');
    $('.app-shell').inert = true;
    document.body.style.overflow = 'hidden';
    $('#nav-close').focus();
  }
  if (b.id === 'nav-close') {
    closeNav();
    $('#nav-open').focus();
  }
  if (b.id === 'clear-history') {
    state.recent = [];
    persist();
    render();
    toast('Recently played cleared');
  }
});
$('#nav-shade').addEventListener('click', closeNav);
$('#search-input').addEventListener('input', (e) => {
  query = e.target.value;
  render();
});
$('#add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#game-title').value.trim(),
    url = safeGameUrl($('#game-url').value);
  if (!title || !url) {
    $('#add-error').textContent =
      'Please add a name and a valid HTTPS game link.';
    return;
  }
  if (state.custom.length >= 40) {
    $('#add-error').textContent =
      'Your library has 40 custom links. Remove a link before adding another.';
    return;
  }
  if (allGames().some((g) => g.url === url)) {
    $('#add-error').textContent = 'That link is already in your library.';
    return;
  }
  const id = 'custom-' + (crypto.randomUUID?.() || Date.now().toString(36));
  state.custom.push({
    id,
    title,
    url,
    genre: $('#game-genre').value,
    image: 'assets/custom.svg',
    description: 'A game from your personal collection.',
    access: 'Your link',
    tags: ['Custom link'],
    controls: 'See the game for controls',
    custom: true,
  });
  persist();
  $('#add-dialog').close();
  setView('library');
  toast('Game added to your collection');
});
$('#settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#player-name').value.trim();
  if (!name) {
    $('#player-name').setCustomValidity('Please enter a display name.');
    $('#player-name').reportValidity();
    return;
  }
  state.name = name;
  state.newTab = $('#new-tab').checked;
  persist();
  $('#settings-dialog').close();
  render();
  toast('Preferences saved on this device');
});
$('#player-name').addEventListener('input', (e) =>
  e.target.setCustomValidity(''),
);
for (const d of document.querySelectorAll('dialog'))
  d.addEventListener('click', (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  });
document.addEventListener('keydown', (e) => {
  if (
    e.key === '/' &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) &&
    !document.querySelector('dialog[open]')
  ) {
    e.preventDefault();
    $('#search-input').focus();
  }
  if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
    closeNav();
  }
  if (e.key === 'Tab' && $('#sidebar').classList.contains('open')) {
    const focusable = [...$('#sidebar').querySelectorAll('a,button')].filter(
      (n) => n.getClientRects().length,
    );
    const first = focusable[0],
      last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
window.addEventListener('hashchange', () =>
  setView(location.hash.slice(1), false),
);
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY || e.key === null) {
    state = loadState(storage);
    render();
  }
});
window
  .matchMedia('(min-width:768px)')
  .addEventListener('change', () => closeNav());
setView(location.hash.slice(1), false);
