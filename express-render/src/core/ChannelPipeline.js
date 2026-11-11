'use strict';
const EventEmitter = require('events');
const ClientHub = require('./ClientHub');
const { resolveChannel } = require('../sources');

const STABLE_MS = 60_000; // itni der chala to "stable" maano

/**
 * Ek (channel, profile) ka poora lifecycle.
 *
 *   idle -> starting -> live -> switching -> live ...
 *                         \-> cooldown (sab sources dead) -> retry
 *
 * - Pehla listener aate hi start, aakhri jaane ke IDLE_STOP_MS baad stop (alwaysOn ho to nahi).
 * - Source fail (exit / startup timeout / stall) -> health mein cooldown -> agla available candidate.
 * - Switch ke dauran listeners ko silent MP3 jata hai taaki ESP32 disconnect na ho.
 */
class ChannelPipeline extends EventEmitter {
  constructor({ channel, profileName, profile, config, catalog, health, silence, transcoder, logger }) {
    super();
    this.setMaxListeners(0);
    this.channel = channel;
    this.profileName = profileName;
    this.profile = profile;
    this.config = config;
    this.catalog = catalog;
    this.health = health;
    this.silence = silence;
    this.transcoder = transcoder;
    this.logger = logger;
    this.log = logger.child(`${channel.slug}:${profileName}`);
    this.hub = new ClientHub({ maxBuffered: config.maxBuffered, log: this.log });

    this.state = 'idle';
    this.waiters = 0;
    this.current = null;
    this.liveSource = null;
    this.token = 0;
    this.startedAt = null;
    this.lastError = null;
    this.switches = 0;
    this.idleTimer = null;
    this.retryTimer = null;
    this.silenceTimer = null;
  }

  get interest() { return this.hub.size + this.waiters; }
  get isActive() { return this.state !== 'idle'; }

  // ---- public API ----
  start() { if (this.state === 'idle') this._begin(); }

  addWaiter() { this.waiters++; this._interestChanged(); }
  removeWaiter() { this.waiters = Math.max(0, this.waiters - 1); this._interestChanged(); }
  addClient(res) { this.hub.add(res); this._interestChanged(); }
  removeClient(res) { if (this.hub.remove(res)) this._interestChanged(); }

  whenLive(timeoutMs) {
    if (this.state === 'live') return Promise.resolve(true);
    return new Promise((resolve) => {
      const onLive = () => { clearTimeout(t); resolve(true); };
      const t = setTimeout(() => { this.off('live', onLive); resolve(false); }, timeoutMs);
      this.once('live', onLive);
    });
  }

  restart() {
    this._shutdown('restart');
    if (this.interest > 0 || this.channel.alwaysOn) this._begin();
  }

  stop() {
    this.hub.closeAll();
    this._shutdown('manual');
  }

  info() {
    return {
      slug: this.channel.slug,
      profile: this.profileName,
      state: this.state,
      listeners: this.hub.size,
      waiting: this.waiters,
      uptimeSec: this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0,
      source: this.liveSource ? { type: this.liveSource.sourceType, label: this.liveSource.label } : null,
      switches: this.switches,
      lastError: this.lastError,
    };
  }

