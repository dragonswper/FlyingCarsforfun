import test from 'node:test';
import assert from 'node:assert/strict';
import {setupMatchmakingUI} from '../dist/matchmaking-ui.js';
import {setupPartyUI} from '../dist/party-ui.js';
class Element extends EventTarget {
  constructor() {
    super();
    Object.assign(this, {
      value: '',
      dataset: {},
      textContent: '',
      disabled: false,
      hidden: false,
      open: false
    });
  }
  showModal() {
    this.open = true;
  }
  click() {
    this.dispatchEvent(new Event('click'));
  }
}
const change = (node, value) => {
  node.value = value;
  node.dispatchEvent(new Event('change'));
};
test('the online menu lets users choose secure server and mode before searching, and saves their choices', () => {
  const ids = [
      'matchmaking-dialog',
      'matchmaking-search',
      'matchmaking-cancel',
      'matchmaking-clock',
      'matchmaking-progress',
      'matchmaking-remaining',
      'matchmaking-status',
      'matchmaking-detail',
      'matchmaking-preferences',
      'search-connection',
      'search-server-url',
      'search-server-field',
      'search-mode',
      'search-arena'
    ],
    nodes = Object.fromEntries(ids.map((id) => [id, new Element()])),
    fields = ['search-connection', 'search-mode', 'search-server-url','search-arena'].map((id) => nodes[id]);
  nodes['matchmaking-preferences'].querySelectorAll = () => fields;
  const preferences = {serverURL: 'https://arena.example'},
    root = {getElementById: (id) => nodes[id]};
  let searches = 0,
    saves = 0;
  const ui = setupMatchmakingUI({preferences, save: () => saves++, search: () => searches++}, root);
  ui.open();
  assert.equal(nodes['search-mode'].disabled, true);
  change(nodes['search-connection'], 'server');
  assert.equal(nodes['search-mode'].disabled, false);
  change(nodes['search-mode'], 'doubles');
  assert.equal(ui.selection().arena,'champions');
  change(nodes['search-arena'],'snow');
  assert.deepEqual(ui.selection(), {
    kind: 'server',
    mode: 'doubles',
    address: 'https://arena.example',
    arena: 'snow'
  });
  assert.equal(preferences.onlineMode, 'doubles');
  assert.equal(saves, 3);
  assert.equal(preferences.onlineArena,'snow');
  assert.equal(searches, 0);
  nodes['matchmaking-search'].click();
  assert.equal(searches, 1);
  ui.render({phase: 'searching', remaining: 59});
  assert.ok(fields.every((field) => field.disabled));
  ui.render({phase: 'cancelled'});
  assert.ok(fields.every((field) => !field.disabled));
  preferences.serverURL = 'https://other.example';
  ui.open();
  assert.equal(ui.selection().address, 'https://other.example');
});
test('private server mode selectors reach create/configure callbacks without changing browser-hosted mode', () => {
  const ids = [
      'party-connection',
      'party-server-url',
      'party-server-field',
      'party-mode-field',
      'party-mode',
      'party-arena',
      'party-live-arena',
      'party-create',
      'party-size',
      'party-time',
      'party-join-form',
      'party-invite-input',
      'party-team',
      'party-ready',
      'party-start',
      'party-configure',
      'party-live-mode',
      'party-live-size',
      'party-live-time',
      'party-leave',
      'party-dialog',
      'party-copy',
      'party-status'
    ],
    nodes = Object.fromEntries(ids.map((id) => [id, new Element()]));
  let created, configured;
  const ui = setupPartyUI(
    {create: (options) => (created = options), configure: (options) => (configured = options)},
    {getElementById: (id) => nodes[id]}
  );
  ui.useConnection('server', 'https://arena.example');
  assert.equal(nodes['party-mode-field'].hidden, false);
  nodes['party-mode'].value = 'training';
  nodes['party-size'].value = '4';
  nodes['party-time'].value = '5';
  nodes['party-arena'].value = 'city';
  nodes['party-create'].click();
  assert.deepEqual(created, {mode: 'training', maxPeople: 4, duration: 300,arena:'city'});
  nodes['party-live-mode'].value = 'duel';
  nodes['party-live-size'].value = '2';
  nodes['party-live-time'].value = '2';
  nodes['party-live-arena'].value = 'woods';
  nodes['party-configure'].click();
  assert.deepEqual(configured, {mode: 'duel', maxPeople: 2, duration: 120,arena:'woods'});
  ui.useConnection('peer');
  assert.equal(nodes['party-mode-field'].hidden, true);
});
