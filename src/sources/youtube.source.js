'use strict';

// YouTube: page URL -> yt-dlp -> ffmpeg. Ek hi candidate.
module.exports = {
  type: 'youtube',
  validate(src) {
    if (!src.url) throw new Error("youtube source mein 'url' chahiye");
  },
  async candidates(src) {
    return [{
      id: `yt:${src.url}`,
      kind: 'ytdlp',
      url: src.url,
      headers: {},
      label: `youtube ${src.url.replace(/^https?:\/\/(www\.)?youtube\.com\//, '')}`,
    }];
  },
};
