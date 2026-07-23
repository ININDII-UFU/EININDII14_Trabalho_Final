(* Projeto: Controle PID de nivel - OpenPLC Runtime v4
   Mapeamento local gerado pelo Modbus Master:
   %IW0  <- ModSim HR0 / 40001 NIVEL_PV_RAW
   %QW0  -> ModSim HR1 / 40002 BOMBA_CMD_RAW
   %IW1  <- ModSim HR2 / 40003 VALVULA_SAIDA_CMD_RAW
   %IW2  <- ModSim HR3 / 40004 VAZAO_ENTRADA_RAW
   %IW3  <- ModSim HR4 / 40005 VAZAO_SAIDA_RAW
   %IW4  <- ModSim HR5 / 40006 PLANTA_STATUS_WORD
*)

FUNCTION_BLOCK PID_NIVEL
VAR_INPUT
    ENABLE       : BOOL;
    PV_RAW       : UINT;
    SP_PCT       : REAL;
    KP           : REAL;
    KI           : REAL;
    KD           : REAL;
    TS           : REAL;
    OUT_MIN_PCT  : REAL;
    OUT_MAX_PCT  : REAL;
END_VAR
VAR_OUTPUT
    OUT_RAW      : UINT;
    PV_PCT       : REAL;
    ERRO_PCT     : REAL;
    OUT_PCT      : REAL;
    SENSOR_FAULT : BOOL;
    SATURATED    : BOOL;
END_VAR
VAR
    integral     : REAL;
    prevError    : REAL;
    derivative   : REAL;
    unsat        : REAL;
    limited      : REAL;
END_VAR

SENSOR_FAULT := PV_RAW = UINT#65535;

IF (NOT ENABLE) OR SENSOR_FAULT THEN
    OUT_RAW := UINT#0;
    OUT_PCT := 0.0;
    ERRO_PCT := 0.0;
    SATURATED := FALSE;
    integral := 0.0;
    prevError := 0.0;
ELSE
    PV_PCT := UINT_TO_REAL(PV_RAW) / 100.0;
    ERRO_PCT := SP_PCT - PV_PCT;

    IF TS > 0.0 THEN
        derivative := (ERRO_PCT - prevError) / TS;
    ELSE
        derivative := 0.0;
    END_IF;

    (* Integral candidata; aplicada somente quando não amplia a saturação. *)
    unsat := (KP * ERRO_PCT) + integral + (KD * derivative);

    IF unsat > OUT_MAX_PCT THEN
        limited := OUT_MAX_PCT;
    ELSIF unsat < OUT_MIN_PCT THEN
        limited := OUT_MIN_PCT;
    ELSE
        limited := unsat;
    END_IF;

    SATURATED := ABS(unsat - limited) > 0.0001;

    IF (NOT SATURATED)
       OR ((unsat > OUT_MAX_PCT) AND (ERRO_PCT < 0.0))
       OR ((unsat < OUT_MIN_PCT) AND (ERRO_PCT > 0.0)) THEN
        integral := integral + (KI * ERRO_PCT * TS);
    END_IF;

    (* Recalcula após atualizar a integral. *)
    unsat := (KP * ERRO_PCT) + integral + (KD * derivative);
    IF unsat > OUT_MAX_PCT THEN
        OUT_PCT := OUT_MAX_PCT;
    ELSIF unsat < OUT_MIN_PCT THEN
        OUT_PCT := OUT_MIN_PCT;
    ELSE
        OUT_PCT := unsat;
    END_IF;

    OUT_RAW := REAL_TO_UINT(OUT_PCT * 100.0);
    prevError := ERRO_PCT;
END_IF;
END_FUNCTION_BLOCK

PROGRAM MAIN
VAR
    NivelRaw       AT %IW0 : UINT;
    BombaCmdRaw    AT %QW0 : UINT;
    ValvulaRaw     AT %IW1 : UINT;
    VazaoEntrada   AT %IW2 : UINT;
    VazaoSaida     AT %IW3 : UINT;
    StatusPlanta   AT %IW4 : UINT;

    ControleHabilitado : BOOL := TRUE;
    SetpointPct         : REAL := 50.0;
    Kp                  : REAL := 2.0;
    Ki                  : REAL := 0.08;
    Kd                  : REAL := 0.0;
    Ts                  : REAL := 0.1;

    PID1                : PID_NIVEL;
    NivelPct            : REAL;
    ErroPct             : REAL;
    SaidaPct            : REAL;
    FalhaSensor         : BOOL;
    SaidaSaturada       : BOOL;
END_VAR

PID1(
    ENABLE := ControleHabilitado,
    PV_RAW := NivelRaw,
    SP_PCT := SetpointPct,
    KP := Kp,
    KI := Ki,
    KD := Kd,
    TS := Ts,
    OUT_MIN_PCT := 0.0,
    OUT_MAX_PCT := 100.0
);

BombaCmdRaw := PID1.OUT_RAW;
NivelPct := PID1.PV_PCT;
ErroPct := PID1.ERRO_PCT;
SaidaPct := PID1.OUT_PCT;
FalhaSensor := PID1.SENSOR_FAULT;
SaidaSaturada := PID1.SATURATED;
END_PROGRAM

CONFIGURATION Config0
RESOURCE Res0 ON PLC
    TASK MainTask(INTERVAL := T#100ms, PRIORITY := 0);
    PROGRAM MainInstance WITH MainTask : MAIN;
END_RESOURCE
END_CONFIGURATION
