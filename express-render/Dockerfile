FROM node:20-bookworm-slim

# Install system dependencies: ffmpeg, python3, curl, ca-certificates
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      curl \
      ca-certificates && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install npm dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Environment configuration
ENV NODE_ENV=production
ENV PORT=3000
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV FFMPEG_PATH=ffmpeg

EXPOSE 3000

# Start the continuous radio streaming server
CMD ["node", "src/server.js"]
