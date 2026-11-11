'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Transcoder = require('../src/core/Transcoder');
const profiles = require('../src/config/profiles');

const logger = { child: () => logger, info() {}, warn() {}, debug() {}, error() {} };
const base = { hlsPickLowest: false, ytdlpJsRuntime: '', ytdlpCookies: '' };

test('yt-dlp / ffmpeg na mile to turant exit event (timeout ka wait nahi)', async () => {
  for (const cand of [
    { kind: 'ytdlp', url: 'https://www.youtube.com/watch?v=x' },
    { kind: 'url', url: '/tmp/x.mp3' },
  ]) {
    const t = new Transcoder({ config: { ...base, ytdlpPath: '/no/yt-dlp', ffmpegPath: '/no/ffmpeg' }, logger });
    const h = await t.start(cand, profiles.default, { tag: 't' });
    const info = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('exit event nahi aaya')), 2000);
      h.on('exit', (i) => { clearTimeout(timer); resolve(i); });
    });
    assert.ok(info.tail.some((l) => /spawn error/.test(l)), info.tail.join(' | '));
  }
});
