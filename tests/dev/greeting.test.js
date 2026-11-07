import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderGreeting } from '../../dev/greeting.js';

const emptyState = { tasks: [], lastCompleted: null, predictions: [] };

test('renderGreeting with empty state and unavailable board', () => {
  const out = renderGreeting(emptyState, { ok: false, reason: 'gh not found' });
  assert.match(out, /No tasks recorded yet/);
  assert.match(out, /Board unavailable: gh not found/);
});

test('renderGreeting keeps confirmed state and predictions in separate sections', () => {
  const state = {
    tasks: [{ issue_number: 7, title: 'Setup', status: 'in_progress', detail: null }],
    lastCompleted: { body: 'finished the dev DB' },
    predictions: [{ body: 'next: write the CLI' }],
  };
  const out = renderGreeting(state, { ok: true, items: [] });
  const confirmed = out.indexOf('Confirmed state');
  const predictions = out.indexOf('Predictions (not confirmed)');
  assert.ok(confirmed >= 0 && predictions > confirmed);
  assert.ok(out.indexOf('Setup') > confirmed && out.indexOf('Setup') < predictions);
  assert.ok(out.indexOf('finished the dev DB') < predictions);
  assert.ok(out.indexOf('next: write the CLI') > predictions);
});

test('renderGreeting strips em-dashes and en-dashes', () => {
  const emDash = String.fromCharCode(0x2014);
  const enDash = String.fromCharCode(0x2013);
  const board = {
    ok: true,
    items: [{ number: 1, title: `Setup ${emDash} phase ${enDash} one`, status: 'Todo' }],
  };
  const out = renderGreeting(emptyState, board);
  assert.ok(out.includes('Setup - phase - one'));
  assert.equal(out.includes(emDash) || out.includes(enDash), false);
});

test('renderGreeting omits the Board section when board is null', () => {
  const out = renderGreeting(emptyState, null);
  assert.equal(out.includes('Board'), false);
});
