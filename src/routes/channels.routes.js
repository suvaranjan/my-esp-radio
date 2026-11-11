'use strict';
const express = require('express');

module.exports = function channelsRoutes({ manager }) {
  const router = express.Router();
  const base = (req) => `${req.protocol}://${req.get('host')}`;

  // ESP32 / app ke liye channel list
  router.get('/api/channels', (req, res) => {
    const b = base(req);
    res.json(manager.list().map((c) => ({ ...c, stream: `${b}/stream/${c.slug}`, streamLite: `${b}/stream/${c.slug}?q=lite` })));
  });

  router.get('/api/channels/:slug', (req, res) => {
    const d = manager.detail(req.params.slug);
    if (!d) return res.status(404).json({ error: 'channel nahi mila' });
    res.json({ ...d, stream: `${base(req)}/stream/${d.slug}` });
  });

  // VLC / players ke liye
  router.get('/playlist.m3u', (req, res) => {
    const b = base(req);
    const lines = ['#EXTM3U'];
    for (const c of manager.list()) {
      lines.push(`#EXTINF:-1 tvg-id="${c.slug}" group-title="${c.genre || 'Radio'}",${c.name}`);
      lines.push(`${b}/stream/${c.slug}`);
    }
    res.type('audio/x-mpegurl').send(lines.join('\n') + '\n');
  });

  return router;
};
