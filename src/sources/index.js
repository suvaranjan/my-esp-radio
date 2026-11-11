'use strict';

const registry = new Map(
  [require('./youtube.source'), require('./hls.source'), require('./iptv.source')].map((s) => [s.type, s]),
);

/** channels.js ki validation. Galti ho to clear error ke saath throw. */
function validateChannels(channels) {
  if (!Array.isArray(channels)) throw new Error('channels.js array export karna chahiye');
  const seen = new Set();
  for (const ch of channels) {
    const where = `channel "${ch && ch.slug}"`;
    if (!ch || !/^[a-z0-9][a-z0-9-]*$/.test(ch.slug || '')) throw new Error(`${where}: slug sirf a-z, 0-9, '-' ho sakta hai`);
    if (seen.has(ch.slug)) throw new Error(`${where}: slug duplicate hai`);
    seen.add(ch.slug);
    if (!ch.name) throw new Error(`${where}: 'name' chahiye`);
    if (!Array.isArray(ch.sources) || !ch.sources.length) throw new Error(`${where}: kam se kam ek source chahiye`);
    for (const src of ch.sources) {
      const impl = registry.get(src.type);
      if (!impl) throw new Error(`${where}: unknown source type "${src.type}" (youtube | iptv | hls)`);
      try { impl.validate(src); } catch (e) { throw new Error(`${where}: ${e.message}`); }
    }
  }
}

/** Catalog ko batane ke liye: kaun kaun se iptv channel IDs chahiye. */
function collectIptvIds(channels) {
  const ids = new Set();
  for (const ch of channels) for (const s of ch.sources) if (s.type === 'iptv') ids.add(s.channelId);
  return [...ids];
}

/**
 * Channel ke saare sources ko ek ordered candidate list mein flatten karta hai
 * (priority = config ka order). Har candidate: {id, kind:'ytdlp'|'url', url, headers, label, sourceIndex, sourceType}
 */
async function resolveChannel(channel, ctx) {
  const out = [];
  const seen = new Set();
  for (const [i, src] of channel.sources.entries()) {
    const impl = registry.get(src.type);
    if (!impl) continue;
    try {
      for (const c of await impl.candidates(src, ctx)) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.push({ ...c, sourceIndex: i, sourceType: src.type });
      }
    } catch (e) {
      ctx.logger.child(channel.slug).warn(`${src.type} resolve fail: ${e.message}`);
    }
  }
  return out;
}

module.exports = { validateChannels, collectIptvIds, resolveChannel };
