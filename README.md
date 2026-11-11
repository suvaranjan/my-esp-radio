# ESP32 Internet Radio Server

YouTube live + IPTV (iptv-org) streams ko **sirf audio (MP3)** mein badal kar ESP32 ko deta hai.
Har channel ke paas ek stable URL hai, aur source fail hone par server khud agle source par chala jata hai.

```
ESP32 -> GET /stream/otv -> [YouTube -> IPTV -> pinned HLS] (failover) -> yt-dlp/ffmpeg -> MP3 -> listeners
```

## Setup

Zaroori: Node 18+, `ffmpeg`, aur (YouTube ke liye) `yt-dlp`.

```bash
npm install
cp .env.example .env      # paths / limits yahan badlo
npm start
```

## Channel add / badalna

Sirf **`src/config/channels.js`** edit karo. Har channel ke `sources` priority order mein hote hain.

```js
{ slug: 'otv', name: 'Odisha TV', sources: [
    { type: 'youtube', url: 'https://www.youtube.com/@Handle/live' },  // pehle ye
    { type: 'iptv',    channelId: 'OdishaTV.in' },                     // fail to ye (iptv-org)
    { type: 'hls',     url: 'https://.../index.m3u8' },                // last resort
] }
```

Channel ID dhoondhna:  `npm run find-iptv -- odisha --country=IN --urls`
Sab sources ko test karna:  `npm run probe`   (ya `npm run probe -- --only=otv`)

## URLs

| URL | Kaam |
|---|---|
| `/stream/<slug>` (ya `.mp3`) | MP3 stream (ESP32 ye use kare). `?q=lite` = 64k mono |
| `/api/channels`, `/api/channels/<slug>` | list / detail + status + source health |
| `/playlist.m3u` | VLC ke liye |
| `/health`, `/status` | monitoring |
| `POST /admin/restart/<slug>`, `/admin/refresh-catalog`, `/admin/reset-health` | `x-admin-token: <ADMIN_TOKEN>` header ke saath |

## Kaise kaam karta hai (short)

- Pehla listener aate hi pipeline start; aakhri ke `IDLE_STOP_MS` baad band. Ek channel ke saare listeners ek hi yt-dlp/ffmpeg share karte hain.
- Source fail (exit / `STARTUP_TIMEOUT_MS` mein audio nahi / `STALL_MS` se audio band) -> us source ka cooldown (30s, 2m, 5m, 15m, 30m) -> agla source.
- Switch ke dauran listeners ko silent MP3 jata hai, taaki ESP32 disconnect na ho.
- iptv-org API sirf start par, har `CATALOG_REFRESH_HOURS` mein, ya sab sources fail hone par (30 min gap) fetch hoti hai. Disk cache `data/cache/` offline fallback hai.
- Channel live na ho paye to `503` + `Retry-After` (ESP32 retry kare).

## Structure

`src/config` settings + channel list - `src/routes` HTTP - `src/core` pipeline, failover, health - `src/sources` youtube/iptv/hls - `src/services` iptv catalog, silence, prober - `scripts` find/probe tools - `test` (`npm test`).

## ESP32 tips

- LAN par plain `http://` use karo (HTTPS ESP32 par bhaari hai).
- Pehle `/stream/<slug>?q=lite` try karo agar WiFi weak ho ya audio atakta ho.
- 24/7 ke liye laptop ki jagah Raspberry Pi / mini-PC par chalao (`deploy/radio.service` = systemd unit).
