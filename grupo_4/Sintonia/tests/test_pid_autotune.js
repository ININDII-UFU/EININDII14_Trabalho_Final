const assert = require('assert');
require('../resources/pid-tuning/pid-autotune.js');

const dt = 0.5;
const K = 2.0;
const L = 3.0;
const T = 10.0;
const stepTime = 10.0;
const u0 = 20.0;
const deltaU = 10.0;
const y0 = 30.0;

const time = [];
const pv = [];
const mv = [];

for (let t = 0; t <= 80; t += dt) {
  time.push(t);
  mv.push(t < stepTime ? u0 : u0 + deltaU);

  const relative = t - stepTime;
  const value = relative <= L
    ? y0
    : y0 + K * deltaU * (1 - Math.exp(-(relative - L) / T));

  pv.push(value);
}

const model = globalThis.PidAutoTune.analyzeStepResponse({
  time,
  pv,
  mv,
  pvSpan: 100,
  mvSpan: 100
});

assert(Math.abs(model.processGain - K) < 0.08);
assert(Math.abs(model.deadTime - L) < 1.0);
assert(Math.abs(model.timeConstant - T) < 1.2);
assert(model.r2 > 0.98);

const zn = globalThis.PidAutoTune.calculateTuning(
  model,
  'zn',
  'PID'
);
assert(Number.isFinite(zn.kp));
assert(zn.ti > 0);
assert(zn.td > 0);

const imc = globalThis.PidAutoTune.calculateTuning(
  model,
  'imc',
  'PI',
  8
);
assert(Number.isFinite(imc.kp));
assert(imc.ti > 0);
assert.strictEqual(imc.td, 0);

console.log(JSON.stringify({
  identified: {
    K: model.processGain,
    L: model.deadTime,
    T: model.timeConstant,
    r2: model.r2
  },
  znPid: zn,
  imcPi: imc
}, null, 2));