  // ---- lifecycle ----
  _interestChanged() {
    if (this.interest > 0) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
      if (this.state === 'idle') this._begin();
    } else if (!this.channel.alwaysOn && this.state !== 'idle' && !this.idleTimer) {
      this.idleTimer = setTimeout(() => {
        this.idleTimer = null;
        if (this.interest === 0) this._shutdown('idle (koi listener nahi)');
      }, this.config.idleStopMs);
    }
  }

  _begin() {
    this.token++;
    this.state = 'starting';
    this.startedAt = Date.now();
    this.log.info('pipeline start');
    this.silenceTimer = setInterval(() => this._silenceTick(), 1000);
    this.silenceTimer.unref();
    this._attempt(this.token);
  }

  _shutdown(reason) {
    this.log.info(`pipeline stop (${reason})`);
    this.token++;
    clearTimeout(this.idleTimer);
    clearTimeout(this.retryTimer);
    clearInterval(this.silenceTimer);
    this.idleTimer = this.retryTimer = this.silenceTimer = null;
    if (this.current) {
      clearInterval(this.current.watchdog);
      this.current.done = true;
      if (this.current.handle) this.current.handle.kill();
      this.current = null;
    }
    this.state = 'idle';
    this.liveSource = null;
  }

  _silenceTick() {
    if (this.state === 'live' || this.hub.size === 0) return;
    const buf = this.silence && this.silence.get(this.profileName);
    if (buf) this.hub.broadcast(buf);
  }

  async _attempt(token) {
    if (token !== this.token) return;
    let list = [];
    try {
      list = await resolveChannel(this.channel, { config: this.config, catalog: this.catalog, logger: this.logger });
    } catch (e) {
      this.log.warn(`resolve error: ${e.message}`);
    }
    if (token !== this.token) return;

    const keyOf = (c) => `${this.channel.slug}::${c.id}`;
    const pick = list.find((c) => this.health.isAvailable(keyOf(c)));
    if (!pick) return this._cooldown(token, list.map(keyOf));
    await this._launch(token, pick, keyOf(pick));
  }

  _cooldown(token, keys) {
    this.state = 'cooldown';
    this.liveSource = null;
    if (this.catalog) this.catalog.requestRefresh();
    const left = keys.length ? Math.min(...keys.map((k) => this.health.cooldownLeft(k))) : 15000;
    const wait = Math.min(Math.max(left, 5000), 5 * 60 * 1000);
    this.log.warn(`koi source available nahi; ${Math.round(wait / 1000)}s baad dobara try`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this._attempt(token);
    }, wait);
  }

  async _launch(token, cand, key) {
    const run = { cand, key, startedAt: Date.now(), firstDataAt: null, lastData: Date.now(), handle: null, done: false, watchdog: null };
    this.current = run;
    this.log.info(`try -> ${cand.label} [${cand.sourceType}]`);

    let handle;
    try {
      handle = await this.transcoder.start(cand, this.profile, { tag: this.channel.slug });
    } catch (e) {
      if (token !== this.token || this.current !== run) return;
      return this._fail(run, `start error: ${e.message}`);
    }
    if (token !== this.token || this.current !== run) { handle.kill(); return; }

    run.handle = handle;
    handle.on('data', (chunk) => this._onData(run, chunk));
    handle.on('exit', (info) => this._fail(run, `${info.who} exit code=${info.code}${info.tail.length ? ` | ${info.tail.slice(-2).join(' | ')}` : ''}`));

    run.watchdog = setInterval(() => {
      if (this.current !== run || run.done) return;
      const now = Date.now();
      if (!run.firstDataAt) {
        if (now - run.startedAt > this.config.startupTimeoutMs) this._fail(run, `startup timeout (${this.config.startupTimeoutMs / 1000}s mein audio nahi aaya)`);
      } else if (now - run.lastData > this.config.stallMs) {
        this._fail(run, `stall (${this.config.stallMs / 1000}s se audio nahi)`);
      }
    }, 1000);
  }

  _onData(run, chunk) {
    if (this.current !== run || run.done) return;
    run.lastData = Date.now();
    if (!run.firstDataAt) {
      run.firstDataAt = run.lastData;
      this.state = 'live';
      this.liveSource = run.cand;
      this.lastError = null;
      this.health.markLive(run.key);
      this.log.info(`LIVE via ${run.cand.label} (${run.firstDataAt - run.startedAt}ms mein audio aaya)`);
      this.emit('live');
    }
    this.hub.broadcast(chunk);
  }

  _fail(run, reason) {
    if (run.done) return;
    run.done = true;
    clearInterval(run.watchdog);
    if (run.handle) run.handle.kill();
    if (this.current !== run) return;
    this.current = null;
    this.liveSource = null;

    const wasStable = !!run.firstDataAt && Date.now() - run.firstDataAt >= STABLE_MS;
    this.health.markFailure(run.key, reason, { wasStable });
    this.lastError = `${run.cand.label}: ${reason}`;
    this.log.warn(`FAIL ${run.cand.label}: ${reason}`);

    if (this.interest === 0 && !this.channel.alwaysOn) {
      this._shutdown('source fail, koi listener nahi');
      return;
    }
    this.switches++;
    this.state = this.hub.size > 0 ? 'switching' : 'starting';
    const token = this.token;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this._attempt(token);
    }, this.config.switchDelayMs);
  }
}

module.exports = ChannelPipeline;
