import {matchRules, RULE_CHOICES, botStyle} from '../match-rules.js';
import {BOT_STYLES} from '../bots.js';
export class MatchOptionsUI {
  constructor(settings, save) {
    this.settings = settings;
    this.forms = new Map();
    for (const [prefix, target] of [
      ['solo', document.getElementById('play-screen')],
      ['party', document.getElementById('party-setup')],
      ['live', document.getElementById('party-settings')],
    ]) {
      const details = document.createElement('details');
      details.className = 'mutator-options';
      const summary = document.createElement('summary');
      summary.textContent =
        prefix === 'solo'
          ? 'CUSTOM EXHIBITION RULES & BOT STYLE'
          : 'PRIVATE MATCH RULES & BOT STYLE';
      details.append(summary);
      const grid = document.createElement('div');
      grid.className = 'overdrive-fields';
      for (const [field, choices] of Object.entries(RULE_CHOICES)) {
        const l = document.createElement('label');
        l.textContent =
          field === 'scoreLimit' ? 'WIN CONDITION' : field.toUpperCase();
        const s = document.createElement('select');
        s.dataset.rule = field;
        s.id = prefix + '-rule-' + field;
        for (const [id, label] of Object.entries(choices))
          s.add(new Option(label, id));
        s.value = String(
          matchRules(
            prefix === 'solo' ? settings.matchRules : settings.privateRules,
          )[field],
        );
        l.append(s);
        grid.append(l);
      }
      const l = document.createElement('label');
      l.textContent = 'BOT PERSONALITY';
      const s = document.createElement('select');
      s.dataset.botStyle = '';
      s.id = prefix + '-bot-style';
      for (const [id, name] of Object.entries(BOT_STYLES))
        s.add(new Option(name, id));
      s.value = botStyle(settings.botStyle);
      l.append(s);
      grid.append(l);
      details.append(grid);
      const note = document.createElement('p');
      note.className = 'overdrive-note';
      note.textContent =
        prefix === 'solo'
          ? 'Changes apply to this local exhibition. Online matchmaking uses standard rules.'
          : 'Dedicated custom teams and Hoops support mutators. All players receive the same rules.';
      details.append(note);
      if (prefix === 'solo')
        target.insertBefore(details, document.getElementById('play-button'));
      else target.append(details);
      this.forms.set(prefix, details);
      details.addEventListener('change', () => {
        details.dataset.dirty = 'true';
        if (prefix === 'solo') {
          const extra = this.read('solo');
          settings.matchRules = extra.rules;
          settings.botStyle = extra.botStyle;
          save();
        }
      });
    }
  }
  read(prefix) {
    const root = this.forms.get(prefix),
      rules = {};
    for (const s of root.querySelectorAll('[data-rule]'))
      rules[s.dataset.rule] = s.value;
    return {
      rules: matchRules(rules),
      botStyle: botStyle(root.querySelector('[data-bot-style]').value),
    };
  }
  renderRoom(room) {
    const form = this.forms.get('live');
    if (!room) return;
    const own = room.canManage,
      playing = room.matchId && room.sim?.phase !== 'ended';
    for (const e of form.querySelectorAll('select'))
      e.disabled = !own || playing || !room.dedicated;
    const rules = matchRules(room.options.rules),
      current = this.read('live');
    if (JSON.stringify(rules) === JSON.stringify(current.rules))
      delete form.dataset.dirty;
    if (form.dataset.dirty || form.contains(document.activeElement)) return;
    for (const s of form.querySelectorAll('[data-rule]'))
      s.value = String(rules[s.dataset.rule]);
    form.querySelector('[data-bot-style]').value = botStyle(
      room.options.botStyle,
    );
  }
}
export class PartyQueueUI {
  constructor(settings, hooks) {
    this.settings = settings;
    this.hooks = hooks;
    this.panels = [];
    for (const target of [
      document.getElementById('lobby-party'),
      document.getElementById('party-lobby') ||
        document.getElementById('party-dialog'),
    ]) {
      const panel = document.createElement('section');
      panel.className = 'party-queue-panel';
      panel.hidden = true;
      panel.innerHTML =
        '<div><strong>PLAY TOGETHER</strong><span class="party-queue-status" role="status"></span></div><label><span class="sr-only">Party matchmaking mode</span><select class="party-queue-mode"><option value="doubles">2v2 DOUBLES</option><option value="hoops">2v2 HOOPS</option><option value="duel">1v1 DUEL · SOLO</option></select></label><button type="button" class="party-search">QUEUE TOGETHER</button><button type="button" class="party-search-cancel">CANCEL SEARCH</button>';
      panel.querySelector('.party-search').onclick = () => {
        const room = hooks.room();
        room?.queueParty(
          {
            mode: panel.querySelector('select').value,
            duration: 300,
            difficulty: settings.difficulty,
          },
          settings.network,
        );
      };
      panel.querySelector('.party-search-cancel').onclick = () =>
        hooks.room()?.cancelPartyQueue();
      target.append(panel);
      this.panels.push(panel);
    }
    this.returnButton = document.createElement('button');
    this.returnButton.id = 'return-to-party';
    this.returnButton.type = 'button';
    this.returnButton.textContent = 'BACK TO PARTY';
    this.returnButton.hidden = true;
    document.getElementById('result-dialog').append(this.returnButton);
    this.returnButton.onclick = () => hooks.room()?.returnParty();
  }
  render(room, sim, started) {
    const q = room?.squadQueue,
      searching = ['searching', 'preparing'].includes(q?.phase),
      owner = room?.squad ? room.squad.owner : room?.canManage,
      eligible =
        room?.members?.length <= 2 &&
        room.members.every((m) => m.connected && m.ready && m.team !== null),
      visible =
        room?.dedicated &&
        room.connected &&
        !room.closed &&
        (!started || sim.phase === 'ended') &&
        !room.matchmade;
    for (const panel of this.panels) {
      panel.hidden = !visible;
      if (!visible) continue;
      panel.querySelector('.party-search').disabled =
        !owner || !eligible || searching;
      panel.querySelector('.party-search-cancel').hidden = !searching;
      panel.querySelector('.party-search-cancel').disabled = !owner;
      panel.querySelector('select').disabled = searching || !owner;
      panel.querySelector('.party-queue-status').textContent = searching
        ? `${q.reason || 'Searching…'}${q.remaining ? ' · ' + q.remaining + 's' : ''}`
        : q?.phase === 'cancelled'
          ? q.reason
          : eligible
            ? 'Up to two ready drivers. Your party shares one team.'
            : 'Choose a team and Ready. Parties of three or more use private matches.';
    }
    const ended =
      started && sim?.phase === 'ended' && room?.dedicated && room.squad;
    this.returnButton.hidden = !ended;
    this.returnButton.disabled = !owner;
    if (ended) {
      const next = document.getElementById('next-match-button');
      next.disabled = !owner;
      next.textContent = owner
        ? 'FIND NEXT · KEEP PARTY'
        : 'WAITING FOR PARTY LEADER';
    }
  }
}
