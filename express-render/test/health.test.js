'use strict';
const test = require('node:test');
const assert = require('node:assert');
const SourceHealth = require('../src/core/SourceHealth');

test('failure ke baad cooldown, success par reset', () => {
  const h = new SourceHealth({ steps: [1000, 5000] });
  assert.ok(h.isAvailable('a'));
  h.markFailure('a', 'x');
  assert.ok(!h.isAvailable('a'));
  assert.ok(h.cooldownLeft('a') > 500 && h.cooldownLeft('a') <= 1000);
  h.markFailure('a', 'x');
  assert.ok(h.cooldownLeft('a') > 4000);          // 2nd fail -> 5000
  h.markFailure('a', 'x');
  assert.ok(h.cooldownLeft('a') > 4000);          // steps khatam -> last value
  h.markSuccess('a');
  assert.ok(h.isAvailable('a'));
});

test('stable source ka fail count reset hota hai', () => {
  const h = new SourceHealth({ steps: [1000, 5000] });
  h.markFailure('a', 'x');
  h.markFailure('a', 'x');
  h.markFailure('a', 'x', { wasStable: true });
  assert.ok(h.cooldownLeft('a') <= 1000);
});

test('snapshot / reset prefix', () => {
  const h = new SourceHealth();
  h.markFailure('otv::a', 'x');
  h.markFailure('kanak::b', 'y');
  assert.strictEqual(h.snapshot('otv::').length, 1);
  h.reset('otv::');
  assert.strictEqual(h.snapshot('otv::').length, 0);
  assert.strictEqual(h.snapshot('kanak::').length, 1);
});
