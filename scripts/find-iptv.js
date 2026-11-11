#!/usr/bin/env node
'use strict';
/**
 * iptv-org mein channel dhoondho aur sahi channelId nikalo.
 *
 *   npm run find-iptv -- odisha
 *   npm run find-iptv -- tarang --country=IN
 *   npm run find-iptv -- news --country=IN --lang=ori,ory
 *   npm run find-iptv -- otv --urls        (stream URLs bhi dikhao)
 *   npm run find-iptv -- otv --all         (closed channels bhi)
 */
const config = require('../src/config');
const { fetchJson } = require('../src/utils/http');

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.slice(2).split('=');
  return [k, v === undefined ? true : v];
}));
const words = args.filter((a) => !a.startsWith('--')).map((w) => w.toLowerCase());

if (!words.length && !flags.country && !flags.lang) {
  console.log('Use: npm run find-iptv -- <naam> [--country=IN] [--lang=ori,ory] [--urls] [--all]');
  process.exit(1);
}

(async () => {
  const base = config.iptvApiBase;
  const get = (n) => fetchJson(`${base}/${n}.json`, { timeoutMs: 90000 });
  const [channels, streams, blocklist, feeds] = await Promise.all([
    get('channels'), get('streams'), get('blocklist').catch(() => []),
    flags.lang ? get('feeds') : Promise.resolve([]),
  ]);

  const blocked = new Set(blocklist.map((b) => b.channel));
  const langs = flags.lang ? String(flags.lang).split(',') : null;
  const langChannels = langs
    ? new Set(feeds.filter((f) => (f.languages || []).some((l) => langs.includes(l))).map((f) => f.channel))
    : null;

  const streamsBy = new Map();
  for (const s of streams) {
    if (!s.channel) continue;
    if (!streamsBy.has(s.channel)) streamsBy.set(s.channel, []);
    streamsBy.get(s.channel).push(s);
  }

  const hits = channels.filter((c) => {
    if (!flags.all && c.closed) return false;
    if (flags.country && c.country !== String(flags.country).toUpperCase()) return false;
    if (langChannels && !langChannels.has(c.id)) return false;
    const hay = [c.id, c.name, c.network, ...(c.alt_names || [])].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });

  if (!hits.length) return console.log('Kuch nahi mila. Spelling badal ke / --country hata ke try karo.');

  for (const c of hits) {
    const ss = streamsBy.get(c.id) || [];
    const tag = [c.closed ? '[CLOSED]' : '', blocked.has(c.id) ? '[BLOCKED]' : ''].filter(Boolean).join(' ');
    console.log(`\n${c.id}   ${c.name}  [${c.country}]  streams: ${ss.length} ${tag}`);
    if (ss.length) console.log(`   channels.js:  { type: 'iptv', channelId: '${c.id}' }`);
    if (flags.urls) {
      for (const s of ss) console.log(`   - ${s.url} ${s.quality || ''} ${(s.labels || []).join(',')}`);
    }
  }
  console.log(`\n${hits.length} channel(s) mile.`);
})().catch((e) => { console.error('fail:', e.message); process.exit(1); });
