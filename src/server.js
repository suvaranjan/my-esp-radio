'use strict';
const config = require('./config');
const path = require('path');
const channels = config.channelsFile ? require(path.resolve(config.channelsFile)) : require('./config/channels');
const profiles = require('./config/profiles');
const logger = require('./utils/logger');

const SourceHealth = require('./core/SourceHealth');
const Transcoder = require('./core/Transcoder');
const ChannelManager = require('./core/ChannelManager');
const IptvCatalog = require('./services/iptvCatalog');
const Silence = require('./services/silence');
const { Prober } = require('./services/prober');
const { collectIptvIds, validateChannels } = require('./sources');
const createApp = require('./app');

async function main() {
  validateChannels(channels); // galti ho to yahin saaf error

  const health = new SourceHealth();
  const transcoder = new Transcoder({ config, logger });
  const catalog = new IptvCatalog({ config, logger, wantedIds: collectIptvIds(channels) });
  const silence = new Silence({ config, logger });

  await catalog.init();          // disk cache turant (agar hai)
  catalog.startAutoRefresh();    // network refresh background mein
  await silence.init(profiles);

  const manager = new ChannelManager({ config, channels, profiles, catalog, health, silence, transcoder, logger });
  const prober = new Prober({ config, manager, catalog, health, transcoder, profiles, logger });
  prober.start();

  const app = createApp({ manager, config, catalog, health, profiles, logger });
  const server = app.listen(config.port, () => {
    logger.info(`radio server: http://localhost:${config.port}  (${manager.channels.size} channels)`);
    logger.info(`playlist: http://localhost:${config.port}/playlist.m3u`);
  });
  manager.startAlwaysOn();

  let closing = false;
  const shutdown = (sig) => {
    if (closing) return;
    closing = true;
    logger.info(`${sig}: shutting down`);
    manager.stopAll();
    catalog.stop();
    prober.stop();
    server.close(() => process.exit(0));
    if (server.closeAllConnections) server.closeAllConnections();
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((e) => {
  logger.error(e.stack || e.message);
  process.exit(1);
});
