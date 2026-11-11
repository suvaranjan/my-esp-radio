'use strict';

// Audio output profiles. ESP32 ke liye "default"; weak WiFi / chhote board ke liye "lite".
// Use: /stream/<slug>?q=lite
module.exports = {
  default: { bitrate: '128k', sampleRate: 44100, channels: 2, icyBr: 128 },
  lite: { bitrate: '64k', sampleRate: 22050, channels: 1, icyBr: 64 },
};
