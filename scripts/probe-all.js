#!/usr/bin/env node
'use strict';
/**
 * Tumhare channels.js ke har channel ke har source ko ASLI ffmpeg se test karta hai
 * (jo server karta hai wahi): timeout ke andar pehla audio chunk aaya to OK.
 *
 *   npm run probe
 *   npm run probe -- --only=otv,kanak --timeout=20000 --concurrency=3
 */
const config = require('../src/config');
const channels = require('../src/config/channels');
const profiles = require('../src/config/profiles');
const logger = require('../src/utils/logger');
const Transcoder = require('../src/core/Transcoder');
const IptvCatalog = require('../src/services/iptvCatalog');
const { probeCandidate } = require('../src/services/prober');
const { collectIptvIds, resolveChannel, validateChannels } = require('../src/sources');

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.slice(2).split('=');
  return [k, v === undefined ? true : v];
}));

(async () => {
  validateChannels(channels);
  const only = flags.only ? String(flags.only).split(',') : null;
  const timeout = parseInt(flags.timeout, 10) || 15000;
  const conc = Math.max(1, parseInt(flags.concurrency, 10) || 3);

  const catalog = new IptvCatalog({ config, logger, wantedIds: collectIptvIds(channels) });
  await catalog.init();
  console.log('iptv-org catalog refresh ho raha hai...');
  await catalog.refresh();

  const transcoder = new Transcoder({ config, logger });
  const targets = channels.filter((c) => c.enabled !== false && (!only || only.includes(c.slug)));

  let deadChannels = 0;
  for (const ch of targets) {
    const list = await resolveChannel(ch, { config, catalog, logger });
    console.log(`\n== ${ch.slug} (${ch.name}) -- ${list.length} candidate(s)`);
    if (!list.length) { console.log('   (koi candidate nahi)'); deadChannels++; continue; }

    const results = new Array(list.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(conc, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        results[i] = await probeCandidate(transcoder, list[i], profiles.lite, timeout);
      }
    }));
    list.forEach((c, i) => {
      const r = results[i];
      console.log(`   ${r.ok ? 'OK  ' : 'FAIL'}  ${c.label}  ${r.ok ? `${r.ms}ms` : r.error}\n         ${c.url}`);
    });
    if (!results.some((r) => r.ok)) deadChannels++;
  }

  console.log(`\n${targets.length - deadChannels}/${targets.length} channel(s) mein kam se kam ek source chal raha hai.`);
  process.exit(deadChannels ? 1 : 0);
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
