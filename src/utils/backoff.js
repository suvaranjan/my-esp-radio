'use strict';

// n = 1,2,3... (kitni baar fail hua). Steps array mein se n-th value, last pe ruk jata hai.
const stepped = (steps, n) => steps[Math.min(Math.max(n - 1, 0), steps.length - 1)];

// base * 2^(n-1), max tak
const expo = (base, max, n) => Math.min(max, base * 2 ** Math.max(n - 1, 0));

module.exports = { stepped, expo };
