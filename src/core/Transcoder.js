'use strict';
const { spawn } = require('child_process');
const EventEmitter = require('events');
const { killProc, eachLine } = require('../utils/spawn');
const { pickAudioFriendlyUrl } = require('../utils/hls');

/**
 * Ek chalti hui (yt-dlp ->) ffmpeg jodi.
 * Events:  'data' (mp3 chunk)   |   'exit' ({who, code, signal, tail})  -- sirf tab jab hamne kill nahi kiya
 */
class TranscodeHandle extends EventEmitter {
  constructor({ ff, yt, log }) {
    super();
    this.ff = ff;
    this.yt = yt || null;
    this.log = log;
    this.killed = false;
    this.exited = false;
    this.tail = [];

    const push = (line) => {
      this.tail.push(line);
      if (this.tail.length > 8) this.tail.shift();
    };
    const watchErr = (proc, name) => {
      proc.stderr.on('data', (d) => eachLine(d, (line) => {
        push(`${name}: ${line}`);
        this.log.debug(`${name}: ${line}`);
      }));
      proc.on('error', (e) => {
        push(`${name} spawn error: ${e.message}`);
        this._onExit(name, -1, null);
      });
      proc.on('close', (code, signal) => this._onExit(name, code, signal));
    };

    ff.stdout.on('data', (c) => this.emit('data', c));
    ff.stdout.on('error', () => {});
    if (ff.stdin) ff.stdin.on('error', () => {});
    watchErr(ff, 'ffmpeg');
    if (yt) {
      yt.stdout.on('error', () => {});
      watchErr(yt, 'yt-dlp');
    }
  }

  _onExit(who, code, signal) {
    if (this.killed || this.exited) return;
    this.exited = true;
    killProc(this.yt);
    killProc(this.ff);
    // setImmediate: spawn error turant aata hai, caller ke listener lagane ke baad emit ho
    const info = { who, code, signal, tail: [...this.tail] };
    setImmediate(() => this.emit('exit', info));
  }

  kill() {
    if (this.killed) return;
    this.killed = true;
    killProc(this.yt);
    killProc(this.ff);
  }
}

class Transcoder {
  constructor({ config, logger }) {
    this.config = config;
    this.log = logger.child('transcoder');
  }

  async start(candidate, profile, { tag = 'x' } = {}) {
    const log = this.log.child(tag);
    return candidate.kind === 'ytdlp'
      ? this._startYtdlp(candidate, profile, log)
      : this._startUrl(candidate, profile, log);
  }

  _outputArgs(profile) {
    return [
      '-vn', '-sn', '-dn',
      '-map', '0:a:0?',
      '-acodec', 'libmp3lame',
      '-b:a', profile.bitrate,
      '-ar', String(profile.sampleRate),
      '-ac', String(profile.channels),
      '-write_xing', '0',      // endless stream: Xing header nahi chahiye
      '-id3v2_version', '0',
      '-f', 'mp3',
      'pipe:1',
    ];
  }

  async _startUrl(candidate, profile, log) {
    let input = candidate.url;
    const h = candidate.headers || {};
    const isHttp = /^https?:\/\//i.test(input);

    if (isHttp && this.config.hlsPickLowest && /m3u8/i.test(input)) {
      const picked = await pickAudioFriendlyUrl(input, {
        headers: {
          ...(h.referrer ? { Referer: h.referrer } : {}),
          ...(h.userAgent ? { 'User-Agent': h.userAgent } : {}),
        },
      });
      if (picked !== input) log.debug(`hls variant: ${picked}`);
      input = picked;
    }

    const args = ['-loglevel', 'warning', '-nostdin'];
    if (isHttp) {
      args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
        '-rw_timeout', '15000000');
      if (h.userAgent) args.push('-user_agent', h.userAgent);
      if (h.referrer) args.push('-referer', h.referrer);
    } else {
      args.push('-re', '-stream_loop', '-1'); // local file (testing): real-time + loop
    }
    args.push('-i', input, ...this._outputArgs(profile));

    log.debug(`ffmpeg ${args.join(' ')}`);
    const ff = spawn(this.config.ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    return new TranscodeHandle({ ff, yt: null, log });
  }

  async _startYtdlp(candidate, profile, log) {
    const yArgs = [];
    if (this.config.ytdlpJsRuntime) yArgs.push('--js-runtimes', this.config.ytdlpJsRuntime);
    if (this.config.ytdlpCookies) yArgs.push('--cookies', this.config.ytdlpCookies);
    yArgs.push('-f', 'ba/wa/w', '--no-playlist', '--no-part', '--no-warnings', '-o', '-', candidate.url);

    const fArgs = ['-loglevel', 'warning', '-i', 'pipe:0', ...this._outputArgs(profile)];

    log.debug(`yt-dlp ${yArgs.join(' ')}`);
    const yt = spawn(this.config.ytdlpPath, yArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    const ff = spawn(this.config.ffmpegPath, fArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    yt.stdout.pipe(ff.stdin);
    return new TranscodeHandle({ ff, yt, log });
  }
}

module.exports = Transcoder;
