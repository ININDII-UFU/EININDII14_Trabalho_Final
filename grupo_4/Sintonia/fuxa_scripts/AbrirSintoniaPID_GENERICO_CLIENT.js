/*
 * FUXA — Tela genérica de sintonia PID
 * Modo do script: CLIENT
 *
 * Crie no editor do FUXA os parâmetros descritos em:
 * docs/PARAMETROS_DO_SCRIPT.csv
 *
 * Obrigatórios:
 *   tagPV, tagSP, tagMV  -> tipo "Tag ID"
 *
 * Opcionais:
 *   tagAuto, tagLocal, tagKp, tagTi, tagTd -> tipo "Tag ID"
 *   titulo, unidadePV, unidadeMV, escalaPVMin, escalaPVMax,
 *   escalaMVMin, escalaMVMax, periodoMs, largura, altura,
 *   dispositivo -> tipo "Value"
 */

(function () {
  'use strict';

  const param = (value, fallback) =>
    (value === undefined || value === null || value === '') ? fallback : value;

  /*
   * O operador typeof evita erro quando um parâmetro opcional não foi
   * configurado no script do FUXA.
   */
  const cfg = {
    title: param(typeof titulo !== 'undefined' ? titulo : undefined, 'Malha PID'),
    device: param(typeof dispositivo !== 'undefined' ? dispositivo : undefined, ''),

    pv: param(typeof tagPV !== 'undefined' ? tagPV : undefined, ''),
    sp: param(typeof tagSP !== 'undefined' ? tagSP : undefined, ''),
    mv: param(typeof tagMV !== 'undefined' ? tagMV : undefined, ''),

    am: param(typeof tagAuto !== 'undefined' ? tagAuto : undefined, ''),
    lr: param(typeof tagLocal !== 'undefined' ? tagLocal : undefined, ''),
    kp: param(typeof tagKp !== 'undefined' ? tagKp : undefined, ''),
    ti: param(typeof tagTi !== 'undefined' ? tagTi : undefined, ''),
    td: param(typeof tagTd !== 'undefined' ? tagTd : undefined, ''),

    units: param(typeof unidadePV !== 'undefined' ? unidadePV : undefined, '%'),
    mvUnits: param(typeof unidadeMV !== 'undefined' ? unidadeMV : undefined, '%'),

    scaleMin: Number(param(
      typeof escalaPVMin !== 'undefined' ? escalaPVMin : undefined,
      0
    )),
    scaleMax: Number(param(
      typeof escalaPVMax !== 'undefined' ? escalaPVMax : undefined,
      100
    )),
    mvMin: Number(param(
      typeof escalaMVMin !== 'undefined' ? escalaMVMin : undefined,
      0
    )),
    mvMax: Number(param(
      typeof escalaMVMax !== 'undefined' ? escalaMVMax : undefined,
      100
    )),

    period: Number(param(
      typeof periodoMs !== 'undefined' ? periodoMs : undefined,
      1000
    )),
    tuningMethod: param(
      typeof metodoSintonia !== 'undefined' ? metodoSintonia : undefined,
      'imc'
    ),
    controllerType: param(
      typeof tipoControlador !== 'undefined' ? tipoControlador : undefined,
      'PI'
    ),
    tuningLambda: Number(param(
      typeof lambdaSintonia !== 'undefined' ? lambdaSintonia : undefined,
      NaN
    )),
    width: Number(param(
      typeof largura !== 'undefined' ? largura : undefined,
      1180
    )),
    height: Number(param(
      typeof altura !== 'undefined' ? altura : undefined,
      690
    )),

    resourceUrl: '/resources/pid-tuning/index.html'
  };

  const missing = [];
  if (!cfg.pv) missing.push('tagPV');
  if (!cfg.sp) missing.push('tagSP');
  if (!cfg.mv) missing.push('tagMV');

  if (missing.length) {
    throw new Error(
      'Tela de sintonia: parâmetros obrigatórios ausentes: ' +
      missing.join(', ')
    );
  }

  if (!Number.isFinite(cfg.scaleMin)) cfg.scaleMin = 0;
  if (!Number.isFinite(cfg.scaleMax) || cfg.scaleMax <= cfg.scaleMin) {
    cfg.scaleMax = cfg.scaleMin + 100;
  }
  if (!Number.isFinite(cfg.mvMin)) cfg.mvMin = 0;
  if (!Number.isFinite(cfg.mvMax) || cfg.mvMax <= cfg.mvMin) {
    cfg.mvMax = cfg.mvMin + 100;
  }
  if (!Number.isFinite(cfg.period)) cfg.period = 1000;
  cfg.period = Math.max(500, Math.min(10000, cfg.period));

  const GLOBAL_KEY = '__FUXA_PID_GENERIC_PANEL_V2__';

  if (!globalThis[GLOBAL_KEY]) {
    const style = document.createElement('style');
    style.textContent = `
      .fuxa-pid-panel{position:fixed;z-index:1000000;display:none;overflow:hidden;border:1px solid #78909c;border-radius:14px;background:#eef3f6;box-shadow:0 22px 70px rgba(0,0,0,.42);resize:both;min-width:720px;min-height:480px}
      .fuxa-pid-head{height:42px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;color:#fff;background:linear-gradient(100deg,#17364a,#267568);cursor:move;user-select:none}
      .fuxa-pid-title{font:700 14px Inter,"Segoe UI",Arial,sans-serif}
      .fuxa-pid-close{width:28px;height:28px;border:0;border-radius:8px;color:#fff;background:rgba(255,255,255,.12);cursor:pointer;font-size:19px;line-height:1}
      .fuxa-pid-close:hover{background:rgba(255,255,255,.24)}
      .fuxa-pid-body{position:absolute;inset:42px 0 0 0}
      .fuxa-pid-frame{width:100%;height:100%;border:0;background:#eef3f6}
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.className = 'fuxa-pid-panel';
    panel.innerHTML =
      '<div class="fuxa-pid-head">' +
      '<span class="fuxa-pid-title">Sintonia PID</span>' +
      '<button class="fuxa-pid-close" type="button" aria-label="Fechar">×</button>' +
      '</div>' +
      '<div class="fuxa-pid-body">' +
      '<iframe class="fuxa-pid-frame" src="about:blank" scrolling="no"></iframe>' +
      '</div>';

    document.body.appendChild(panel);

    const head = panel.querySelector('.fuxa-pid-head');
    const title = panel.querySelector('.fuxa-pid-title');
    const close = panel.querySelector('.fuxa-pid-close');
    const frame = panel.querySelector('.fuxa-pid-frame');
    let drag = null;

    function makeQuery(params) {
      const query = new URLSearchParams();

      Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          query.set(key, String(value));
        }
      });

      return query.toString();
    }

    function place(width, height) {
      const w = Math.max(720, Math.min(Number(width) || 1180, window.innerWidth - 24));
      const h = Math.max(480, Math.min(Number(height) || 690, window.innerHeight - 24));

      panel.style.width = w + 'px';
      panel.style.height = h + 'px';
      panel.style.left = Math.max(12, Math.floor((window.innerWidth - w) / 2)) + 'px';
      panel.style.top = Math.max(12, Math.floor((window.innerHeight - h) / 2)) + 'px';
    }

    head.addEventListener('pointerdown', event => {
      drag = {
        x: event.clientX,
        y: event.clientY,
        left: panel.offsetLeft,
        top: panel.offsetTop
      };
      head.setPointerCapture(event.pointerId);
    });

    head.addEventListener('pointermove', event => {
      if (!drag) return;

      panel.style.left =
        Math.max(
          0,
          Math.min(
            window.innerWidth - 120,
            drag.left + event.clientX - drag.x
          )
        ) + 'px';

      panel.style.top =
        Math.max(
          0,
          Math.min(
            window.innerHeight - 60,
            drag.top + event.clientY - drag.y
          )
        ) + 'px';
    });

    head.addEventListener('pointerup', () => {
      drag = null;
    });

    close.addEventListener('click', () => {
      panel.style.display = 'none';
      frame.src = 'about:blank';
    });

    globalThis.openFuxaPidTuning = function (options) {
      const localCfg = Object.assign({
        title: 'Malha PID',
        units: '%',
        mvUnits: '%',
        scaleMin: 0,
        scaleMax: 100,
        mvMin: 0,
        mvMax: 100,
        period: 1000,
        width: 1180,
        height: 690,
        resourceUrl: '/resources/pid-tuning/index.html'
      }, options || {});

      title.textContent = 'Tela de Sintonia — ' + localCfg.title;
      place(localCfg.width, localCfg.height);

      panel.style.display = 'block';
      panel.style.zIndex = String(
        (Number(globalThis.__FUXA_PID_Z__) || 1000000) + 1
      );
      globalThis.__FUXA_PID_Z__ = Number(panel.style.zIndex);

      frame.src =
        localCfg.resourceUrl +
        '?' +
        makeQuery(localCfg);
    };

    globalThis.closeFuxaPidTuning = function () {
      panel.style.display = 'none';
      frame.src = 'about:blank';
    };

    globalThis[GLOBAL_KEY] = true;
  }

  globalThis.openFuxaPidTuning(cfg);
})();
