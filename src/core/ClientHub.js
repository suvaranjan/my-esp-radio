'use strict';

/** Ek channel ke saare listeners (HTTP responses). Chunk sabko baantta hai. */
class ClientHub {
  constructor({ maxBuffered, log }) {
    this.clients = new Set();
    this.maxBuffered = maxBuffered;
    this.log = log;
  }

  get size() { return this.clients.size; }

  add(res) { this.clients.add(res); }

  remove(res) { return this.clients.delete(res); }

  broadcast(chunk) {
    for (const res of this.clients) {
      if (res.destroyed || res.writableEnded) {
        this.clients.delete(res);
        continue;
      }
      if (res.writableLength > this.maxBuffered) { // bahut slow client
        this.log.warn('slow client drop (buffer full)');
        res.destroy();
        this.clients.delete(res);
        continue;
      }
      res.write(chunk);
    }
  }

  closeAll() {
    for (const res of this.clients) {
      try { res.end(); } catch { /* ignore */ }
    }
    this.clients.clear();
  }
}

module.exports = ClientHub;
