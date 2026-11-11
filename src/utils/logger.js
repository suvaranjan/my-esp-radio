'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const levelNow = () => LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function make(tag) {
  const emit = (lvl, args) => {
    if (LEVELS[lvl] < levelNow()) return;
    const ts = new Date().toISOString().slice(11, 23);
    const line = `${ts} ${lvl.toUpperCase().padEnd(5)} ${tag ? `[${tag}] ` : ''}${args.join(' ')}`;
    (lvl === 'error' || lvl === 'warn' ? console.error : console.log)(line);
  };
  return {
    debug: (...a) => emit('debug', a),
    info: (...a) => emit('info', a),
    warn: (...a) => emit('warn', a),
    error: (...a) => emit('error', a),
    child: (t) => make(tag ? `${tag}/${t}` : t),
  };
}

module.exports = make('');
