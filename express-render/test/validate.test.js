'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { validateChannels } = require('../src/sources');
const real = require('../src/config/channels');

test('asli channels.js valid hai', () => {
  assert.doesNotThrow(() => validateChannels(real));
});

test('galat config par clear error', () => {
  const ok = { slug: 'a', name: 'A', sources: [{ type: 'hls', url: 'http://x' }] };
  assert.throws(() => validateChannels([{ ...ok, slug: 'Bad Slug' }]), /slug/);
  assert.throws(() => validateChannels([ok, ok]), /duplicate/);
  assert.throws(() => validateChannels([{ ...ok, sources: [] }]), /source/);
  assert.throws(() => validateChannels([{ ...ok, sources: [{ type: 'nope' }] }]), /unknown source type/);
  assert.throws(() => validateChannels([{ ...ok, sources: [{ type: 'iptv' }] }]), /channelId/);
});
