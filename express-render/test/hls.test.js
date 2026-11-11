'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { pickAudioFriendlyUrl } = require('../src/utils/hls');

function serve(body) {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => { res.end(body); }).listen(0, () => resolve(s));
  });
}

test('sabse kam bandwidth variant chunta hai', async () => {
  const s = await serve([
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"', 'hi/index.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360,CODECS="avc1.4d401f,mp4a.40.2"', 'lo/index.m3u8',
  ].join('\n'));
  const base = `http://127.0.0.1:${s.address().port}/live/master.m3u8?token=abc`;
  const out = await pickAudioFriendlyUrl(base);
  s.close();
  assert.ok(out.includes('/live/lo/index.m3u8'), out);
  assert.ok(out.includes('token=abc'), 'token query aage badhni chahiye');
});

test('audio-only variant ko prefer karta hai', async () => {
  const s = await serve([
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=426x240,CODECS="avc1.42c01e,mp4a.40.2"', 'v/index.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"', 'a/index.m3u8',
  ].join('\n'));
  const out = await pickAudioFriendlyUrl(`http://127.0.0.1:${s.address().port}/m.m3u8`);
  s.close();
  assert.ok(out.endsWith('/a/index.m3u8'), out);
});

test('alag audio rendition ho to wahi chunta hai', async () => {
  const s = await serve([
    '#EXTM3U',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="en",DEFAULT=YES,URI="audio/en.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=900000,AUDIO="aud"', 'video.m3u8',
  ].join('\n'));
  const out = await pickAudioFriendlyUrl(`http://127.0.0.1:${s.address().port}/m.m3u8`);
  s.close();
  assert.ok(out.endsWith('/audio/en.m3u8'), out);
});

test('media playlist / fetch error par original URL', async () => {
  const s = await serve('#EXTM3U\n#EXTINF:4,\nseg1.ts\n');
  const u = `http://127.0.0.1:${s.address().port}/media.m3u8`;
  assert.strictEqual(await pickAudioFriendlyUrl(u), u);
  s.close();
  const dead = 'http://127.0.0.1:1/x.m3u8';
  assert.strictEqual(await pickAudioFriendlyUrl(dead, { timeoutMs: 500 }), dead);
});
