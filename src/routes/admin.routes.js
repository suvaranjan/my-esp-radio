'use strict';
const crypto = require('crypto');
const express = require('express');

module.exports = function adminRoutes({ manager, catalog, health, config }) {
  const router = express.Router();

  // Header: "x-admin-token: <token>"  ya  "Authorization: Bearer <token>"
  router.use('/admin', (req, res, next) => {
    if (!config.adminToken) return res.status(503).json({ error: 'ADMIN_TOKEN set nahi hai; admin routes band hain' });
    const given = req.get('x-admin-token') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(given);
    const b = Buffer.from(config.adminToken);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'unauthorized' });
    next();
  });

  router.post('/admin/refresh-catalog', async (req, res) => {
    const ok = await catalog.refresh();
    res.json({ ok, catalog: catalog.info() });
  });

  router.post('/admin/restart/:slug', (req, res) => {
    if (!manager.restart(req.params.slug)) return res.status(404).json({ error: 'channel nahi mila' });
    res.json({ ok: true });
  });

  router.post('/admin/reset-health', (req, res) => {
    health.reset('');
    res.json({ ok: true });
  });

  return router;
};
