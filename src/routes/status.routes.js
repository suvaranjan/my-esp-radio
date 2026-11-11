'use strict';
const express = require('express');

module.exports = function statusRoutes({ manager }) {
  const router = express.Router();
  router.get('/health', (req, res) => res.json({ ok: true }));
  router.get('/status', (req, res) => res.json(manager.status()));
  return router;
};
