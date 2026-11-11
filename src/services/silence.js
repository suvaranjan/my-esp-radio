'use strict';
const { spawn } = require('child_process');

/**
 * 1 second ka silent MP3 (har profile ke liye).
 * Source switch ke dauran ESP32 ko ye bhejte hain taaki uska buffer khali na ho aur connection na toote.
 */
class Silence {
  constructor({ config, logger }) {
    this.config = config;
    this.log = logger.child('silence');
    this.buffers = new Map();
  }

  async init(profiles) {
    for (const [name, p] of Object.entries(profiles)) {
      const buf = await this._generate(p);
      if (buf && buf.length) this.buffers.set(name, buf);
      else this.log.warn(`silence generate nahi hua (${name}); switch ke dauran khamoshi nahi bhejenge`);
    }
  }

  get(profileName) { return this.buffers.get(profileName) || null; }

  _generate(p) {
    return new Promise((resolve) => {
      const args = [
        '-loglevel', 'error', '-f', 'lavfi',
        '-i', `anullsrc=r=${p.sampleRate}:cl=${p.channels === 1 ? 'mono' : 'stereo'}`,
        '-t', '1', '-acodec', 'libmp3lame', '-b:a', p.bitrate,
        '-ar', String(p.sampleRate), '-ac', String(p.channels),
        '-write_xing', '0', '-id3v2_version', '0', '-f', 'mp3', 'pipe:1',
      ];
      const chunks = [];
      let ff;
      try {
        ff = spawn(this.config.ffmpegPath, args, { stdio: ['ignore', 'pipe', 'ignore'] });
      } catch { return resolve(null); }
      ff.stdout.on('data', (c) => chunks.push(c));
      ff.on('error', () => resolve(null));
      ff.on('close', (code) => resolve(code === 0 ? Buffer.concat(chunks) : null));
    });
  }
}

module.exports = Silence;
