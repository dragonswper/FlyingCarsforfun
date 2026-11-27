import assert from 'node:assert/strict';
import test from 'node:test';
import { createSettingsStore } from '../src/settings.js';
import { readCareer, recordCareer } from '../src/career.js';

function memory(values = {}) {
  const data = new Map(Object.entries(values));
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('older preferences migrate and new gameplay tuning persists within bounds', () => {
  const storage = memory({ 'random-eras.settings.v1': '{"sensitivity":1.5,"quality":"broken","keys":{"forward":"KeyZ"}}' });
  const { state, set } = createSettingsStore(storage);
  assert.equal(state.sensitivity, 1.5);
  assert.equal(state.quality, 'medium');
  assert.equal(state.keys.forward, 'KeyZ');
  assert.equal(state.keys.back, 'KeyS');
  set('bufferWindow', 10);
  set('heraldry', 'umber');
  set('music', Infinity);
  const next = createSettingsStore(storage).state;
  assert.equal(next.bufferWindow, 0.45);
  assert.equal(next.heraldry, 'umber');
  assert.equal(next.music, 0.36);
});

test('career survives a damaged local save and accumulates each result', () => {
  const storage = memory({ 'random-eras.career.v1': '{oops' });
  assert.equal(readCareer(storage).hits, 0);
  recordCareer({ kills: 2, hits: 5, longestCombo: 3 }, 'ironwood', storage);
  recordCareer({ kills: 0, hits: 4, longestCombo: 2 }, 'ironwood', storage);
  const career = readCareer(storage);
  assert.equal(career.hits, 9);
  assert.equal(career.kills, 2);
  assert.equal(career.longestCombo, 3);
  assert.equal(career.visits.ironwood, 2);
});
