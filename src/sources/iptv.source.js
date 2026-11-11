'use strict';

// iptv-org: channelId (jaise "OdishaTV.in") -> catalog se ranked stream candidates (kai ho sakte hain).
module.exports = {
  type: 'iptv',
  validate(src) {
    if (!src.channelId) throw new Error("iptv source mein 'channelId' chahiye");
  },
  async candidates(src, { catalog, config }) {
    if (!catalog) return [];
    return catalog.getCandidates(src.channelId, {
      feed: src.feed || null,
      max: src.max || config.iptvMaxCandidates,
    });
  },
};
