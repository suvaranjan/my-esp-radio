'use strict';
const test = require('node:test');
const assert = require('node:assert');
const IptvCatalog = require('../src/services/iptvCatalog');

const logger = { child: () => logger, info() {}, warn() {}, debug() {}, error() {} };
const config = { iptvMaxCandidates: 4, cacheDir: '/tmp/none', catalogRefreshHours: 8 };

function make(streams, blocklist = []) {
  const c = new IptvCatalog({ config, logger, wantedIds: ['A.in', 'B.in'] });
  c._index(streams, blocklist, []);
  return c;
}

test('ranking: https pehle, geo-blocked last, not-24/7 baad mein, dedupe', () => {
  const c = make([
    { channel: 'A.in', url: 'http://x/geo.m3u8', labels: ['Geo-blocked'], quality: '480p' },
    { channel: 'A.in', url: 'http://x/plain.m3u8', labels: [], quality: '480p' },
    { channel: 'A.in', url: 'https://x/secure.m3u8', labels: [], quality: '720p' },
    { channel: 'A.in', url: 'https://x/part.m3u8', labels: ['Not 24/7'], quality: '240p' },
    { channel: 'A.in', url: 'https://x/secure.m3u8', labels: [] },          // duplicate
    { channel: 'Z.in', url: 'https://x/other.m3u8' },                      // wanted nahi
  ]);
  const urls = c.getCandidates('A.in').map((x) => x.url);
  assert.deepStrictEqual(urls, [
    'https://x/secure.m3u8', 'http://x/plain.m3u8', 'https://x/part.m3u8', 'http://x/geo.m3u8',
  ]);
  assert.strictEqual(c.getCandidates('Z.in').length, 0);
});

test('max limit, headers, blocklist', () => {
  const c = make([
    { channel: 'A.in', url: 'https://x/1.m3u8', referrer: 'http://r/', user_agent: 'UA' },
    { channel: 'A.in', url: 'https://x/2.m3u8' },
    { channel: 'B.in', url: 'https://x/3.m3u8' },
  ], [{ channel: 'B.in', reason: 'dmca' }]);
  const l = c.getCandidates('A.in', { max: 1 });
  assert.strictEqual(l.length, 1);
  assert.deepStrictEqual(l[0].headers, { referrer: 'http://r/', userAgent: 'UA' });
  assert.strictEqual(c.getCandidates('B.in').length, 0); // blocked
});
