'use strict';
const assert = require('assert');
const { fechaLocal } = require('../src/utils/fecha');
// 20/oct/2026 23:30 hora local: con toISOString() en UTC-8 saldría 21/10.
assert.strictEqual(fechaLocal(new Date(2026, 9, 20, 23, 30)), '2026-10-20');
assert.strictEqual(fechaLocal(new Date(2026, 0, 5, 0, 5)), '2026-01-05');
console.log('fecha.manual.js: OK');
