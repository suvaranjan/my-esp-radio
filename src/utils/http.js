'use strict';

// Node 18+ ka built-in fetch. Body padhne tak timeout laga rehta hai.
async function fetchText(url, { headers = {}, timeoutMs = 15000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ac.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, opts) {
  return JSON.parse(await fetchText(url, opts));
}

module.exports = { fetchText, fetchJson };
