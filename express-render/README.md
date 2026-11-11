# Radio Server (Render.com Docker 24/7 Edition)

Yeh folder Render.com par continuous live radio streaming server chalane ke liye configured hai.

---

## Kyun Render + Docker?
1. **Zero Execution Timeout:** Vercel jaisa 10-15 second ka timeout nahi hota; yeh ek **persistent web service** hai.
2. **Built-in FFmpeg & yt-dlp:** Dockerfile mein `ffmpeg` aur `yt-dlp` automatically install hote hain.
3. **100% Free:** Render ka free tier 750 hours/month deta hai (poora 31-day month chal sakta hai).

---

## Deployment Steps (Render.com)

### Step 1: GitHub par Push karein
Agar aapka project GitHub par hai, to is `express-render` folder ko apne repository mein push karein.

### Step 2: Render.com par New Web Service banayein
1. [Render.com](https://dashboard.render.com) par login karein.
2. **New +** button par click karke **Web Service** chunein.
3. Apna GitHub repository connect karein.
4. Settings mein:
   - **Name:** `radio-server` (ya koi bhi naam)
   - **Root Directory:** `express-render`
   - **Language / Runtime:** **Docker** (Render Dockerfile ko khud detect kar lega)
   - **Plan:** **Free** ($0/month)
5. **Deploy Web Service** par click karein!

Render image build karega (`ffmpeg`, `yt-dlp`, Node.js setup karega) aur aapko ek live URL de dega:
`https://radio-server-xxxx.onrender.com`

---

## 24/7 Uptime Setup (Taaki Server Kabhi So Na Jaye / Sleep Na Ho)

Render free tier 15 minute bina traffic ke sleep ho jata hai. Isko 24/7 jagaye rakhne ke liye:

1. [UptimeRobot.com](https://uptimerobot.com) par free account banayein.
2. **Add New Monitor** par click karein:
   - **Monitor Type:** `HTTP(s)`
   - **Friendly Name:** `Radio Server Health`
   - **URL (or IP):** `https://radio-server-xxxx.onrender.com/health`
   - **Monitoring Interval:** `5 minutes`
3. **Create Monitor** par click karein.

Ab UptimeRobot har 5 minute mein Render ko ping karega, Render sochega ki active traffic hai aur **kabhi sleep nahi karega**!

---

## ESP32 mein kaunsa link use karein?
Aapke ESP32 mein ye URL daalein:
`http://radio-server-xxxx.onrender.com/stream/otv?q=lite`
