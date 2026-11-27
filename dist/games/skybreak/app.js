/* UI and launcher bridge. The 3D simulation is in world.js. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'flyingcars.skybreak.settings.v1';
  const defaults = { outfit: 'violet', mode: 'skirmish', sensitivity: 1, quality: 'high', audio: true, fps: false, best: 0, xp: 0, matches: 0, wins: 0, kills: 0, maxBuilds: 0, history: [] };
  let settings = { ...defaults };
  try { settings = { ...settings, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; } catch { /* Storage is optional, including in private embeds. */ }
  if (!['violet', 'mint', 'ember'].includes(settings.outfit)) settings.outfit = defaults.outfit;
  if (!['skirmish', 'practice', 'skybreak'].includes(settings.mode)) settings.mode = defaults.mode;
  if (!['high', 'low'].includes(settings.quality)) settings.quality = defaults.quality;
  settings.sensitivity = Math.max(.25, Math.min(2, Number(settings.sensitivity) || 1));
  settings.audio = settings.audio !== false;
  settings.best = Math.max(0, Number(settings.best) || 0);
  for(const key of ['xp','matches','wins','kills','maxBuilds']) settings[key]=Math.max(0,Math.min(1e9,Number(settings[key])||0));
  settings.history=Array.isArray(settings.history)?settings.history.filter(x=>x&&typeof x==='object').slice(0,8):[];
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
    $('fps-toggle').checked = Boolean(settings.fps);
    setText('profile-level',String(1+Math.floor(settings.xp/1000)).padStart(2,'0'));setText('profile-xp',`${settings.xp.toLocaleString()} XP`);
    $('xp-fill').style.width=`${settings.xp%1000/10}%`;
    setText('quest-explore',settings.matches?'COMPLETE · First drop recorded':'Complete your first drop.');
    setText('quest-build',settings.maxBuilds>=5?'COMPLETE · Builder instinct':`${Math.min(5,settings.maxBuilds)} / 5 structures in one match`);
    setText('quest-win',settings.wins?'COMPLETE · Island champion':'Win a solo skirmish.');
    document.querySelectorAll('[data-mode]').forEach(b=>{const selected=b.dataset.mode===settings.mode;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    setText('selected-outfit-name', outfitNames[settings.outfit]);
    setText('best-score', settings.best.toLocaleString());
    setText('mode-description', settings.mode === 'skybreak' ? 'Eight targets. Three minutes. Build your route and set your best score.' : settings.mode === 'practice' ? 'Explore, build, and learn. Respawning targets, no storm, no pressure.' : 'Seven bots. One survivor. Build, move, and beat the storm.');
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
  function drawMinimap(state, id='minimap') {
    const canvas = $(id), ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const size = canvas.width, middle = size / 2, scale = size / 150;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0d2645'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#315f57'; ctx.beginPath(); ctx.arc(middle, middle, 66 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8e6aff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(middle, middle, Math.max(1, state.mode==='skirmish' ? Number(state.stormRadius)||65 : 74) * scale, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle='#c0b18c';
    for(const [x,z] of [[-24,15],[23,24],[27,-27]])ctx.fillRect(middle+(x-4)*scale,middle-(z+3.5)*scale,8*scale,7*scale);
    ctx.strokeStyle='#99a774';ctx.lineWidth=4*scale;
    for(const z of [-26,0,26]){ctx.beginPath();ctx.moveTo(middle-45*scale,middle-z*scale);ctx.lineTo(middle+45*scale,middle-z*scale);ctx.stroke();}
    ctx.fillStyle = '#ffae94';
    for (const bot of state.mode==='skybreak' ? state.targets||[] : state.bots || []) { ctx.beginPath(); ctx.arc(middle + bot.x * scale, middle - bot.z * scale, 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle='#a5edf4';
    for(const b of state.structures||[])ctx.fillRect(middle+b.x*scale-1.5,middle-b.z*scale-1.5,3,3);
    if (state.position) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1df0d5'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(middle + state.position.x * scale, middle - state.position.z * scale, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.save();ctx.translate(middle+state.position.x*scale,middle-state.position.z*scale);ctx.rotate(state.yaw||0);ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(-4,-3);ctx.lineTo(4,-3);ctx.closePath();ctx.fill();ctx.restore();
    }
  }
  function updateHUD(state) {
    lastState = state;
    for (const [id, value] of Object.entries({ 'health-value': Math.ceil(state.health), 'shield-value': Math.ceil(state.shield), 'ammo-value': state.ammo, 'reserve-value': state.reserve, 'wood-value': state.wood, 'kills-value': state.kills, 'remaining-value': state.remaining, 'storm-time': state.mode === 'practice' ? 'NO STORM' : state.stormSeconds > 0 ? formatTime(state.stormSeconds) : 'CLOSING', 'mode-label': state.mode === 'skybreak' ? 'SKYBREAK RUN' : state.mode === 'practice' ? 'PRACTICE ISLAND' : 'SOLO SKIRMISH' })) setText(id, value);
    if ($('health-fill')) $('health-fill').style.width = `${Math.max(0, Math.min(100, state.health))}%`;
    if ($('shield-fill')) $('shield-fill').style.width = `${Math.max(0, Math.min(100, state.shield))}%`;
    show('build-indicator', Boolean(state.building));
    setText('build-indicator', `${String(state.buildType || 'wall').toUpperCase()} · 20 WOOD · E SWITCH · F ROTATE`);
    setText('weapon-label',state.building?'BLUEPRINT':state.weapon==='pickaxe'?'HARVESTING TOOL':state.weapon==='shotgun'?'SCATTER SHOTGUN':'RIFT RIFLE');
    if(state.weapon==='pickaxe') {setText('ammo-value','∞');setText('reserve-value','WOOD');}
    document.querySelectorAll('[data-slot]').forEach(el=>el.classList.toggle('selected',!state.building&&el.dataset.slot===state.weapon));
    document.querySelectorAll('[data-piece]').forEach(el=>el.classList.toggle('selected',state.building&&el.dataset.piece===state.buildType));
    const heading=((state.yaw*180/Math.PI)%360+360)%360;
    const direction=['N','NE','E','SE','S','SW','W','NW'][Math.round(heading/45)%8];
    setText('compass',`W · NW · ${direction}  ${Math.round(heading).toString().padStart(3,'0')} · NE · E`);
    setText('match-objective',state.mode==='skybreak'?`SKYBREAK RUN  /  ${state.targetsHit} OF 8 TARGETS  /  ${formatTime(180-state.elapsed)}`:state.mode==='practice'?`FREE PRACTICE  /  ${state.kills} TARGETS  /  ${state.builds} BUILDS`:`SOLO SKIRMISH  /  ${state.remaining} REMAINING`);
    show('finish-practice',state.mode==='practice');
    show('fps',Boolean(settings.fps));if(settings.fps)setText('fps',`${Math.round(world?.engine.getFps()||0)} FPS`);
    if($('map-dialog').open)drawMinimap(state,'large-map');
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
    settings.best = Math.max(settings.best, result.score || 0);
    settings.xp+=Math.max(0,result.score||0);settings.matches++;settings.kills+=result.kills||0;
    if(result.won&&result.mode==='skirmish')settings.wins++;
    settings.maxBuilds=Math.max(settings.maxBuilds,lastState?.builds||0);
    settings.history.unshift({mode:result.mode,won:result.won,score:result.score||0,elapsed:result.elapsed||0});settings.history=settings.history.slice(0,8);save();
    show('click-to-play', false);
    setText('result-title', result.mode==='skybreak'?(result.won?'SKYBREAK CLEARED!':'TIME’S UP'):result.mode === 'practice' ? 'PRACTICE COMPLETE' : result.won ? 'VICTORY!' : 'MATCH COMPLETE');
    setText('result-detail', result.mode==='skybreak'?`${result.targetsHit||0} / 8 targets · ${Math.floor(result.elapsed)} seconds · Try a faster route next time.`:result.mode==='practice'?'Good practice. Your next drop is waiting.':result.won?'The island is yours. Ready for another drop?':'Every drop is another chance. Keep moving and use cover.');
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
      notice(settings.mode==='skybreak'?'Eight targets. Three minutes. Find your line.':settings.mode === 'practice' ? 'Practice island · targets respawn · no storm' : 'Seven rivals. One island. Stay inside the storm circle.');
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
  for (const id of ['sensitivity', 'quality', 'audio-toggle', 'fps-toggle']) $(id).addEventListener('input', () => {
    settings.sensitivity = Number($('sensitivity').value); settings.quality = $('quality').value; settings.audio = $('audio-toggle').checked; settings.fps = $('fps-toggle').checked;
    save(); world?.setSettings(settings); initializeAudio();
  });
  $('fullscreen-button').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { notice('Fullscreen is unavailable in this launcher. Try opening the game in a browser tab.'); }
  });
  document.addEventListener('keydown', event => {
    if(event.code==='KeyM'&&active&&!event.repeat) {
      event.preventDefault();if($('map-dialog').open){closeDialog('map-dialog');}else if(!paused){paused=true;world.pause();unlock();show('click-to-play',false);openDialog('map-dialog');if(lastState)drawMinimap(lastState,'large-map');}return;
    }
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

  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{settings.mode=b.dataset.mode;save();syncSettings();}));
  $('challenge-button').addEventListener('click',()=>{settings.mode='skybreak';save();syncSettings();notice('Skybreak challenge selected. Press DROP IN when ready.');});
  $('credits-button').addEventListener('click',()=>openDialog('credits-dialog'));
  $('career-button').addEventListener('click',()=>{
    setText('career-matches',settings.matches);setText('career-wins',settings.wins);setText('career-kills',settings.kills);
    const list=$('match-history');list.replaceChildren();
    if(!settings.history.length)list.textContent='Your first chapter starts with a drop.';
    for(const entry of settings.history){const row=document.createElement('div');row.className='history-row';const label=document.createElement('strong'),score=document.createElement('span');label.textContent=entry.mode==='skybreak'?'SKYBREAK RUN':entry.mode==='practice'?'FREE PRACTICE':'SOLO SKIRMISH';score.textContent=`${entry.won?'★ ':''}${Math.max(0,Number(entry.score)||0).toLocaleString()} XP · ${formatTime(Number(entry.elapsed)||0)}`;row.append(label,score);list.append(row);}
    openDialog('career-dialog');
  });
  $('finish-practice').addEventListener('click',()=>{if(active&&settings.mode==='practice')world.finish(false);});
  $('map-dialog').addEventListener('close',()=>{if(active&&paused)resumeMatch();});
  syncSettings();
  try {
    if (!window.BABYLON || !window.RiftWorld) throw new Error('Game files are missing. Run npm install and npm run vendor.');
    world = new window.RiftWorld($('game-canvas'), { onState: updateHUD, onEnd: endMatch, onNotice: notice, onEffect: effect });
    world.setOutfit(settings.outfit); world.setSettings(settings);
    show('loading-screen', false);
    notifyParent('riftfall:ready', { capabilities: ['solo-bots', 'practice', 'skybreak', 'building', 'pause', 'resume'] });
    // Read-only state lets launcher diagnostics and browser QA observe, without controlling the simulation.
    Object.defineProperty(window, 'riftfall', { value: Object.freeze({ getState: () => lastState ? structuredClone(lastState) : null, version: '0.2.0' }) });
  } catch (error) { fatal(error); }
})();
