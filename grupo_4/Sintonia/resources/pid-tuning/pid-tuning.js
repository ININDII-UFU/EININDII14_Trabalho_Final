(function () {
  'use strict';

  const qs = new URLSearchParams(window.location.search);
  const q = (name, fallback = '') => {
    const value = qs.get(name);
    return value === null || value === '' ? fallback : value;
  };
  const qNumber = (name, fallback) => {
    const value = Number(q(name, fallback));
    return Number.isFinite(value) ? value : fallback;
  };
  const qBool = (name, fallback = false) => {
    const value = String(q(name, fallback ? '1' : '0')).toLowerCase();
    return ['1', 'true', 'yes', 'on', 'sim'].includes(value);
  };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));
  const num = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const config = {
    title: q('title', 'Nível do Tanque'),
    device: q('device', ''),
    units: q('units', '%'),
    mvUnits: q('mvUnits', '%'),
    scaleMin: qNumber('scaleMin', 0),
    scaleMax: qNumber('scaleMax', 100),
    mvMin: qNumber('mvMin', 0),
    mvMax: qNumber('mvMax', 100),
    autoScale: qBool('autoScale', false),
    tuningMethod: q('tuningMethod', 'imc'),
    controllerType: q('controllerType', 'PI').toUpperCase(),
    tuningLambda: qNumber('tuningLambda', NaN),
    period: clamp(qNumber('period', 1000), 500, 10000),
    demo: qBool('demo', false),
    apiBase: q('apiBase', ''),
    apiKey: q('apiKey', ''),
    token: q('token', ''),
    refs: {
      sp: q('sp', ''), pv: q('pv', ''), mv: q('mv', ''), am: q('am', ''), lr: q('lr', ''),
      kp: q('kp', ''), ti: q('ti', ''), td: q('td', '')
    }
  };

  if (!(config.scaleMax > config.scaleMin)) {
    config.scaleMax = config.scaleMin + 100;
  }
  if (!(config.mvMax > config.mvMin)) {
    config.mvMax = config.mvMin + 100;
  }

  document.title = 'PID — ' + config.title;
  document.getElementById('screen-title').textContent = 'Tela de Sintonia da Malha ' + config.title;
  document.getElementById('pv-unit').textContent = config.units;
  document.getElementById('sp-unit').textContent = config.units;
  document.getElementById('mv-unit').textContent = config.mvUnits;
  document.getElementById('division-time').value = String(config.period);

  document.getElementById('sp-value').min = String(config.scaleMin);
  document.getElementById('sp-value').max = String(config.scaleMax);
  document.getElementById('mv-value').min = String(config.mvMin);
  document.getElementById('mv-value').max = String(config.mvMax);
  document.getElementById('step-value').max =
    String(Math.abs(config.mvMax - config.mvMin));

  const adapter = new window.FuxaTagAdapter({
    device: config.device,
    apiBase: config.apiBase,
    apiKey: config.apiKey,
    token: config.token,
    demo: config.demo
  });

  const el = id => document.getElementById(id);
  const ui = {
    pv: el('pv-value'), sp: el('sp-value'), mv: el('mv-value'),
    kp: el('kp-value'), ti: el('ti-value'), td: el('td-value'),
    local: el('btn-local'), remote: el('btn-remote'), auto: el('btn-auto'), manual: el('btn-manual'),
    step: el('step-value'), stepPlus: el('btn-step-plus'), stepMinus: el('btn-step-minus'),
    applyPid: el('btn-apply-pid'), pidParameters: el('pid-parameters'),
    tuningMethod: el('tuning-method'),
    tuningController: el('tuning-controller'),
    tuningLambda: el('tuning-lambda'),
    lambdaField: el('lambda-field'),
    analyzeStep: el('btn-analyze-step'),
    identifiedModel: el('identified-model'),
    copyTuning: el('btn-copy-tuning'),
    applyTuning: el('btn-apply-tuning'),
    tuningConfidence: el('tuning-confidence'),
    tuningWarning: el('tuning-warning'),
    period: el('division-time'), counter: el('sample-counter'), message: el('message-bar'),
    dot: el('connection-dot'), status: el('connection-label'), detail: el('connection-detail')
  };

  let plot = null;
  let timerId = null;
  let playing = true;
  let sampleCount = 0;
  let elapsed = 0;
  let lastTick = performance.now();
  let lastValues = {
    sp: (config.scaleMin + config.scaleMax) / 2,
    pv: config.scaleMin,
    mv: config.mvMin,
    am: 1,
    lr: 1,
    kp: null,
    ti: null,
    td: null
  };
  let writing = false;
  let tool = 'pan';
  let shapes = [];
  let cvXs = [];
  let chYs = [];
  let identifiedModel = null;
  let suggestedTuning = null;
  const MAX_POINTS = 2000;

  const setMessage = (text, type = '') => {
    ui.message.textContent = text || '';
    ui.message.className = 'message-bar' + (type ? ' ' + type : '');
  };
  const setConnection = (state, label, detail) => {
    ui.dot.className = 'connection-dot connection-dot--' + state;
    ui.status.textContent = label;
    ui.detail.textContent = detail;
  };
  const active = (button, state) => button.classList.toggle('active', Boolean(state));
  const showPill = (id, text) => { const item = el(id); item.textContent = text; item.style.display = 'inline-block'; };
  const hidePills = () => ['pill-dt', 'pill-dpv', 'pill-dmv'].forEach(id => { el(id).style.display = 'none'; });

  function updateMode(amValue) {
    const isAuto = Number(amValue) === 1;
    active(ui.auto, isAuto);
    active(ui.manual, !isAuto);
    const mvUnavailable = !config.demo && !config.refs.mv;
    ui.mv.disabled = isAuto || mvUnavailable;
    ui.step.disabled = isAuto || mvUnavailable;
    ui.stepPlus.disabled = isAuto || mvUnavailable;
    ui.stepMinus.disabled = isAuto || mvUnavailable;
  }

  function updateAccess(lrValue) {
    const isLocal = Number(lrValue) === 1;
    active(ui.local, isLocal);
    active(ui.remote, !isLocal);
    ui.sp.disabled =
      !isLocal ||
      (!config.demo && !config.refs.sp);
  }

  function updatePidVisibility() {
    const visible =
      config.demo ||
      Boolean(config.refs.kp || config.refs.ti || config.refs.td);

    ui.pidParameters.style.display = visible ? 'block' : 'none';
    ui.kp.disabled = !config.refs.kp && !config.demo;
    ui.ti.disabled = !config.refs.ti && !config.demo;
    ui.td.disabled = !config.refs.td && !config.demo;
  }

  function updateControlAvailability() {
    const hasAuto = config.demo || Boolean(config.refs.am);
    const hasLocal = config.demo || Boolean(config.refs.lr);

    ui.auto.disabled = !hasAuto;
    ui.manual.disabled = !hasAuto;
    ui.local.disabled = !hasLocal;
    ui.remote.disabled = !hasLocal;

    ui.sp.disabled = !config.refs.sp && !config.demo;
    ui.mv.disabled =
      (!config.refs.mv && !config.demo) ||
      Number(lastValues.am) === 1;
  }


  function formatMetric(value, digits = 3) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : '—';
  }

  function setAutotuneDefaults() {
    ui.tuningMethod.value =
      ['imc', 'zn', 'cc'].includes(config.tuningMethod)
        ? config.tuningMethod
        : 'imc';

    ui.tuningController.value =
      ['PI', 'PID'].includes(config.controllerType)
        ? config.controllerType
        : 'PI';

    if (Number.isFinite(config.tuningLambda) && config.tuningLambda > 0) {
      ui.tuningLambda.value = String(config.tuningLambda);
    }

    updateLambdaAvailability();
  }

  function updateLambdaAvailability() {
    const isImc = ui.tuningMethod.value === 'imc';
    ui.tuningLambda.disabled = !isImc;
    ui.lambdaField.style.opacity = isImc ? '1' : '.48';
  }

  function clearTuningResult() {
    identifiedModel = null;
    suggestedTuning = null;
    ui.identifiedModel.hidden = true;
    removeShapes([
      'tune-step',
      'tune-t28',
      'tune-t63',
      'tune-initial',
      'tune-final'
    ]);
  }

  function updateTuningCalculation() {
    if (!identifiedModel) return;

    suggestedTuning = window.PidAutoTune.calculateTuning(
      identifiedModel,
      ui.tuningMethod.value,
      ui.tuningController.value,
      num(ui.tuningLambda.value, NaN)
    );

    el('tuned-kp').textContent =
      formatMetric(suggestedTuning.kp, 4);
    el('tuned-ti').textContent =
      formatMetric(suggestedTuning.ti, 3) + ' s';
    el('tuned-td').textContent =
      formatMetric(suggestedTuning.td, 3) + ' s';

    const warnings = []
      .concat(identifiedModel.warnings || [])
      .concat(suggestedTuning.warning || []);

    ui.tuningWarning.textContent = warnings.join(' ');
  }

  function drawIdentifiedModel(model) {
    removeShapes([
      'tune-step',
      'tune-t28',
      'tune-t63',
      'tune-initial',
      'tune-final'
    ]);

    addLine(
      'tune-step',
      model.stepTime,
      model.stepTime,
      0,
      1,
      'x',
      'paper',
      '#ef8b25',
      2,
      'dash'
    );
    addLine(
      'tune-t28',
      model.t28Absolute,
      model.t28Absolute,
      0,
      1,
      'x',
      'paper',
      '#16b89a',
      1.5,
      'dot'
    );
    addLine(
      'tune-t63',
      model.t63Absolute,
      model.t63Absolute,
      0,
      1,
      'x',
      'paper',
      '#1976d2',
      1.5,
      'dot'
    );
    addLine(
      'tune-initial',
      model.stepTime,
      model.t63Absolute,
      model.initialPV,
      model.initialPV,
      'x',
      'y',
      '#82949f',
      1,
      'dot'
    );
    addLine(
      'tune-final',
      model.stepTime,
      plot.data[0].x[plot.data[0].x.length - 1],
      model.finalPV,
      model.finalPV,
      'x',
      'y',
      '#82949f',
      1,
      'dot'
    );
  }

  function showIdentifiedModel(model) {
    el('model-du').textContent =
      formatMetric(model.deltaMV, 3) + ' ' + config.mvUnits;
    el('model-dy').textContent =
      formatMetric(model.deltaPV, 3) + ' ' + config.units;
    el('model-k').textContent =
      formatMetric(model.processGain, 5);
    el('model-l').textContent =
      formatMetric(model.deadTime, 3) + ' s';
    el('model-t').textContent =
      formatMetric(model.timeConstant, 3) + ' s';
    el('model-r2').textContent =
      formatMetric(model.r2, 3);

    ui.tuningConfidence.textContent =
      'Modelo FOPDT • confiança ' +
      model.confidence +
      ' • ação: ' +
      (
        model.processGain >= 0
          ? 'Kp positivo para erro SP − PV'
          : 'Kp negativo para erro SP − PV'
      );

    ui.identifiedModel.hidden = false;
    drawIdentifiedModel(model);
    updateTuningCalculation();
  }

  function analyzeRecordedStep() {
    if (
      !window.PidAutoTune ||
      typeof window.PidAutoTune.analyzeStepResponse !== 'function'
    ) {
      throw new Error('Biblioteca de sintonia automática não carregada.');
    }

    if (!plot || !plot.data || plot.data.length < 3) {
      throw new Error('O gráfico ainda não possui dados.');
    }

    const time = plot.data[0].x.map(Number);
    const pv = plot.data[0].y.map(Number);
    const mv = plot.data[2].y.map(Number);

    identifiedModel = window.PidAutoTune.analyzeStepResponse({
      time,
      pv,
      mv,
      pvSpan: config.scaleMax - config.scaleMin,
      mvSpan: config.mvMax - config.mvMin,
      smoothingRadius: 1
    });

    showIdentifiedModel(identifiedModel);
    setMessage(
      'Degrau identificado. Revise o modelo e escolha a regra de sintonia.',
      identifiedModel.confidence === 'baixa' ? 'error' : 'success'
    );
  }

  function copySuggestedTuning() {
    if (!suggestedTuning) {
      throw new Error('Execute primeiro a análise do degrau.');
    }

    ui.kp.value = suggestedTuning.kp.toFixed(5);
    ui.ti.value = suggestedTuning.ti.toFixed(4);
    ui.td.value = suggestedTuning.td.toFixed(4);

    setMessage(
      'Valores sugeridos copiados. Eles ainda não foram enviados ao controlador.',
      'success'
    );
  }

  async function applySuggestedTuning() {
    if (!suggestedTuning) {
      throw new Error('Execute primeiro a análise do degrau.');
    }

    const values = {};

    if (config.refs.kp) values.kp = suggestedTuning.kp;
    if (config.refs.ti) values.ti = suggestedTuning.ti;
    if (config.refs.td) values.td = suggestedTuning.td;

    if (!Object.keys(values).length && !config.demo) {
      throw new Error(
        'Nenhuma tag de Kp, Ti ou Td foi fornecida na chamada.'
      );
    }

    if (config.demo) {
      Object.assign(lastValues, {
        kp: suggestedTuning.kp,
        ti: suggestedTuning.ti,
        td: suggestedTuning.td
      });
    } else {
      await adapter.writeMany(values);
      Object.assign(lastValues, values);
    }

    copySuggestedTuning();
    setMessage(
      'Parâmetros calculados aplicados às tags configuradas.',
      'success'
    );
  }

  function setupPlot() {
    const traces = [
      { name: 'PV', x: [], y: [], mode: 'lines', line: { width: 2.3, color: '#1976d2' } },
      { name: 'SP', x: [], y: [], mode: 'lines', line: { width: 2.1, dash: 'dot', color: '#25834b' } },
      { name: 'MV', x: [], y: [], mode: 'lines', line: { width: 2.2, color: '#ef8b25' }, yaxis: 'y2' }
    ];
    const layout = {
      margin: { l: 58, r: 58, t: 8, b: 48 },
      paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
      showlegend: true,
      legend: { orientation: 'h', x: 1, y: 1.02, xanchor: 'right', yanchor: 'bottom', bgcolor: 'rgba(255,255,255,.85)', font: { color: '#243b4a', size: 10 } },
      dragmode: 'pan', hovermode: 'x unified',
      xaxis: { title: { text: 'Tempo (s)', font: { color: '#435965', size: 11 } }, tickfont: { color: '#5e7481', size: 10 }, gridcolor: '#e9eef1', linecolor: '#9fb0ba', showline: true, mirror: true, zeroline: false, showspikes: true, spikemode: 'across', spikecolor: '#81939f', automargin: true, autorange: true },
      yaxis: {
        title: {
          text: 'PV / SP (' + config.units + ')',
          font: { color: '#435965', size: 11 }
        },
        tickfont: { color: '#5e7481', size: 10 },
        gridcolor: '#e9eef1',
        linecolor: '#9fb0ba',
        showline: true,
        mirror: true,
        zeroline: false,
        automargin: true,
        autorange: config.autoScale,
        range: config.autoScale ? undefined : [config.scaleMin, config.scaleMax]
      },
      yaxis2: {
        title: {
          text: 'MV (' + config.mvUnits + ')',
          font: { color: '#a35c12', size: 11 }
        },
        tickfont: { color: '#a35c12', size: 10 },
        overlaying: 'y',
        side: 'right',
        linecolor: '#c98640',
        showline: true,
        zeroline: false,
        automargin: true,
        autorange: config.autoScale,
        range: config.autoScale ? undefined : [config.mvMin, config.mvMax]
      },
      shapes: []
    };
    const options = { responsive: true, displayModeBar: false, scrollZoom: true };
    return Plotly.newPlot('plot-box', traces, layout, options).then(gd => {
      plot = gd;
      bindPlotInteractions();
    });
  }

  function setTool(next, button) {
    tool = next;
    document.querySelectorAll('.toolbar button').forEach(b => b.classList.remove('active'));
    if (button) button.classList.add('active');
    if (plot) Plotly.relayout(plot, { dragmode: next === 'zoom' ? 'zoom' : 'pan' });
    if (next === 'cv') { cvXs = []; removeShapes(['cv1', 'cv2']); }
    if (next === 'ch') { chYs = []; removeShapes(['ch1', 'ch2']); }
    if (next === 'kp') removeShapes(['kp']);
    hidePills();
  }

  function bindToolbar() {
    const run = el('tb-run');
    const iconPlay = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    const iconPause = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
    const updateRun = () => {
      run.innerHTML = playing ? iconPause : iconPlay;
      run.title = playing ? 'Pausar aquisição' : 'Continuar aquisição';
    };
    run.addEventListener('click', () => { playing = !playing; updateRun(); playing ? startLoop() : stopLoop(); });
    el('tb-home').addEventListener('click', () => plot && Plotly.relayout(plot, { 'xaxis.autorange': true, 'yaxis.autorange': true, 'yaxis2.autorange': true }));
    el('tb-pan').addEventListener('click', e => setTool('pan', e.currentTarget));
    el('tb-zoom').addEventListener('click', e => setTool('zoom', e.currentTarget));
    el('tb-cv').addEventListener('click', e => setTool('cv', e.currentTarget));
    el('tb-ch').addEventListener('click', e => setTool('ch', e.currentTarget));
    el('tb-kp').addEventListener('click', e => setTool('kp', e.currentTarget));
    el('tb-clear-cursors').addEventListener('click', () => { shapes = []; cvXs = []; chYs = []; hidePills(); if (plot) Plotly.relayout(plot, { shapes: [] }); });
    el('tb-clear').addEventListener('click', () => {
      if (!plot) return;
      sampleCount = 0; elapsed = 0; lastTick = performance.now(); ui.counter.textContent = '0 amostras';
      shapes = []; cvXs = []; chYs = []; hidePills();
      clearTuningResult();
      Plotly.restyle(plot, { x: [[], [], []], y: [[], [], []] });
      Plotly.relayout(plot, { shapes: [], 'xaxis.autorange': true, 'yaxis.autorange': true, 'yaxis2.autorange': true });
    });
    updateRun();
  }

  function removeShapes(names) {
    shapes = shapes.filter(shape => !names.includes(shape.name));
    if (plot) Plotly.relayout(plot, { shapes: shapes });
  }
  function addLine(name, x0, x1, y0, y1, xref, yref, color, width = 2, dash = 'dot') {
    shapes = shapes.filter(shape => shape.name !== name);
    shapes.push({ name, type: 'line', xref, yref, x0, x1, y0, y1, line: { color, width, dash } });
    Plotly.relayout(plot, { shapes: shapes });
  }

  function plotRect() {
    if (!plot) return null;
    const item = plot.querySelector('.cartesianlayer .subplot.xy .plot') || plot.querySelector('.nsewdrag');
    return item ? item.getBoundingClientRect() : null;
  }
  function ranges() {
    const f = plot && plot._fullLayout;
    if (!f) return null;
    return { x: f.xaxis.range || f.xaxis._range, y: f.yaxis.range || f.yaxis._range, y2: f.yaxis2.range || f.yaxis2._range };
  }
  function pixelToData(event) {
    const rect = plotRect(); const r = ranges();
    if (!rect || !r) return null;
    return {
      x: r.x[0] + (event.clientX - rect.left) / rect.width * (r.x[1] - r.x[0]),
      y: r.y[1] - (event.clientY - rect.top) / rect.height * (r.y[1] - r.y[0])
    };
  }
  function rightToLeft(mv) {
    const r = ranges(); if (!r) return mv;
    return r.y[0] + (mv - r.y2[0]) * (r.y[1] - r.y[0]) / (r.y2[1] - r.y2[0]);
  }
  function leftToRight(value) {
    const r = ranges(); if (!r) return value;
    return r.y2[0] + (value - r.y[0]) * (r.y2[1] - r.y2[0]) / (r.y[1] - r.y[0]);
  }

  function bindPlotInteractions() {
    let down = null;
    plot.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY }; });
    plot.addEventListener('pointerup', event => {
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 7) return;
      if (!['cv', 'ch', 'kp'].includes(tool)) return;
      const point = pixelToData(event); if (!point) return;
      if (tool === 'cv') handleVertical(point.x);
      if (tool === 'ch') handleHorizontal(point.y);
      if (tool === 'kp') handleTangent(point.x);
    });
  }

  function handleVertical(x) {
    if (cvXs.length >= 2) { removeShapes(['cv1', 'cv2']); cvXs = []; hidePills(); }
    cvXs.push(x);
    addLine('cv' + cvXs.length, x, x, 0, 1, 'x', 'paper', '#d43e55');
    if (cvXs.length === 2) showPill('pill-dt', 'Δt = ' + Math.abs(cvXs[1] - cvXs[0]).toFixed(2) + ' s');
  }
  function handleHorizontal(y) {
    if (chYs.length >= 2) { removeShapes(['ch1', 'ch2']); chYs = []; hidePills(); }
    chYs.push(y);
    addLine('ch' + chYs.length, 0, 1, y, y, 'paper', 'y', '#872da2');
    if (chYs.length === 2) {
      showPill('pill-dpv', 'ΔPV = ' + (chYs[1] - chYs[0]).toFixed(2) + ' ' + config.units);
      showPill(
        'pill-dmv',
        'ΔMV = ' +
        (leftToRight(chYs[1]) - leftToRight(chYs[0])).toFixed(2) +
        ' ' +
        config.mvUnits
      );
    }
  }
  function handleTangent(xClick) {
    if (!plot || !plot.data[0].x || plot.data[0].x.length < 3) return;
    const xp = plot.data[0].x, yp = plot.data[0].y, xm = plot.data[2].x, ym = plot.data[2].y;
    let i0 = 0, best = Infinity;
    xp.forEach((x, i) => { const distance = Math.abs(x - xClick); if (distance < best) { best = distance; i0 = i; } });
    const previous = Math.max(0, i0 - 1), next = Math.min(xp.length - 1, i0 + 1);
    if (next === previous) return;
    const x0 = xp[i0], y0 = yp[i0];
    const slope = (yp[next] - yp[previous]) / (xp[next] - xp[previous]);
    if (!Number.isFinite(slope)) return;
    let bestIndex = -1, bestDifference = Infinity;
    for (let i = 0; i < xp.length; i++) {
      const tangentY = y0 + slope * (xp[i] - x0);
      const j = Math.min(i, ym.length - 1);
      const difference = Math.abs(tangentY - rightToLeft(ym[j]));
      if (difference < bestDifference) { bestDifference = difference; bestIndex = i; }
    }
    if (bestIndex < 0) return;
    const x1 = xp[bestIndex], y1 = y0 + slope * (x1 - x0);
    removeShapes(['kp']);
    addLine('kp', x0, x1, y0, y1, 'x', 'y', '#455a64', 3, 'dot');
    showPill('pill-dt', 'Δt = ' + (x1 - x0).toFixed(2) + ' s');
    showPill('pill-dpv', 'ΔPV = ' + (y1 - y0).toFixed(2) + ' ' + config.units);
    el('pill-dmv').style.display = 'none';
  }

  function appendSample(pv, sp, mv) {
    if (!plot) return;
    sampleCount += 1;
    ui.counter.textContent = sampleCount + (sampleCount === 1 ? ' amostra' : ' amostras');
    Plotly.extendTraces(
      plot,
      {
        x: [[elapsed], [elapsed], [elapsed]],
        y: [[pv], [sp], [mv]]
      },
      [0, 1, 2],
      MAX_POINTS
    );

    if (config.autoScale) {
      Plotly.relayout(plot, {
        'yaxis.autorange': true,
        'yaxis2.autorange': true
      });
    }
  }

  function demoValues() {
    const t = elapsed;
    const processSpan = config.scaleMax - config.scaleMin;
    const mvSpan = config.mvMax - config.mvMin;
    const basePv = config.scaleMin + processSpan * 0.42;
    const sp = lastValues.sp;
    const pv =
      basePv +
      (sp - basePv) * (1 - Math.exp(-t / 14)) +
      processSpan * 0.013 * Math.sin(t / 4.2);

    const normalizedError =
      processSpan === 0 ? 0 : (sp - pv) / processSpan;

    const mv = clamp(
      config.mvMin +
      mvSpan * (
        0.18 +
        1.18 * normalizedError +
        0.03 * Math.sin(t / 7)
      ),
      config.mvMin,
      config.mvMax
    );

    return {
      sp,
      pv,
      mv,
      am: lastValues.am,
      lr: lastValues.lr,
      kp: 2,
      ti: 12,
      td: 0
    };
  }

  async function poll() {
    const now = performance.now();
    elapsed += Math.max(0, (now - lastTick) / 1000);
    lastTick = now;
    try {
      const values = config.demo ? demoValues() : await adapter.read(['sp', 'pv', 'mv', 'am', 'lr', 'kp', 'ti', 'td']);
      Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') lastValues[key] = value; });
      if (document.activeElement !== ui.sp) ui.sp.value = num(lastValues.sp).toFixed(2);
      if (document.activeElement !== ui.mv) ui.mv.value = num(lastValues.mv).toFixed(2);
      ui.pv.value = num(lastValues.pv).toFixed(2);
      if (document.activeElement !== ui.kp && lastValues.kp !== null) ui.kp.value = num(lastValues.kp).toFixed(3);
      if (document.activeElement !== ui.ti && lastValues.ti !== null) ui.ti.value = num(lastValues.ti).toFixed(3);
      if (document.activeElement !== ui.td && lastValues.td !== null) ui.td.value = num(lastValues.td).toFixed(3);
      updateMode(lastValues.am);
      updateAccess(lastValues.lr);
      appendSample(num(lastValues.pv), num(lastValues.sp), num(lastValues.mv));
      setConnection('ok', config.demo ? 'Demonstração' : 'Conectado', adapter.description);
      setMessage(config.demo ? 'Dados simulados localmente.' : 'Última atualização concluída.', 'success');
    } catch (error) {
      setConnection('error', 'Sem comunicação', error.message || String(error));
      setMessage(error.message || String(error), 'error');
    }
  }

  function stopLoop() { if (timerId) clearInterval(timerId); timerId = null; }
  function startLoop() {
    stopLoop(); lastTick = performance.now();
    poll();
    timerId = setInterval(poll, config.period);
  }

  async function safeWrite(key, value, successText) {
    if (writing) return;
    writing = true;
    try {
      await adapter.write(key, value);
      lastValues[key] = value;
      setMessage(successText, 'success');
    } catch (error) {
      setMessage(error.message || String(error), 'error');
    } finally {
      writing = false;
    }
  }

  function bindControls() {
    ui.sp.addEventListener('change', () => {
      const value = clamp(
        num(
          String(ui.sp.value).replace(',', '.'),
          lastValues.sp
        ),
        config.scaleMin,
        config.scaleMax
      );

      lastValues.sp = value;
      ui.sp.value = value.toFixed(2);
      safeWrite('sp', value, 'Setpoint atualizado.');
    });
    ui.mv.addEventListener('change', () => {
      const value = clamp(
        num(
          String(ui.mv.value).replace(',', '.'),
          lastValues.mv
        ),
        config.mvMin,
        config.mvMax
      );
      lastValues.mv = value; ui.mv.value = value.toFixed(2); safeWrite('mv', value, 'Saída manual atualizada.');
    });
    ui.auto.addEventListener('click', () => { updateMode(1); safeWrite('am', 1, 'Controlador em automático.'); });
    ui.manual.addEventListener('click', () => { updateMode(0); safeWrite('am', 0, 'Controlador em manual.'); });
    ui.local.addEventListener('click', () => { updateAccess(1); safeWrite('lr', 1, 'Setpoint em modo local.'); });
    ui.remote.addEventListener('click', () => { updateAccess(0); safeWrite('lr', 0, 'Setpoint em modo remoto.'); });

    const applyStep = sign => {
      const step = Math.abs(num(ui.step.value, 10));
      const next = clamp(
        num(lastValues.mv) + sign * step,
        config.mvMin,
        config.mvMax
      );
      lastValues.mv = next; ui.mv.value = next.toFixed(2); safeWrite('mv', next, 'Degrau manual aplicado à MV.');
    };
    ui.stepPlus.addEventListener('click', () => applyStep(1));
    ui.stepMinus.addEventListener('click', () => applyStep(-1));

    ui.applyPid.addEventListener('click', async () => {
      const values = {};
      if (config.refs.kp) values.kp = num(ui.kp.value, lastValues.kp || 0);
      if (config.refs.ti) values.ti = Math.max(0, num(ui.ti.value, lastValues.ti || 0));
      if (config.refs.td) values.td = Math.max(0, num(ui.td.value, lastValues.td || 0));
      if (config.demo) Object.assign(lastValues, { kp: num(ui.kp.value, 2), ti: num(ui.ti.value, 12), td: num(ui.td.value, 0) });
      try { await adapter.writeMany(values); Object.assign(lastValues, values); setMessage('Parâmetros PID aplicados.', 'success'); }
      catch (error) { setMessage(error.message || String(error), 'error'); }
    });


    ui.tuningMethod.addEventListener('change', () => {
      updateLambdaAvailability();

      try {
        updateTuningCalculation();
      } catch (error) {
        setMessage(error.message || String(error), 'error');
      }
    });

    ui.tuningController.addEventListener('change', () => {
      try {
        updateTuningCalculation();
      } catch (error) {
        setMessage(error.message || String(error), 'error');
      }
    });

    ui.tuningLambda.addEventListener('change', () => {
      try {
        updateTuningCalculation();
      } catch (error) {
        setMessage(error.message || String(error), 'error');
      }
    });

    ui.analyzeStep.addEventListener('click', () => {
      try {
        analyzeRecordedStep();
      } catch (error) {
        setMessage(error.message || String(error), 'error');
      }
    });

    ui.copyTuning.addEventListener('click', () => {
      try {
        copySuggestedTuning();
      } catch (error) {
        setMessage(error.message || String(error), 'error');
      }
    });

    ui.applyTuning.addEventListener('click', async () => {
      try {
        await applySuggestedTuning();
      } catch (error) {
        setMessage(error.message || String(error), 'error');
      }
    });

    ui.period.addEventListener('change', () => {
      config.period = clamp(num(ui.period.value, 1000), 500, 10000);
      if (playing) startLoop();
    });

    el('chk-pv').addEventListener('change', e => plot && Plotly.restyle(plot, { visible: e.target.checked ? true : 'legendonly' }, [0]));
    el('chk-sp').addEventListener('change', e => plot && Plotly.restyle(plot, { visible: e.target.checked ? true : 'legendonly' }, [1]));
    el('chk-mv').addEventListener('change', e => plot && Plotly.restyle(plot, { visible: e.target.checked ? true : 'legendonly' }, [2]));
  }

  async function bootstrap() {
    if (typeof Plotly === 'undefined') {
      setConnection('error', 'Plotly indisponível', 'O arquivo plotly-2.30.0.min.js não foi carregado.');
      return;
    }
    try {
      await adapter.configure(config.refs);
      setAutotuneDefaults();
      updatePidVisibility();
      updateControlAvailability();
      ui.applyTuning.disabled =
        !config.demo &&
        !Boolean(config.refs.kp || config.refs.ti || config.refs.td);
      updateMode(lastValues.am);
      updateAccess(lastValues.lr);
      bindControls(); bindToolbar();
      await setupPlot();
      setConnection('waiting', 'Conectando', adapter.description);
      startLoop();
      try { parent.postMessage({ type: 'FUXA_PID_READY', title: config.title }, '*'); } catch (_) {}
    } catch (error) {
      setConnection('error', 'Falha na inicialização', error.message || String(error));
      setMessage(error.message || String(error), 'error');
    }
  }

  window.addEventListener('beforeunload', stopLoop);
  window.addEventListener('load', bootstrap);
})();
