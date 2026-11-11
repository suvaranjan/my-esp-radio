'use strict';
const { resolveChannel } = require('../sources');

/** Ek candidate ko asli ffmpeg se test karta hai: timeout ke andar pehla audio chunk aaya = OK. */
function probeCandidate(transcoder, candidate, profile, timeoutMs = 15000) {
  return new Promise(async (resolve) => {
    const t0 = Date.now();
    let handle;
    let timer;
    let settled = false;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (handle) handle.kill();
      resolve(r);
    };
    timer = setTimeout(() => finish({ ok: false, error: `timeout (${timeoutMs / 1000}s mein audio nahi aaya)` }), timeoutMs);
    try {
      handle = await transcoder.start(candidate, profile, { tag: 'probe' });
    } catch (e) {
      return finish({ ok: false, error: e.message });
    }
    if (settled) return handle.kill();
    handle.on('data', () => finish({ ok: true, ms: Date.now() - t0 }));
    handle.on('exit', (info) => finish({ ok: false, error: `exit ${info.who} code=${info.code} ${info.tail.slice(-1)[0] || ''}`.trim() }));
  });
}

/** Optional background checker (PROBE_INTERVAL_MIN > 0): idle channels ke sources test karke health update karta hai. */
class Prober {
  constructor({ config, manager, catalog, health, transcoder, profiles, logger }) {
    Object.assign(this, { config, manager, catalog, health, transcoder, profiles, logger });
    this.log = logger.child('prober');
    this.timer = null;
    this.running = false;
  }

  start() {
    const min = this.config.probeIntervalMin;
    if (!min || min <= 0) return;
    this.timer = setInterval(() => this.runOnce().catch((e) => this.log.warn(e.message)), min * 60 * 1000);
    this.timer.unref();
    this.log.info(`har ${min} min mein probe chalega`);
  }

  stop() { clearInterval(this.timer); }

  async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      for (const ch of this.manager.channels.values()) {
        const active = [...this.manager.pipelines.values()].some((p) => p.channel.slug === ch.slug && p.isActive);
        if (active) continue; // chal raha channel khud apna health update karta hai
        const list = await resolveChannel(ch, { config: this.config, catalog: this.catalog, logger: this.logger });
        for (const c of list) {
          const key = `${ch.slug}::${c.id}`;
          const r = await probeCandidate(this.transcoder, c, this.profiles.lite);
          if (r.ok) this.health.markSuccess(key);
          else this.health.markFailure(key, `probe: ${r.error}`);
          this.log.debug(`${ch.slug} ${c.label}: ${r.ok ? `OK ${r.ms}ms` : `FAIL ${r.error}`}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}

module.exports = { Prober, probeCandidate };
