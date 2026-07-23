(function () {
  const GLOBAL_KEY = '__FUXA_PID_FLOATING_PANEL_V1__';

  if (!globalThis[GLOBAL_KEY]) {
    const style = document.createElement('style');
    style.textContent = `
      .fuxa-pid-panel{position:fixed;z-index:1000000;display:none;overflow:hidden;border:1px solid #78909c;border-radius:14px;background:#eef3f6;box-shadow:0 22px 70px rgba(0,0,0,.42)}
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
    panel.innerHTML = '<div class="fuxa-pid-head"><span class="fuxa-pid-title">Sintonia PID</span><button class="fuxa-pid-close" type="button" aria-label="Fechar">×</button></div><div class="fuxa-pid-body"><iframe class="fuxa-pid-frame" src="about:blank" scrolling="no"></iframe></div>';
    document.body.appendChild(panel);

    const head = panel.querySelector('.fuxa-pid-head');
    const title = panel.querySelector('.fuxa-pid-title');
    const close = panel.querySelector('.fuxa-pid-close');
    const frame = panel.querySelector('.fuxa-pid-frame');
    let drag = null;

    function query(params) {
      const q = new URLSearchParams();
      Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') q.set(key, String(value));
      });
      return q.toString();
    }

    function place(width, height) {
      const w = Math.min(width, window.innerWidth - 24);
      const h = Math.min(height, window.innerHeight - 24);
      panel.style.width = w + 'px'; panel.style.height = h + 'px';
      panel.style.left = Math.max(12, Math.floor((window.innerWidth - w) / 2)) + 'px';
      panel.style.top = Math.max(12, Math.floor((window.innerHeight - h) / 2)) + 'px';
    }

    head.addEventListener('pointerdown', event => {
      drag = { x: event.clientX, y: event.clientY, left: panel.offsetLeft, top: panel.offsetTop };
      head.setPointerCapture(event.pointerId);
    });
    head.addEventListener('pointermove', event => {
      if (!drag) return;
      panel.style.left = Math.max(0, Math.min(window.innerWidth - 120, drag.left + event.clientX - drag.x)) + 'px';
      panel.style.top = Math.max(0, Math.min(window.innerHeight - 60, drag.top + event.clientY - drag.y)) + 'px';
    });
    head.addEventListener('pointerup', () => { drag = null; });
    close.addEventListener('click', () => { panel.style.display = 'none'; frame.src = 'about:blank'; });

    globalThis.openFuxaPidTuning = function (options) {
      const cfg = Object.assign({
        title: 'Nível do Tanque', device: 'OpenPLC_Nivel', units: '%', period: 500,
        width: 1180, height: 690, resourceUrl: '/resources/pid-tuning/index.html'
      }, options || {});
      title.textContent = 'Tela de Sintonia — ' + cfg.title;
      place(cfg.width, cfg.height);
      panel.style.display = 'block';
      panel.style.zIndex = String((Number(globalThis.__FUXA_PID_Z__) || 1000000) + 1);
      globalThis.__FUXA_PID_Z__ = Number(panel.style.zIndex);
      const url = cfg.resourceUrl + '?' + query(cfg);
      frame.src = url;
    };

    globalThis.closeFuxaPidTuning = function () {
      panel.style.display = 'none'; frame.src = 'about:blank';
    };

    globalThis[GLOBAL_KEY] = true;
  }

  globalThis.openFuxaPidTuning({
    title: 'Nível do Tanque',
    device: 'OpenPLC_Nivel',
    sp: 'NIVEL_SP_PCT',
    pv: 'NIVEL_PV_PCT',
    mv: 'BOMBA_MV_PCT',
    am: 'PID_AUTO',
    lr: 'COMANDO_LOCAL',
    kp: 'PID_KP',
    ti: 'PID_TI_S',
    td: 'PID_TD_S',
    units: '%',
    period: 500
  });
})();
