'use strict';
const test = require('node:test');
const assert = require('node:assert');
const EventEmitter = require('events');
const ChannelPipeline = require('../src/core/ChannelPipeline');
const SourceHealth = require('../src/core/SourceHealth');

const logger = { child: () => logger, info() {}, warn() {}, debug() {}, error() {} };
const cfg = { maxBuffered: 1e6, idleStopMs: 150, startupTimeoutMs: 400, stallMs: 400, switchDelayMs: 10 };

// Fake transcoder: url ke naam se behaviour tay hota hai
class FakeTranscoder {
  constructor() { this.started = []; this.handles = []; }
  async start(cand) {
    this.started.push(cand.url);
    const h = new EventEmitter();
    h.killed = false;
    h.kill = () => { h.killed = true; clearInterval(h.timer); };
    this.handles.push(h);
    if (cand.url.includes('crash')) setTimeout(() => !h.killed && h.emit('exit', { who: 'ffmpeg', code: 1, tail: ['boom'] }), 20);
    else if (cand.url.includes('silent')) { /* kabhi data nahi */ }
    else if (cand.url.includes('good')) h.timer = setInterval(() => h.emit('data', Buffer.from('mp3')), 20);
    else if (cand.url.includes('dies')) {
      h.timer = setInterval(() => h.emit('data', Buffer.from('mp3')), 20);
      setTimeout(() => { clearInterval(h.timer); }, 120); // data band, process zinda -> stall
    }
    return h;
  }
}

const fakeRes = () => {
  const r = new EventEmitter();
  r.chunks = [];
  r.writableLength = 0;
  r.write = (c) => { r.chunks.push(c); return true; };
  r.end = () => { r.writableEnded = true; };
  r.destroy = () => { r.destroyed = true; };
  return r;
};

const made = [];
test.after(() => made.forEach((p) => p.stop())); // fail ho to bhi process hang na ho

function make(sources, over = {}, cfgOver = {}) {
  const tc = new FakeTranscoder();
  const health = new SourceHealth({ steps: [60000] });
  const p = new ChannelPipeline({
    channel: { slug: 't', name: 'T', sources: sources.map((url) => ({ type: 'hls', url })), ...over },
    profileName: 'default', profile: { bitrate: '128k', sampleRate: 44100, channels: 2 },
    config: { ...cfg, ...cfgOver }, catalog: null, health, silence: { get: () => Buffer.from('SIL') },
    transcoder: tc, logger,
  });
  made.push(p);
  return { p, tc, health };
}

test('failover: crash + silent source ke baad good source live hota hai', async () => {
  const { p, tc, health } = make(['x://crash', 'x://silent', 'x://good']);
  p.addWaiter();
  const ok = await p.whenLive(3000);
  assert.ok(ok, 'live nahi hua');
  assert.deepStrictEqual(tc.started, ['x://crash', 'x://silent', 'x://good']);
  assert.strictEqual(p.info().source.label.includes('good'), true);
  assert.ok(!health.isAvailable('t::hls:x://crash'));   // cooldown mein
  assert.ok(!health.isAvailable('t::hls:x://silent'));
  p.removeWaiter();
  p.stop();
});

test('cooldown wale source skip hote hain (agli baar seedha good)', async () => {
  const { p, tc } = make(['x://crash', 'x://good']);
  p.addWaiter();
  await p.whenLive(3000);
  p.restart();                       // restart health reset nahi karta (sirf manager karta hai)
  await p.whenLive(3000);
  assert.deepStrictEqual(tc.started, ['x://crash', 'x://good', 'x://good']);
  p.removeWaiter();
  p.stop();
});

test('live ke baad stall -> agle source par switch + silence + audio wapas', async () => {
  // switchDelay 1300ms: switch window mein ek silence tick (1s) zaroor aayega
  const { p, tc } = make(['x://dies', 'x://good'], {}, { switchDelayMs: 1300 });
  const res = fakeRes();
  p.addWaiter();
  assert.ok(await p.whenLive(3000));
  p.addClient(res); p.removeWaiter();
  // stall detect hone aur switch hone ka wait
  await new Promise((r) => setTimeout(r, 2800));
  assert.deepStrictEqual(tc.started, ['x://dies', 'x://good']);
  assert.strictEqual(p.state, 'live');
  assert.ok(p.switches >= 1);
  assert.ok(res.chunks.some((c) => c.toString() === 'SIL'), 'switch ke dauran silence jani chahiye');
  assert.ok(res.chunks.filter((c) => c.toString() === 'mp3').length > 5);
  p.stop();
});

test('idle: aakhri listener ke baad pipeline band, process kill', async () => {
  const { p, tc } = make(['x://good']);
  const res = fakeRes();
  p.addWaiter();
  await p.whenLive(2000);
  p.addClient(res); p.removeWaiter();
  p.removeClient(res);
  await new Promise((r) => setTimeout(r, 400));
  assert.strictEqual(p.state, 'idle');
  assert.ok(tc.handles[0].killed);
});

test('do listener ek hi process share karte hain', async () => {
  const { p, tc } = make(['x://good']);
  const a = fakeRes(); const b = fakeRes();
  p.addWaiter(); p.addWaiter();
  await p.whenLive(2000);
  p.addClient(a); p.addClient(b); p.removeWaiter(); p.removeWaiter();
  await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(tc.started.length, 1);
  assert.ok(a.chunks.length > 0 && b.chunks.length > 0);
  p.stop();
});

test('sab sources dead -> cooldown state, whenLive false', async () => {
  const { p } = make(['x://crash']);
  p.addWaiter();
  const ok = await p.whenLive(600);
  assert.strictEqual(ok, false);
  assert.strictEqual(p.state, 'cooldown');
  p.removeWaiter();
  p.stop();
});

test('slow client drop hota hai', async () => {
  const { p } = make(['x://good']);
  const slow = fakeRes(); slow.writableLength = 5e6;
  const fast = fakeRes();
  p.addWaiter(); await p.whenLive(2000);
  p.addClient(slow); p.addClient(fast); p.removeWaiter();
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(slow.destroyed);
  assert.ok(fast.chunks.length > 0);
  p.stop();
});
