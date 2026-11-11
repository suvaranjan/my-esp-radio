'use strict';
const { stepped } = require('../utils/backoff');

// Fail hone par source kitni der skip hoga: 30s, 2m, 5m, 15m, 30m (phir 30m)
const DEFAULT_STEPS = [30e3, 120e3, 300e3, 900e3, 1800e3];

/** Kharab source ko yaad rakhta hai taaki baar baar dead URL try na ho (circuit breaker). */
class SourceHealth {
  constructor({ steps = DEFAULT_STEPS } = {}) {
    this.steps = steps;
    this.map = new Map();
  }

  _entry(key) {
    let e = this.map.get(key);
    if (!e) {
      e = { fails: 0, cooldownUntil: 0, lastError: null, lastFailAt: 0, lastLiveAt: 0 };
      this.map.set(key, e);
    }
    return e;
  }

  isAvailable(key, now = Date.now()) {
    const e = this.map.get(key);
    return !e || e.cooldownUntil <= now;
  }

  cooldownLeft(key, now = Date.now()) {
    const e = this.map.get(key);
    return e ? Math.max(0, e.cooldownUntil - now) : 0;
  }

  // wasStable: source kaafi der chala tha -> purani fail count maaf, chhota cooldown
  markFailure(key, reason, { wasStable = false } = {}) {
    const e = this._entry(key);
    if (wasStable) e.fails = 0;
    e.fails += 1;
    e.lastError = reason;
    e.lastFailAt = Date.now();
    e.cooldownUntil = e.lastFailAt + stepped(this.steps, e.fails);
    return e;
  }

  markLive(key) { this._entry(key).lastLiveAt = Date.now(); }

  markSuccess(key) {
    const e = this._entry(key);
    e.fails = 0;
    e.cooldownUntil = 0;
    e.lastLiveAt = Date.now();
  }

  reset(prefix = '') {
    for (const k of [...this.map.keys()]) if (k.startsWith(prefix)) this.map.delete(k);
  }

  snapshot(prefix = '') {
    const now = Date.now();
    return [...this.map.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, e]) => ({
        source: k.slice(prefix.length),
        fails: e.fails,
        cooldownLeftSec: Math.round(Math.max(0, e.cooldownUntil - now) / 1000),
        lastError: e.lastError,
        lastLiveAt: e.lastLiveAt ? new Date(e.lastLiveAt).toISOString() : null,
      }));
  }
}

module.exports = SourceHealth;
