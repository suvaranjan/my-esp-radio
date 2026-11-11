'use strict';
const ChannelPipeline = require('./ChannelPipeline');
const { validateChannels } = require('../sources');

/** slug -> pipelines. Global limit (MAX_PIPELINES) yahin enforce hoti hai. */
class ChannelManager {
  constructor({ config, channels, profiles, catalog, health, silence, transcoder, logger }) {
    validateChannels(channels);
    this.config = config;
    this.profiles = profiles;
    this.catalog = catalog;
    this.health = health;
    this.silence = silence;
    this.transcoder = transcoder;
    this.logger = logger;
    this.log = logger.child('manager');

    this.channels = new Map(channels.filter((c) => c.enabled !== false).map((c) => [c.slug, c]));
    this.pipelines = new Map(); // "slug:profile" -> ChannelPipeline
  }

  getChannel(slug) { return this.channels.get(slug) || null; }

  activeCount() {
    let n = 0;
    for (const p of this.pipelines.values()) if (p.isActive) n++;
    return n;
  }

  /** @returns {{pipeline?: ChannelPipeline, error?: 'not_found'|'bad_profile'|'busy'}} */
  getPipeline(slug, profileName = 'default') {
    const channel = this.channels.get(slug);
    if (!channel) return { error: 'not_found' };
    const profile = this.profiles[profileName];
    if (!profile) return { error: 'bad_profile' };

    const key = `${slug}:${profileName}`;
    let p = this.pipelines.get(key);
    if (!p) {
      p = new ChannelPipeline({
        channel, profileName, profile,
        config: this.config, catalog: this.catalog, health: this.health,
        silence: this.silence, transcoder: this.transcoder, logger: this.logger,
      });
      this.pipelines.set(key, p);
    }
    if (!p.isActive && this.activeCount() >= this.config.maxPipelines) return { error: 'busy' };
    return { pipeline: p };
  }

  startAlwaysOn() {
    for (const ch of this.channels.values()) {
      if (!ch.alwaysOn) continue;
      const { pipeline } = this.getPipeline(ch.slug, 'default');
      if (pipeline) pipeline.start();
    }
  }

  _forChannel(slug) {
    return [...this.pipelines.values()].filter((p) => p.channel.slug === slug);
  }

  summary(slug) {
    const ch = this.channels.get(slug);
    const ps = this._forChannel(slug);
    let state = 'idle';
    if (ps.some((p) => p.state === 'live')) state = 'live';
    else { const a = ps.find((p) => p.isActive); if (a) state = a.state; }
    return {
      slug: ch.slug,
      name: ch.name,
      language: ch.language || null,
      genre: ch.genre || null,
      state,
      listeners: ps.reduce((n, p) => n + p.hub.size, 0),
    };
  }

  list() { return [...this.channels.keys()].map((s) => this.summary(s)); }

  detail(slug) {
    const ch = this.channels.get(slug);
    if (!ch) return null;
    return {
      ...this.summary(slug),
      alwaysOn: !!ch.alwaysOn,
      sources: ch.sources.map((s) => ({ type: s.type, ...(s.channelId ? { channelId: s.channelId } : {}) })),
      pipelines: this._forChannel(slug).map((p) => p.info()),
      health: this.health.snapshot(`${slug}::`),
    };
  }

  restart(slug) {
    if (!this.channels.has(slug)) return false;
    this.health.reset(`${slug}::`);
    for (const p of this._forChannel(slug)) p.restart();
    return true;
  }

  status() {
    return {
      uptimeSec: Math.round(process.uptime()),
      memoryMB: Math.round(process.memoryUsage().rss / 1048576),
      activePipelines: this.activeCount(),
      maxPipelines: this.config.maxPipelines,
      pipelines: [...this.pipelines.values()].filter((p) => p.isActive).map((p) => p.info()),
      catalog: this.catalog ? this.catalog.info() : null,
    };
  }

  stopAll() {
    for (const p of this.pipelines.values()) p.stop();
  }
}

module.exports = ChannelManager;
