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
