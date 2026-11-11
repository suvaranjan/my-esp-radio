'use strict';
const express = require('express');

// ICY headers sirf ASCII ho sakte hain
const ascii = (s) => String(s || '').replace(/[^\x20-\x7E]/g, '').trim();

module.exports = function streamRoutes({ manager, config, profiles }) {
  const router = express.Router();

  // /stream/otv   ya   /stream/otv.mp3   (+ ?q=lite)
  router.get('/stream/:slug', async (req, res) => {
    const slug = req.params.slug.replace(/\.mp3$/i, '').toLowerCase();
    const profileName = req.query.q === 'lite' ? 'lite' : 'default';

    const channel = manager.getChannel(slug);
    if (!channel) return res.status(404).json({ error: 'channel nahi mila', slug });

    const headers = {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'icy-name': ascii(channel.name),
      'icy-genre': ascii(channel.genre || 'Radio'),
      'icy-br': String(profiles[profileName].icyBr),
      'icy-pub': '0',
    };

    // HEAD par pipeline start nahi karte
    if (req.method === 'HEAD') return res.set(headers).status(200).end();

    const { pipeline, error } = manager.getPipeline(slug, profileName);
    if (error === 'busy') {
      return res.status(503).set('Retry-After', '15').json({ error: 'server busy: max active channels', retryAfterSec: 15 });
    }
    if (!pipeline) return res.status(400).json({ error });

    // Pipeline live hone tak wait (headers abhi nahi bheje). Timeout par 503.
    let waiting = true;
    pipeline.addWaiter();
    res.once('close', () => {
      if (waiting) { waiting = false; pipeline.removeWaiter(); } // client wait ke beech chala gaya
    });

    const ok = await pipeline.whenLive(config.startWaitMs);
    if (!waiting) return; // client chala gaya
    if (!ok) {
      waiting = false;
      pipeline.removeWaiter();
      return res.status(503).set('Retry-After', '10').json({
        error: 'channel abhi live nahi ho paya, thodi der baad try karo',
        lastError: pipeline.lastError,
        retryAfterSec: 10,
      });
    }

    if (res.socket) { res.socket.setNoDelay(true); res.socket.setTimeout(0); }
    res.writeHead(200, headers);
    pipeline.addClient(res);
    waiting = false;
    pipeline.removeWaiter();
    res.once('close', () => pipeline.removeClient(res));
  });

  return router;
};
