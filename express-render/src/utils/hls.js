'use strict';
const { fetchText } = require('./http');

function parseAttrs(s) {
  const out = {};
  const re = /([A-Z0-9-]+)=("([^"]*)"|[^,]*)/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = m[3] !== undefined ? m[3] : m[2];
  return out;
}

/**
 * Master m3u8 mile to audio ke liye sabse sasta URL chunta hai:
 *   1) alag audio-only rendition (EXT-X-MEDIA TYPE=AUDIO + URI)
 *   2) audio-only variant (CODECS mein video nahi)
 *   3) sabse kam BANDWIDTH wala variant
 * Kuch bhi galat ho (fetch fail, media playlist, parse issue) to original URL hi lautata hai.
 */
async function pickAudioFriendlyUrl(url, { headers = {}, timeoutMs = 8000 } = {}) {
  let text;
  try {
    text = await fetchText(url, { headers, timeoutMs });
  } catch {
    return url;
  }
  if (!text.includes('#EXT-X-STREAM-INF')) return url; // already media playlist

  let base;
  try { base = new URL(url); } catch { return url; }
  const resolve = (u) => {
    const abs = new URL(u, base);
    if (!abs.search && base.search) abs.search = base.search; // token query aage badhao
    return abs.toString();
  };

  const lines = text.split(/\r?\n/).map((l) => l.trim());

  const audioMedia = lines
    .filter((l) => l.startsWith('#EXT-X-MEDIA:'))
    .map((l) => parseAttrs(l.slice('#EXT-X-MEDIA:'.length)))
    .filter((a) => a.TYPE === 'AUDIO' && a.URI);
  if (audioMedia.length) {
    const pick = audioMedia.find((a) => /^YES$/i.test(a.DEFAULT || '')) || audioMedia[0];
    return resolve(pick.URI);
  }

  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue;
    const a = parseAttrs(lines[i].slice('#EXT-X-STREAM-INF:'.length));
    let j = i + 1;
    while (j < lines.length && (!lines[j] || lines[j].startsWith('#'))) j++;
    if (!lines[j]) continue;
    const hasVideoCodec = /avc1|hvc1|hev1|vp0?9|av01/i.test(a.CODECS || '');
    variants.push({
      bw: parseInt(a.BANDWIDTH || a['AVERAGE-BANDWIDTH'], 10) || Number.MAX_SAFE_INTEGER,
      audioOnly: !!a.CODECS && !hasVideoCodec && !a.RESOLUTION,
      uri: lines[j],
    });
  }
  if (!variants.length) return url;
  variants.sort((a, b) => (Number(b.audioOnly) - Number(a.audioOnly)) || (a.bw - b.bw));
  try { return resolve(variants[0].uri); } catch { return url; }
}

module.exports = { pickAudioFriendlyUrl, parseAttrs };
