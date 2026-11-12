"use strict";

/**
 * TUMHARI CURATED CHANNEL LIST: sirf yahi file edit karni hai.
 *
 * Har channel:
 *   slug      : URL mein use hoga -> /stream/<slug>   (sirf a-z, 0-9, '-')
 *   name      : display naam (ICY header ke liye ASCII rakho)
 *   language  : bas info ke liye
 *   genre     : optional
 *   enabled   : false kar do to channel band
 *   alwaysOn  : true = bina listener ke bhi chalta rahe (default false)
 *   sources   : PRIORITY order mein. Pehla fail hua to agla try hoga.
 *
 * Source types:
 *   { type: 'youtube', url: 'https://www.youtube.com/watch?v=XXXX' }
 *        TIP: video ID badalta rehta hai to channel ka live URL do:
 *        'https://www.youtube.com/@handle/live'  ya  '.../channel/UCxxxx/live'
 *   { type: 'iptv', channelId: 'OdishaTV.in' }          // iptv-org API se auto-resolve
 *        optional: feed: 'SD', max: 3
 *   { type: 'hls', url: 'https://.../index.m3u8' }      // pinned direct link
 *        optional: referrer, userAgent
 *
 * Channel ID dhoondhne ke liye:  npm run find-iptv -- odisha
 */
module.exports = [
  {
    slug: "test",
    name: "YouTube Test Stream",
    language: "en",
    genre: "Test",
    sources: [
      { type: "youtube", url: "https://www.youtube.com/@otvodisha/live" },
    ],
  },

  // ---- Odia channels (IPTV, iptv-org channel IDs) ----
  {
    slug: "otv",
    name: "Odisha TV",
    language: "or",
    genre: "News",
    sources: [{ type: "iptv", channelId: "OdishaTV.in" }],
  },

  {
    slug: "tarang",
    name: "Tarang TV",
    language: "or",
    genre: "Entertainment",
    sources: [{ type: "iptv", channelId: "TarangTV.in" }],
  },

  {
    slug: "tarang-music",
    name: "Tarang Music",
    language: "or",
    genre: "Music",
    sources: [{ type: "iptv", channelId: "TarangMusic.in" }],
  },

  {
    slug: "kanak",
    name: "Kanak News",
    language: "or",
    genre: "News",
    sources: [{ type: "iptv", channelId: "KanakNews.in" }],
  },

  {
    slug: "news18-odia",
    name: "News18 Odia",
    language: "or",
    genre: "News",
    sources: [{ type: "iptv", channelId: "News18Odia.in" }],
  },

  {
    slug: "kalinga",
    name: "Kalinga TV",
    language: "or",
    genre: "News",
    sources: [{ type: "iptv", channelId: "KalingaTV.in" }],
  },

  {
    slug: "ekamra",
    name: "Ekamra Bharat Odia",
    language: "or",
    genre: "News",
    sources: [{ type: "iptv", channelId: "EkamraBharatOdia.in" }],
  },

  {
    slug: "dd-odia",
    name: "DD Odia",
    language: "or",
    genre: "General",
    sources: [{ type: "iptv", channelId: "DDOdia.in" }],
  },
  {
    slug: "kiran",
    name: "kiran tv",
    language: "or",
    genre: "General",
    sources: [{ type: "iptv", channelId: "RepublicTV.in" }],
  },
  {
    slug: "radio-choklate",
    name: "Radio Choklate 104 FM",
    language: "or",
    genre: "Music",
    sources: [{ type: "hls", url: "https://stream.zeno.fm/1t5ceyhcxbruv" }],
  },

  // ---- Example: teeno sources ek saath (YouTube -> IPTV -> pinned) ----
  // { slug: 'example', name: 'Example', language: 'or', alwaysOn: false, enabled: false,
  //   sources: [
  //     { type: 'youtube', url: 'https://www.youtube.com/@SomeChannel/live' },
  //     { type: 'iptv', channelId: 'SomeChannel.in' },
  //     { type: 'hls', url: 'https://example.com/live/index.m3u8' },
  //   ] },
];
