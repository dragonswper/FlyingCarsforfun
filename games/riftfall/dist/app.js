/* UI and launcher bridge. The 3D simulation is in world.js. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'flyingcars.riftfall.settings.v1';
  const defaults = { outfit: 'violet', mode: 'skirmish', sensitivity: 1, quality: 'high', audio: true, best: 0 };
  let settings = { ...defaults };
  try { settings = { ...settings, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; } catch { /* Storage is optional, including in private embeds. */ }
  if (!['violet', 'mint', 'ember'].includes(settings.outfit)) settings.outfit = defaults.outfit;
  if (!['skirmish', 'practice'].includes(settings.mode)) settings.mode = defaults.mode;
  if (!['high', 'low'].includes(settings.quality)) settings.quality = defaults.quality;
  settings.sensitivity = Math.max(.25, Math.min(2, Number(settings.sensitivity) || 1));
  settings.audio = settings.audio !== false;
  settings.best = Math.max(0, Number(settings.best) || 0);
  let world, active = false, paused = false, lastState = null, lockedBefore = false, audioContext, noticeTimer;
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Play remains available without storage. */ } };
  const setText = (id, value) => { if ($(id)) $(id).textContent = String(value); };
  const show = (id, visible) => { if ($(id)) $(id).hidden = !visible; };
  const formatTime = seconds => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
  const outfitNames = { violet: 'Violet Vanguard', mint: 'Mint Marauder', ember: 'Ember Runner' };
  let parentOrigin = location.origin;
  const requestedParentOrigin = new URLSearchParams(location.search).get('parentOrigin');
  if (requestedParentOrigin) {
    try {
      const candidate = new URL(requestedParentOrigin);
      if (['https:', 'http:'].includes(candidate.protocol) && candidate.origin === requestedParentOrigin) parentOrigin = candidate.origin;
    } catch { /* Invalid parent origins cannot enable cross-origin commands. */ }
  }
  function notifyParent(type, detail = {}) {
    if (window.parent !== window && parentOrigin !== 'null') window.parent.postMessage({ type, version: 1, ...detail }, parentOrigin);
  }
  function notice(message) {
    setText('notice', message);
    show('notice', true);
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => show('notice', false), 3000);
  }
  function unlock() { if (document.pointerLockElement) document.exitPointerLock?.(); }
  function openDialog(id) {
    const dialog = $(id);
    if (dialog && !dialog.open) dialog.showModal();
  }
  function closeDialog(id) { const dialog = $(id); if (dialog?.open) dialog.close(); }
  function closeAllDialogs() { document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); }
  function syncSettings() {
    $('mode-select').value = settings.mode;
    $('sensitivity').value = settings.sensitivity;
    $('quality').value = settings.quality;
    $('audio-toggle').checked = settings.audio;
    setText('selected-outfit-name', outfitNames[settings.outfit]);
    setText('best-score', settings.best.toLocaleString());
    setText('mode-description', settings.mode === 'practice' ? 'Learn the island. Respawning targets, no incoming fire, and no storm.' : 'Seven bots. One survivor. Build, move, and beat the storm.');
    document.querySelectorAll('[data-outfit]').forEach(button => {
      const selected = button.dataset.outfit === settings.outfit;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      const label = button.querySelector('.outfit-select-label');
      if (label) label.textContent = selected ? 'SELECTED' : 'SELECT OUTFIT';
    });
  }
  function initializeAudio() {
    if (!settings.audio) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch { /* Audio is optional. */ }
  }
  function sound(kind) {
    if (!settings.audio || !audioContext || audioContext.state !== 'running') return;
    const params = { shot: [100, 36, .055, .035], hit: [640, 220, .09, .04], hurt: [110, 60, .13, .045], build: [240, 480, .12, .04], pickup: [500, 950, .16, .035] }[kind];
    if (!params) return;
    try {
      const [start, end, duration, volume] = params;
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(), now = audioContext.currentTime;
      oscillator.type = kind === 'shot' ? 'sawtooth' : 'triangle';
      oscillator.frequency.setValueAtTime(start, now);
      oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(now); oscillator.stop(now + duration);
    } catch { /* Game simulation must continue if an audio device disappears. */ }
  }
  function effect(kind) {
    sound(kind);
    if (kind === 'hit') {
      show('hit-marker', true);
      setTimeout(() => show('hit-marker', false), 110);
    }
    if (kind === 'hurt') {
      document.body.classList.remove('taking-damage');
      void document.body.offsetWidth;
      document.body.classList.add('taking-damage');
      setTimeout(() => document.body.classList.remove('taking-damage'), 250);
    }
  }
  function drawMinimap(state) {
    const canvas = $('minimap'), ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const size = canvas.width, middle = size / 2, scale = size / 150;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0d2645'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#315f57'; ctx.beginPath(); ctx.arc(middle, middle, 66 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8e6aff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(middle, middle, Math.max(1, Number(state.stormRadius) || 65) * scale, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f8c775';
    for (const bot of state.bots || []) { ctx.beginPath(); ctx.arc(middle + bot.x * scale, middle + bot.z * scale, 2.5, 0, Math.PI * 2); ctx.fill(); }
    if (state.position) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1df0d5'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(middle + state.position.x * scale, middle + state.position.z * scale, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  function updateHUD(state) {
    lastState = state;
    for (const [id, value] of Object.entries({ 'health-value': Math.ceil(state.health), 'shield-value': Math.ceil(state.shield), 'ammo-value': state.ammo, 'reserve-value': state.reserve, 'wood-value': state.wood, 'kills-value': state.kills, 'remaining-value': state.remaining, 'storm-time': state.mode === 'practice' ? 'NO STORM' : state.stormSeconds > 0 ? formatTime(state.stormSeconds) : 'CLOSING', 'mode-label': state.mode === 'practice' ? 'PRACTICE ISLAND' : 'SOLO SKIRMISH' })) setText(id, value);
    if ($('health-fill')) $('health-fill').style.width = `${Math.max(0, Math.min(100, state.health))}%`;
    if ($('shield-fill')) $('shield-fill').style.width = `${Math.max(0, Math.min(100, state.shield))}%`;
    show('build-indicator', Boolean(state.building));
    setText('build-indicator', `${String(state.buildType || 'wall').toUpperCase()} · 20 WOOD · E SWITCH · F ROTATE`);
    show('reload-indicator', Boolean(state.reloading));
    drawMinimap(state);
  }
  function pauseMatch() {
    if (!active || paused) return;
    paused = true; world.pause(); unlock();
    show('click-to-play', false);
    openDialog('pause-dialog');
    notifyParent('riftfall:paused');
  }
  function resumeMatch() {
    if (!active) return;
    closeAllDialogs(); paused = false; world.resume();
    show('click-to-play', true);
    notifyParent('riftfall:resumed');
  }
  function returnToLobby() {
    active = false; paused = false; unlock(); closeAllDialogs(); world.stop();
    show('match-hud', false); show('click-to-play', false); show('lobby', true);
    syncSettings();
    notifyParent('riftfall:exit');
  }
  function endMatch(result) {
    if (!active) return;
    active = false; paused = false; unlock(); closeAllDialogs();
    settings.best = Math.max(settings.best, result.score || 0); save();
    show('click-to-play', false);
    setText('result-title', result.mode === 'practice' ? 'PRACTICE COMPLETE' : result.won ? 'VICTORY!' : 'MATCH COMPLETE');
    setText('result-detail', result.won ? 'The island is yours. Ready for another drop?' : 'Every drop is another chance. Keep moving and use cover.');
    setText('result-kills', result.kills); setText('result-score', (result.score || 0).toLocaleString()); setText('result-time', formatTime(result.elapsed));
    openDialog('result-dialog');
    notifyParent('riftfall:match-end', { result: { won: Boolean(result.won), kills: result.kills, score: result.score, elapsed: result.elapsed, mode: result.mode } });
  }
  function startMatch() {
    initializeAudio(); closeAllDialogs();
    active = true; paused = false; lockedBefore = false;
    show('lobby', false); show('match-hud', true); show('click-to-play', true);
    try {
      world.start({ ...settings });
      notifyParent('riftfall:match-start', { mode: settings.mode });
      notice(settings.mode === 'practice' ? 'Practice island · targets respawn · no storm' : 'Seven rivals. One island. Stay inside the storm circle.');
    } catch (error) { active = false; fatal(error); }
  }
  function fatal(error) {
    console.error(error);
    show('loading-screen', false); show('error-panel', true);
    if ($('error-detail')) $('error-detail').textContent = 'The 3D renderer could not start. Enable graphics acceleration in your browser and reload. ' + (error?.message || '');
  }

  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog(button.dataset.close)));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog && dialog.id !== 'pause-dialog' && dialog.id !== 'result-dialog') dialog.close(); }));
  document.querySelectorAll('[data-outfit]').forEach(button => button.addEventListener('click', () => {
    settings.outfit = button.dataset.outfit; save(); syncSettings(); world?.setOutfit(settings.outfit);
  }));
  $('ready-button').addEventListener('click', startMatch);
  $('replay-button').addEventListener('click', startMatch);
  $('return-button').addEventListener('click', returnToLobby);
  $('leave-button').addEventListener('click', returnToLobby);
  $('resume-button').addEventListener('click', resumeMatch);
  $('pause-button').addEventListener('click', pauseMatch);
  $('locker-button').addEventListener('click', () => openDialog('locker-dialog'));
  $('settings-button').addEventListener('click', () => openDialog('settings-dialog'));
  $('howto-button').addEventListener('click', () => openDialog('controls-dialog'));
  $('pause-settings-button').addEventListener('click', () => { closeDialog('pause-dialog'); openDialog('settings-dialog'); });
  $('settings-dialog').addEventListener('close', () => { if (active && paused) openDialog('pause-dialog'); });
  $('pause-dialog').addEventListener('cancel', event => { event.preventDefault(); resumeMatch(); });
  $('result-dialog').addEventListener('cancel', event => { event.preventDefault(); returnToLobby(); });
  $('mode-select').addEventListener('change', event => { settings.mode = event.target.value; save(); syncSettings(); });
  for (const id of ['sensitivity', 'quality', 'audio-toggle']) $(id).addEventListener('input', () => {
    settings.sensitivity = Number($('sensitivity').value); settings.quality = $('quality').value; settings.audio = $('audio-toggle').checked;
    save(); world?.setSettings(settings); initializeAudio();
  });
  $('fullscreen-button').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { notice('Fullscreen is unavailable in this launcher. Try opening the game in a browser tab.'); }
  });
  document.addEventListener('keydown', event => {
    if (event.code === 'Escape' && active && !paused) { event.preventDefault(); pauseMatch(); }
  }, true);
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === $('game-canvas');
    show('click-to-play', active && !paused && !locked);
    if (!locked && lockedBefore && active && !paused) pauseMatch();
    lockedBefore = locked;
  });
  window.addEventListener('blur', () => { if (active && !paused) pauseMatch(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseMatch(); });
  window.addEventListener('message', event => {
    if (window.parent === window || event.source !== window.parent || event.origin !== parentOrigin || !event.data || event.data.version !== 1) return;
    if (event.data.type === 'riftfall:pause') pauseMatch();
    if (event.data.type === 'riftfall:resume' && active && paused) resumeMatch();
    if (event.data.type === 'riftfall:stop' && (active || $('lobby').hidden)) returnToLobby();
  });
  window.addEventListener('pagehide', () => { world?.dispose(); audioContext?.close().catch(() => {}); });

  syncSettings();
  try {
    if (!window.BABYLON || !window.RiftWorld) throw new Error('Game files are missing. Run npm install and npm run vendor.');
    world = new window.RiftWorld($('game-canvas'), { onState: updateHUD, onEnd: endMatch, onNotice: notice, onEffect: effect });
    world.setOutfit(settings.outfit); world.setSettings(settings);
    show('loading-screen', false);
    notifyParent('riftfall:ready', { capabilities: ['solo-bots', 'practice', 'building', 'pause', 'resume'] });
    // Read-only state lets launcher diagnostics and browser QA observe, without controlling the simulation.
    Object.defineProperty(window, 'riftfall', { value: Object.freeze({ getState: () => lastState ? structuredClone(lastState) : null, version: '0.1.0' }) });
  } catch (error) { fatal(error); }
})();
