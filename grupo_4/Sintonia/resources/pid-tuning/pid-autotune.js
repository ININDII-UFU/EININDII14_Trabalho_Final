(function (global) {
  'use strict';

  const EPS = 1e-9;

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function average(values) {
    if (!values.length) return NaN;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function movingAverage(values, radius) {
    const result = [];
    const r = Math.max(0, Math.floor(radius || 0));

    for (let i = 0; i < values.length; i += 1) {
      const start = Math.max(0, i - r);
      const end = Math.min(values.length - 1, i + r);
      let sum = 0;
      let count = 0;

      for (let j = start; j <= end; j += 1) {
        const value = Number(values[j]);
        if (Number.isFinite(value)) {
          sum += value;
          count += 1;
        }
      }

      result.push(count ? sum / count : NaN);
    }

    return result;
  }

  function linearRegression(x, y) {
    if (x.length !== y.length || x.length < 2) {
      return { slope: NaN, intercept: NaN, r2: NaN };
    }

    const xMean = average(x);
    const yMean = average(y);
    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < x.length; i += 1) {
      numerator += (x[i] - xMean) * (y[i] - yMean);
      denominator += Math.pow(x[i] - xMean, 2);
    }

    const slope = Math.abs(denominator) < EPS
      ? 0
      : numerator / denominator;
    const intercept = yMean - slope * xMean;

    let ssResidual = 0;
    let ssTotal = 0;

    for (let i = 0; i < x.length; i += 1) {
      const predicted = intercept + slope * x[i];
      ssResidual += Math.pow(y[i] - predicted, 2);
      ssTotal += Math.pow(y[i] - yMean, 2);
    }

    return {
      slope,
      intercept,
      r2: ssTotal < EPS ? 1 : 1 - ssResidual / ssTotal
    };
  }

  function interpolateCrossing(time, normalized, startIndex, target) {
    for (let i = Math.max(1, startIndex); i < normalized.length; i += 1) {
      const y0 = normalized[i - 1];
      const y1 = normalized[i];

      if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;

      const crossed =
        (y0 <= target && y1 >= target) ||
        (y0 >= target && y1 <= target);

      if (!crossed || Math.abs(y1 - y0) < EPS) continue;

      const fraction = (target - y0) / (y1 - y0);
      return time[i - 1] + fraction * (time[i] - time[i - 1]);
    }

    return NaN;
  }

  function medianStep(time) {
    const diffs = [];

    for (let i = 1; i < time.length; i += 1) {
      const delta = time[i] - time[i - 1];
      if (Number.isFinite(delta) && delta > 0) diffs.push(delta);
    }

    diffs.sort((a, b) => a - b);

    if (!diffs.length) return 1;

    const middle = Math.floor(diffs.length / 2);
    return diffs.length % 2
      ? diffs[middle]
      : (diffs[middle - 1] + diffs[middle]) / 2;
  }

  function validateSeries(time, pv, mv) {
    if (!Array.isArray(time) || !Array.isArray(pv) || !Array.isArray(mv)) {
      throw new Error('As séries de tempo, PV e MV devem ser arrays.');
    }

    const length = Math.min(time.length, pv.length, mv.length);

    if (length < 12) {
      throw new Error(
        'São necessárias pelo menos 12 amostras para analisar o degrau.'
      );
    }

    const clean = { time: [], pv: [], mv: [] };

    for (let i = 0; i < length; i += 1) {
      const t = Number(time[i]);
      const y = Number(pv[i]);
      const u = Number(mv[i]);

      if (
        Number.isFinite(t) &&
        Number.isFinite(y) &&
        Number.isFinite(u)
      ) {
        clean.time.push(t);
        clean.pv.push(y);
        clean.mv.push(u);
      }
    }

    if (clean.time.length < 12) {
      throw new Error('Existem poucas amostras numéricas válidas.');
    }

    return clean;
  }

  function detectStep(time, mv, options) {
    const span = Math.max(
      Math.abs(finite(options.mvSpan, 100)),
      EPS
    );
    const minimumStep = Math.max(
      finite(options.minimumStep, span * 0.02),
      span * 0.005
    );

    const smoothed = movingAverage(mv, 1);
    let index = -1;
    let largestDelta = 0;

    for (let i = 1; i < smoothed.length; i += 1) {
      const delta = Math.abs(smoothed[i] - smoothed[i - 1]);

      if (delta > largestDelta) {
        largestDelta = delta;
        index = i;
      }
    }

    if (index < 3 || index > mv.length - 6) {
      throw new Error(
        'Não foi encontrado um degrau de MV com dados suficientes antes e depois.'
      );
    }

    const preCount = Math.max(
      3,
      Math.min(12, Math.floor(index * 0.35))
    );
    const tailCount = Math.max(
      4,
      Math.min(20, Math.floor((mv.length - index) * 0.25))
    );

    const u0 = average(
      mv.slice(Math.max(0, index - preCount), index)
    );
    const u1 = average(mv.slice(mv.length - tailCount));
    const deltaU = u1 - u0;

    if (Math.abs(deltaU) < minimumStep) {
      throw new Error(
        'A variação permanente de MV é pequena demais para identificar a planta.'
      );
    }

    return {
      index,
      time: time[index],
      initial: u0,
      final: u1,
      delta: deltaU,
      instantaneousDelta: largestDelta,
      tailCount,
      preCount
    };
  }

  function analyzeStepResponse(input) {
    const options = input || {};
    const clean = validateSeries(
      options.time,
      options.pv,
      options.mv
    );

    const time = clean.time;
    const pv = movingAverage(clean.pv, finite(options.smoothingRadius, 1));
    const mv = movingAverage(clean.mv, 1);
    const sampleTime = Math.max(medianStep(time), EPS);

    const step = detectStep(time, clean.mv, {
      mvSpan: options.mvSpan,
      minimumStep: options.minimumStep
    });

    const prePv = pv.slice(
      Math.max(0, step.index - step.preCount),
      step.index
    );
    const tailPv = pv.slice(pv.length - step.tailCount);

    const y0 = average(prePv);
    const y1 = average(tailPv);
    const deltaY = y1 - y0;

    const pvSpan = Math.max(
      Math.abs(finite(options.pvSpan, 100)),
      EPS
    );
    const minimumResponse = Math.max(
      finite(options.minimumResponse, pvSpan * 0.01),
      pvSpan * 0.002
    );

    if (Math.abs(deltaY) < minimumResponse) {
      throw new Error(
        'A resposta de PV é pequena demais ou ainda não alcançou um novo regime.'
      );
    }

    const normalized = pv.map(value => (value - y0) / deltaY);
    const t28Absolute = interpolateCrossing(
      time,
      normalized,
      step.index,
      0.283
    );
    const t63Absolute = interpolateCrossing(
      time,
      normalized,
      step.index,
      0.632
    );

    if (!Number.isFinite(t28Absolute) || !Number.isFinite(t63Absolute)) {
      throw new Error(
        'A PV ainda não cruzou 28,3% e 63,2% da resposta. Aguarde mais dados.'
      );
    }

    const t28 = t28Absolute - step.time;
    const t63 = t63Absolute - step.time;

    if (!(t63 > t28 && t28 >= 0)) {
      throw new Error(
        'Os tempos de resposta identificados são inconsistentes.'
      );
    }

    /*
     * Identificação FOPDT pelo método de dois pontos:
     * t28 = L + 0,333 T
     * t63 = L + 1,000 T
     */
    let timeConstant = 1.5 * (t63 - t28);
    let deadTime = 1.5 * t28 - 0.5 * t63;

    timeConstant = Math.max(timeConstant, sampleTime);
    const rawDeadTime = deadTime;
    deadTime = Math.max(deadTime, sampleTime * 0.25);

    const processGain = deltaY / step.delta;

    if (!Number.isFinite(processGain) || Math.abs(processGain) < EPS) {
      throw new Error('O ganho estático calculado é inválido.');
    }

    const predicted = time.map((currentTime, index) => {
      const relative = currentTime - step.time;

      if (index < step.index || relative <= deadTime) {
        return y0;
      }

      return y0 + deltaY * (
        1 - Math.exp(-(relative - deadTime) / timeConstant)
      );
    });

    const fitStart = Math.max(0, step.index - 1);
    const measuredFit = pv.slice(fitStart);
    const predictedFit = predicted.slice(fitStart);
    const measuredMean = average(measuredFit);

    let ssResidual = 0;
    let ssTotal = 0;

    for (let i = 0; i < measuredFit.length; i += 1) {
      ssResidual += Math.pow(
        measuredFit[i] - predictedFit[i],
        2
      );
      ssTotal += Math.pow(
        measuredFit[i] - measuredMean,
        2
      );
    }

    const r2 = ssTotal < EPS
      ? 1
      : 1 - ssResidual / ssTotal;

    const tailTime = time.slice(time.length - step.tailCount);
    const tailRegression = linearRegression(tailTime, tailPv);
    const tailDuration = Math.max(
      tailTime[tailTime.length - 1] - tailTime[0],
      sampleTime
    );
    const driftFraction = Math.abs(
      tailRegression.slope * tailDuration / deltaY
    );

    let confidence = 'alta';
    const warnings = [];

    if (r2 < 0.85 || driftFraction > 0.08) confidence = 'média';
    if (r2 < 0.65 || driftFraction > 0.20) confidence = 'baixa';

    if (rawDeadTime <= 0) {
      warnings.push(
        'O tempo morto calculado foi não positivo e precisou ser limitado.'
      );
    }
    if (driftFraction > 0.08) {
      warnings.push(
        'A cauda da resposta ainda apresenta deriva; aguarde maior estabilização.'
      );
    }
    if (r2 < 0.85) {
      warnings.push(
        'O modelo de primeira ordem com tempo morto não representa perfeitamente os dados.'
      );
    }
    if (deadTime / timeConstant > 1) {
      warnings.push(
        'A relação L/T é alta; prefira sintonia IMC/SIMC conservadora.'
      );
    }

    return {
      model: 'FOPDT',
      stepIndex: step.index,
      stepTime: step.time,
      t28Absolute,
      t63Absolute,
      t28,
      t63,
      initialPV: y0,
      finalPV: y1,
      deltaPV: deltaY,
      initialMV: step.initial,
      finalMV: step.final,
      deltaMV: step.delta,
      processGain,
      deadTime,
      rawDeadTime,
      timeConstant,
      sampleTime,
      r2,
      driftFraction,
      confidence,
      warnings,
      predicted
    };
  }

  function calculateTuning(model, method, controller, lambdaValue) {
    if (!model) throw new Error('Modelo da planta não informado.');

    const K = finite(model.processGain, NaN);
    const L = finite(model.deadTime, NaN);
    const T = finite(model.timeConstant, NaN);

    if (
      !Number.isFinite(K) ||
      !Number.isFinite(L) ||
      !Number.isFinite(T) ||
      Math.abs(K) < EPS ||
      L <= 0 ||
      T <= 0
    ) {
      throw new Error('Os parâmetros K, L e T do modelo são inválidos.');
    }

    const selectedMethod = String(method || 'imc').toLowerCase();
    const selectedController = String(controller || 'PI').toUpperCase();
    let kp;
    let ti;
    let td = 0;
    let lambda = Number(lambdaValue);

    if (!Number.isFinite(lambda) || lambda <= 0) {
      lambda = Math.max(L, 0.5 * T);
    }

    if (selectedMethod === 'zn' || selectedMethod === 'ziegler-nichols') {
      if (selectedController === 'PI') {
        kp = 0.9 * T / (K * L);
        ti = 3.33 * L;
      } else if (selectedController === 'PID') {
        kp = 1.2 * T / (K * L);
        ti = 2 * L;
        td = 0.5 * L;
      } else {
        throw new Error('Ziegler–Nichols suporta PI ou PID nesta tela.');
      }
    } else if (
      selectedMethod === 'cc' ||
      selectedMethod === 'cohen-coon'
    ) {
      const ratio = L / T;

      if (selectedController === 'PI') {
        kp = (T / (K * L)) * (0.9 + ratio / 12);
        ti = L * (30 + 3 * ratio) / (9 + 20 * ratio);
      } else if (selectedController === 'PID') {
        kp = (T / (K * L)) * (4 / 3 + ratio / 4);
        ti = L * (32 + 6 * ratio) / (13 + 8 * ratio);
        td = L * 4 / (11 + 2 * ratio);
      } else {
        throw new Error('Cohen–Coon suporta PI ou PID nesta tela.');
      }
    } else if (
      selectedMethod === 'imc' ||
      selectedMethod === 'simc'
    ) {
      if (selectedController === 'PI') {
        kp = T / (K * (lambda + L));
        ti = Math.min(T, 4 * (lambda + L));
      } else if (selectedController === 'PID') {
        kp = (T + 0.5 * L) / (K * (lambda + 0.5 * L));
        ti = T + 0.5 * L;
        td = T * L / (2 * T + L);
      } else {
        throw new Error('IMC/SIMC suporta PI ou PID nesta tela.');
      }
    } else {
      throw new Error('Método de sintonia desconhecido.');
    }

    if (
      !Number.isFinite(kp) ||
      !Number.isFinite(ti) ||
      !Number.isFinite(td)
    ) {
      throw new Error('A regra de sintonia produziu valores inválidos.');
    }

    return {
      method: selectedMethod,
      controller: selectedController,
      kp,
      ti: Math.max(0, ti),
      td: Math.max(0, td),
      lambda,
      action: K >= 0
        ? 'ganho positivo para erro SP − PV'
        : 'ganho negativo para erro SP − PV',
      warning:
        selectedMethod === 'zn'
          ? 'Sintonia agressiva. Valide com limites, anti-windup e operação segura.'
          : selectedMethod === 'cc'
            ? 'Sintonia moderadamente agressiva; valide antes da operação normal.'
            : 'Sintonia conservadora; aumente λ para uma resposta mais lenta e robusta.'
    };
  }

  global.PidAutoTune = {
    analyzeStepResponse,
    calculateTuning
  };
})(typeof window !== 'undefined' ? window : globalThis);
