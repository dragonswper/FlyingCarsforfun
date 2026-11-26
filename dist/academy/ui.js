import {Simulation} from '../physics.js';
import {AcademyDirector, academyProgress, practiceBall} from './director.js';
import {ACADEMY_PACKS, MEDAL_NAMES} from './catalog.js';
import {AcademyGuides} from './guides.js';
const storageKey = 'boost-circuit.academy.v1';
const read = () => {
  try {
    return academyProgress(
      JSON.parse(localStorage.getItem(storageKey) || '{}'),
    );
  } catch {
    return {};
  }
};
const node = (tag, text, className) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
};
const mount = (id, title, body, footer) => {
  const d = node('dialog', undefined, 'expansion-dialog');
  d.id = id;
  d.setAttribute('aria-labelledby', id + '-title');
  d.innerHTML = `<header class="expansion-heading"><div><span class="expansion-kicker">CIRCUIT ACADEMY · SOLO</span><h2 id="${id}-title">${title}</h2></div><button type="button" class="expansion-close" aria-label="Close">×</button></header><div class="expansion-body">${body}</div><footer class="expansion-footer">${footer}</footer>`;
  d.querySelector('.expansion-close').onclick = () => d.close();
  document.body.append(d);
  return d;
};
export class AcademyUI {
  constructor(view, hooks) {
    this.hooks = hooks;
    this.view = view;
    this.progress = read();
    this.director = null;
    this.guides = new AcademyGuides(view.scene);
    this.path = true;
    this.launching = false;
    this.generation = 0;
    this.catalog = mount(
      'academy-dialog',
      'Make every touch count',
      '<p class="expansion-description">24 original drills. Pick a pack, chase a gold medal, and retry at your own pace. Progress stays on this browser.</p><div class="academy-packs"></div><p class="expansion-status" role="status"></p>',
      '<button type="button" class="academy-free">FREE PLAY TOOLS</button><button type="button" class="academy-back">BACK</button>',
    );
    this.catalog.querySelector('.academy-back').onclick = () =>
      this.catalog.close();
    this.catalog.querySelector('.academy-free').onclick = () => this.launch();
    this.result = mount(
      'academy-result',
      'Drill complete',
      '<div class="academy-medal" aria-hidden="true">◇</div><p class="academy-result-copy"></p><p class="academy-result-best"></p>',
      '<button type="button" class="academy-retry">RETRY</button><button type="button" class="academy-next primary">NEXT DRILL</button><button type="button" class="academy-exit">PACKS</button>',
    );
    this.result.querySelector('.academy-retry').onclick = () => this.retry();
    this.result.querySelector('.academy-next').onclick = () => this.next();
    this.result.querySelector('.academy-exit').onclick = () => this.exit();
    this.result.addEventListener('close', () => {
      if (this.active && this.director.status === 'result') this.exit();
    });
    this.tools = mount(
      'practice-dialog',
      'Free play toolbox',
      '<p class="expansion-description">Solo practice only. Set up the next touch without restarting the field.</p><div class="practice-actions"><button type="button" data-ball="pass">PASS TO ME<small>A ground pass toward your car</small></button><button type="button" data-ball="pop">POP IT UP<small>Set up a rising aerial</small></button><button type="button" data-ball="defend">DEFEND A SHOT<small>Return to the blue goal first</small></button><button type="button" data-ball="freeze">STOP BALL<small>Remove the ball’s current velocity</small></button></div><label class="academy-toggle"><input type="checkbox" class="practice-path" checked> SHOW BALL PATH <small>A three-second preview without car contacts</small></label>',
      '<button type="button" class="practice-resume primary">BACK TO FIELD</button>',
    );
    this.tools.querySelectorAll('[data-ball]').forEach(
      (b) =>
        (b.onclick = () => {
          if (practiceBall(hooks.getSim(), b.dataset.ball)) {
            hooks.resetView();
            this.tools.close();
            hooks.resume();
          }
        }),
    );
    this.tools.querySelector('.practice-path').onchange = (e) =>
      (this.path = e.target.checked);
    this.tools.querySelector('.practice-resume').onclick = () => {
      this.tools.close();
      hooks.resume();
    };
    this.tools.addEventListener('close', () => {
      if (!this.active && hooks.isPlaying() && !hooks.isOnline())
        hooks.resume();
    });
    this.hud = node('div', undefined, 'academy-hud');
    this.hud.id = 'academy-hud';
    this.hud.hidden = true;
    this.hud.innerHTML = '<strong></strong><span></span><small></small>';
    document.getElementById('hud').append(this.hud);
    const launch = node(
      'button',
      'TRAINING ACADEMY · 24 DRILLS',
      'academy-entry',
    );
    launch.type = 'button';
    launch.id = 'academy-button';
    document
      .getElementById('play-screen')
      .insertBefore(launch, document.getElementById('play-button'));
    launch.onclick = () => this.open();
    this.toolsButton = node('button', 'TOOLS', 'practice-tools-button');
    this.toolsButton.type = 'button';
    this.toolsButton.id = 'practice-tools-button';
    document.getElementById('practice-tools').append(this.toolsButton);
    this.toolsButton.onclick = () => this.openTools();
    this.retryButton = node('button', 'RETRY DRILL', 'academy-retry-hud');
    this.retryButton.type = 'button';
    this.retryButton.id = 'academy-retry-button';
    this.retryButton.hidden = true;
    document.getElementById('practice-tools').append(this.retryButton);
    this.retryButton.onclick = () => this.retry();
    const pause = node('button', 'ACADEMY / PRACTICE TOOLS');
    pause.id = 'pause-practice';
    pause.type = 'button';
    document.getElementById('pause-dialog').append(pause);
    pause.onclick = () => (this.active ? this.exit() : this.openTools());
    this.pauseButton = pause;
    this.renderCatalog();
  }
  get active() {
    return !!this.director;
  }
  record(progress) {
    this.progress = academyProgress(progress);
    this.hooks.onRecord?.(this.progress);
    try {
      localStorage.setItem(storageKey, JSON.stringify(this.progress));
    } catch {}
  }
  renderCatalog() {
    const list = this.catalog.querySelector('.academy-packs');
    list.replaceChildren();
    for (const pack of ACADEMY_PACKS) {
      const card = node('section', undefined, 'academy-pack');
      card.append(
        node('span', pack.level, 'expansion-kicker'),
        node('h3', pack.name),
        node('p', pack.description),
      );
      const drills = node('div', undefined, 'academy-drills');
      for (const [i, d] of pack.drills.entries()) {
        const r = this.progress[d.key],
          b = node('button');
        b.type = 'button';
        b.dataset.drill = d.key;
        b.append(
          node('strong', `${i + 1}. ${d.name}`),
          node(
            'small',
            r?.medal
              ? `${MEDAL_NAMES[r.medal]} · ${r.best.toFixed(2)}s`
              : 'NO MEDAL YET',
          ),
        );
        b.onclick = () => this.launch(pack.id, i);
        drills.append(b);
      }
      card.append(drills);
      list.append(card);
    }
  }
  open() {
    if (this.hooks.isOnline()) return;
    this.renderCatalog();
    this.catalog.querySelector('.expansion-status').textContent = '';
    this.catalog.showModal();
  }
  async launch(pack = null, index = 0) {
    if (this.launching || this.hooks.isOnline()) return;
    this.launching = true;
    const generation = ++this.generation;
    const status = this.catalog.querySelector('.expansion-status');
    status.textContent = 'Preparing your field…';
    this.catalog.setAttribute('aria-busy', 'true');
    try {
      // The start hook checks ownership after asynchronous asset preparation.
      const sim = new Simulation({mode: 'free', arena: this.hooks.arena()});
      await this.guides.prepare();
      if (generation !== this.generation || this.hooks.isOnline()) return;
      if (
        !(await this.hooks.launch(
          sim,
          () => generation === this.generation && !this.hooks.isOnline(),
        ))
      )
        return;
      if (pack)
        this.director = new AcademyDirector(sim, {
          pack,
          index,
          progress: this.progress,
          onRecord: (p) => this.record(p),
        });
      if (
        this.director &&
        ['route', 'recover'].includes(this.director.drill.objective)
      )
        this.hooks.carCamera?.();
      this.hooks.resetView();
      this.catalog.close();
      this.renderHUD();
      if (!pack) this.openTools();
    } catch {
      status.textContent =
        'The practice field could not load. Please try again.';
    } finally {
      this.launching = false;
      this.catalog.removeAttribute('aria-busy');
    }
  }
  worldChanged(sim) {
    if (this.director?.sim !== sim) {
      this.director = null;
      this.hud.hidden = true;
      this.guides.hide();
    }
    this.toolsButton.hidden = sim.options.mode !== 'free';
    this.retryButton.hidden = !this.active;
    this.pauseButton.hidden = !['free', 'training'].includes(sim.options.mode);
  }
  clear() {
    this.generation++;
    this.director = null;
    this.hud.hidden = true;
    this.guides.hide();
    this.result.close();
    this.tools.close();
  }
  retry() {
    if (!this.active) return;
    this.director.reset();
    this.result.close();
    this.hooks.resetView();
    this.hooks.resume();
    this.renderHUD();
  }
  next() {
    if (!this.active) return;
    if (!this.director.next()) {
      this.exit();
      return;
    }
    this.result.close();
    this.hooks.resetView();
    this.hooks.resume();
    this.renderHUD();
  }
  exit() {
    this.director = null;
    this.result.close();
    this.hud.hidden = true;
    this.guides.hide();
    this.hooks.leave();
    this.open();
  }
  openTools() {
    if (
      this.hooks.isOnline() ||
      this.active ||
      this.hooks.getSim()?.options.mode !== 'free'
    )
      return;
    this.hooks.pause();
    this.tools.showModal();
  }
  action(name) {
    if (!this.active) return false;
    if (name === 'reset') {
      this.retry();
      return true;
    }
    if (name === 'next') {
      this.next();
      return true;
    }
    return false;
  }
  canStep() {
    return !this.active || this.director.status === 'running';
  }
  step(dt) {
    if (!this.active) return;
    this.director.step(dt);
    if (this.director.status === 'result' && !this.result.open) {
      const d = this.director,
        r = d.outcome;
      this.hooks.clearInput();
      this.result.querySelector('h2').textContent = r.success
        ? MEDAL_NAMES[r.medal] + ' MEDAL'
        : 'Give it another run';
      this.result.querySelector('.academy-medal').dataset.medal = r.medal;
      this.result.querySelector('.academy-result-copy').textContent =
        `${d.drill.name} · ${r.success ? r.seconds.toFixed(2) + ' seconds' : 'Attempt ended'}`;
      this.result.querySelector('.academy-result-best').textContent = r.success
        ? 'Best: ' +
          this.progress[d.drill.key].best.toFixed(2) +
          's · Gold target: ' +
          d.drill.par +
          's'
        : d.drill.tip;
      this.result.querySelector('.academy-next').textContent =
        d.index === 3 ? 'FINISH PACK' : 'NEXT DRILL';
      this.result.showModal();
    }
  }
  renderHUD() {
    const hint = document.querySelector('#practice-tools > span');
    if (hint?.lastChild)
      hint.lastChild.textContent = this.active
        ? ' TO RETRY DRILL'
        : ' TO RESET BALL';
    this.hud.hidden = !this.active;
    this.retryButton.hidden = !this.active;
    this.toolsButton.hidden =
      this.active || this.hooks.getSim()?.options.mode !== 'free';
    if (!this.active) return;
    const d = this.director;
    this.hud.querySelector('strong').textContent =
      `${d.pack.name} · ${d.index + 1} / 4`;
    this.hud.querySelector('span').textContent =
      `${d.drill.name} · ${Math.ceil(d.drill.limit - d.time)}s${d.drill.checkpoints ? ' · GATE ' + Math.min(d.checkpoint + 1, d.drill.checkpoints.length) + ' / ' + d.drill.checkpoints.length : ''}`;
    this.hud.querySelector('small').textContent = d.drill.tip;
  }
  draw(sim, enabled) {
    if (!enabled) {
      this.guides.hide();
      return;
    }
    this.guides.update(sim, this.director, this.path);
  }
  dispose() {
    this.clear();
    this.guides.dispose();
    for (const d of [this.catalog, this.result, this.tools]) d.remove();
    this.hud.remove();
  }
  state() {
    return this.director?.state() ?? null;
  }
}

export {mount as expansionDialog, node as uiNode};
