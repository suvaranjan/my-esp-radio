'use strict';

// Pinned direct .m3u8 (ya koi bhi stream URL jo ffmpeg seedha padh sake).
module.exports = {
  type: 'hls',
  validate(src) {
    if (!src.url) throw new Error("hls source mein 'url' chahiye");
  },
  async candidates(src) {
    return [{
      id: `hls:${src.url}`,
      kind: 'url',
      url: src.url,
      headers: { referrer: src.referrer || null, userAgent: src.userAgent || null },
      label: src.label || `hls ${src.url.slice(0, 60)}`,
    }];
  },
};
