'use strict';
const fs = require('fs');
const path = require('path');
const { fetchText } = require('../utils/http');

const FILES = ['streams', 'channels', 'blocklist'];
const MIN_REFRESH_GAP_MS = 30 * 60 * 1000;

/**
 * iptv-org API ka local catalog. API sirf start par, har N ghante mein, ya (kam se kam 30 min ke gap se)
 * jab sab sources fail ho jayein tab fetch hoti hai. Stream request ke time sirf memory lookup.
 * Disk cache (data/cache) se offline bhi chalta hai.
 * Sirf wantedIds (tumhare channels.js ke iptv sources) index hote hain -> kam RAM.
 */
class IptvCatalog {
  constructor({ config, logger, wantedIds = [] }) {
    this.config = config;
    this.log = logger.child('catalog');
    this.wanted = new Set(wantedIds);
    this.byChannel = new Map();   // channelId -> stream[]
    this.blocked = new Set();
    this.meta = new Map();        // channelId -> {name, closed, replaced_by}
    this.loadedAt = null;
    this.origin = null;           // 'cache' | 'network'
    this.lastAttemptAt = 0;
    this.lastError = null;
    this.refreshing = null;
    this.timer = null;
  }

  async init() {
    fs.mkdirSync(this.config.cacheDir, { recursive: true });
    if (this._loadFromDisk()) this.log.info(`disk cache load hua (${this._summary()})`);
    else this.log.info('disk cache nahi mila; network se aayega');
  }

  startAutoRefresh() {
    this.refresh(); // background, await nahi
    const ms = Math.max(1, this.config.catalogRefreshHours) * 3600 * 1000;
    this.timer = setInterval(() => this.refresh(), ms);
    this.timer.unref();
  }

  stop() { clearInterval(this.timer); }

  // Sab sources fail hone par pipeline ye call karta hai; gap ke andar ho to ignore.
  requestRefresh(minGapMs = MIN_REFRESH_GAP_MS) {
    if (!this.refreshing && Date.now() - this.lastAttemptAt >= minGapMs) this.refresh();
  }

  refresh() {
    if (this.refreshing) return this.refreshing;
    this.lastAttemptAt = Date.now();
    this.refreshing = (async () => {
      try {
        const base = this.config.iptvApiBase;
        const get = (n) => fetchText(`${base}/${n}.json`, { timeoutMs: 90000 });
        const streamsText = await get('streams'); // zaroori
        const optional = await Promise.all(['channels', 'blocklist'].map((n) => get(n).catch(() => null)));
        const streams = JSON.parse(streamsText);
        if (!Array.isArray(streams) || !streams.length) throw new Error('streams.json khali/invalid');

        const raw = { streams: streamsText, channels: optional[0], blocklist: optional[1] };
        for (const n of FILES) if (raw[n]) this._writeAtomic(n, raw[n]);

        const channels = optional[0] ? JSON.parse(optional[0]) : this._readCache('channels');
        const blocklist = optional[1] ? JSON.parse(optional[1]) : this._readCache('blocklist');
        this._index(streams, blocklist || [], channels || []);
        this.origin = 'network';
        this.loadedAt = Date.now();
        this.lastError = null;
        this.log.info(`refresh ho gaya (${this._summary()})`);
        return true;
      } catch (e) {
        this.lastError = e.message;
        this.log.warn(`refresh fail: ${e.message} (purani list use hogi)`);
        return false;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  /** Ranked candidates: https pehle, "Not 24/7" baad mein, Geo-blocked sabse last, phir quality ascending. */
  getCandidates(channelId, { feed = null, max = this.config.iptvMaxCandidates } = {}) {
    if (this.blocked.has(channelId)) return [];
    let list = (this.byChannel.get(channelId) || []).filter((s) => /^https?:\/\//i.test(s.url || ''));
    if (feed) list = list.filter((s) => s.feed === feed);

    const has = (s, l) => (s.labels || []).includes(l);
    const q = (s) => { const n = parseInt(s.quality, 10); return Number.isFinite(n) ? n : 9999; };
    list.sort((a, b) =>
      (has(a, 'Geo-blocked') - has(b, 'Geo-blocked')) ||
      (has(a, 'Not 24/7') - has(b, 'Not 24/7')) ||
      (Number(/^https:/i.test(b.url)) - Number(/^https:/i.test(a.url))) ||
      (q(a) - q(b)));

    const seen = new Set();
    const out = [];
    for (const s of list) {
      if (seen.has(s.url)) continue;
      seen.add(s.url);
      out.push({
        id: `iptv:${s.url}`,
        kind: 'url',
        url: s.url,
        headers: { referrer: s.referrer || null, userAgent: s.user_agent || null },
        label: `iptv ${s.title || s.feed || channelId}${s.quality ? ` (${s.quality})` : ''}`,
      });
      if (out.length >= max) break;
    }
    return out;
  }

  info() {
    let streams = 0;
    for (const l of this.byChannel.values()) streams += l.length;
    return {
      origin: this.origin,
      loadedAt: this.loadedAt ? new Date(this.loadedAt).toISOString() : null,
      channelsIndexed: this.byChannel.size,
      streamsIndexed: streams,
      refreshing: !!this.refreshing,
      lastError: this.lastError,
    };
  }

  // ---- internals ----
  _summary() {
    const i = this.info();
    return `${i.channelsIndexed} channels, ${i.streamsIndexed} streams`;
  }

  _index(streams, blocklist, channels) {
    const byChannel = new Map();
    for (const s of streams) {
      if (!s || !s.channel || !this.wanted.has(s.channel)) continue;
      if (!byChannel.has(s.channel)) byChannel.set(s.channel, []);
      byChannel.get(s.channel).push(s);
    }
    this.byChannel = byChannel;
    this.blocked = new Set(blocklist.map((b) => b.channel).filter((id) => this.wanted.has(id)));
    this.meta = new Map();
    for (const c of channels) {
      if (!this.wanted.has(c.id)) continue;
      this.meta.set(c.id, { name: c.name, closed: c.closed || null, replaced_by: c.replaced_by || null });
      if (c.closed) this.log.warn(`${c.id} closed hai (${c.closed})${c.replaced_by ? `, replaced_by ${c.replaced_by}` : ''}`);
    }
    for (const id of this.blocked) this.log.warn(`${id} blocklist mein hai (dmca/nsfw), skip hoga`);
    for (const id of this.wanted) {
      if (!byChannel.has(id) && !this.blocked.has(id)) this.log.warn(`${id} ke liye iptv-org mein koi stream nahi mili`);
    }
  }

  _file(name) { return path.join(this.config.cacheDir, `${name}.json`); }

  _readCache(name) {
    try { return JSON.parse(fs.readFileSync(this._file(name), 'utf8')); } catch { return null; }
  }

  _writeAtomic(name, text) {
    const f = this._file(name);
    fs.writeFileSync(`${f}.tmp`, text);
    fs.renameSync(`${f}.tmp`, f);
  }

  _loadFromDisk() {
    const streams = this._readCache('streams');
    if (!Array.isArray(streams)) return false;
    const bl = this._readCache('blocklist');
    const ch = this._readCache('channels');
    this._index(streams, Array.isArray(bl) ? bl : [], Array.isArray(ch) ? ch : []);
    this.origin = 'cache';
    try { this.loadedAt = fs.statSync(this._file('streams')).mtimeMs; } catch { this.loadedAt = Date.now(); }
    return true;
  }
}

module.exports = IptvCatalog;
