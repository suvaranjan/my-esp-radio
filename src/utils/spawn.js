'use strict';

// SIGTERM, aur grace period mein na mare to SIGKILL.
function killProc(proc, graceMs = 3000) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  try { proc.kill('SIGTERM'); } catch { /* already dead */ }
  const t = setTimeout(() => {
    if (proc.exitCode === null && proc.signalCode === null) {
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
    }
  }, graceMs);
  t.unref();
}

// stderr ko lines mein todta hai (ffmpeg ka progress noise hata kar).
function eachLine(chunk, fn) {
  for (const raw of chunk.toString().split(/\r|\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(frame=|size=)/.test(line)) continue;
    fn(line);
  }
}

module.exports = { killProc, eachLine };
