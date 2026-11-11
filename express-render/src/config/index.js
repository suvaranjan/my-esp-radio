'use strict';
const path = require('path');
require('dotenv').config();

const int = (name, def) => {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : def;
};
const str = (name, def) => {
  const v = process.env[name];
  return v !== undefined && v !== '' ? v : def;
};
const bool = (name, def) => {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  return /^(1|true|yes|on)$/i.test(v);
};

const root = path.resolve(__dirname, '..', '..');

module.exports = Object.freeze({
  root,
  port: int('PORT', 3000),
  channelsFile: str('CHANNELS_FILE', ''), // optional: alag channel list ka path (testing)

  ytdlpPath: str('YTDLP_PATH', 'yt-dlp'),
  ytdlpJsRuntime: str('YTDLP_JS_RUNTIME', 'node'),
  ytdlpCookies: str('YTDLP_COOKIES', ''),
  ffmpegPath: str('FFMPEG_PATH', 'ffmpeg'),

  adminToken: str('ADMIN_TOKEN', ''),

  maxPipelines: int('MAX_PIPELINES', 4),
  idleStopMs: int('IDLE_STOP_MS', 15000),
  startWaitMs: int('START_WAIT_MS', 20000),
  startupTimeoutMs: int('STARTUP_TIMEOUT_MS', 25000),
  stallMs: int('STALL_MS', 15000),
  switchDelayMs: int('SWITCH_DELAY_MS', 500),
  maxBuffered: int('MAX_BUFFERED', 2 * 1024 * 1024),

  iptvApiBase: str('IPTV_API_BASE', 'https://iptv-org.github.io/api').replace(/\/$/, ''),
  catalogRefreshHours: int('CATALOG_REFRESH_HOURS', 8),
  iptvMaxCandidates: int('IPTV_MAX_CANDIDATES', 4),
  hlsPickLowest: bool('HLS_PICK_LOWEST', true),
  cacheDir: path.join(root, 'data', 'cache'),

  probeIntervalMin: int('PROBE_INTERVAL_MIN', 0),
});
