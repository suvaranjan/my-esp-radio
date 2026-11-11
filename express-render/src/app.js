'use strict';
const express = require('express');
const cors = require('cors');

const streamRoutes = require('./routes/stream.routes');
const channelsRoutes = require('./routes/channels.routes');
const statusRoutes = require('./routes/status.routes');
const adminRoutes = require('./routes/admin.routes');

function createApp(deps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());

  app.use(streamRoutes(deps));
  app.use(channelsRoutes(deps));
  app.use(statusRoutes(deps));
  app.use(adminRoutes(deps));

  app.use((req, res) => res.status(404).json({ error: 'not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    deps.logger.error(`http error: ${err.stack || err.message}`);
    if (!res.headersSent) res.status(500).json({ error: 'internal error' });
  });
  return app;
}

module.exports = createApp;
