(* Controle PID de nivel para a planta Open ModSim fornecida.
   Escala de processo: 0..10000 = 0..100,00%.
   Ciclo da tarefa: 100 ms.
   O OpenPLC atua como cliente Modbus da planta em 127.0.0.1:1502
   e como servidor Modbus para o ModScan em porta 1503. *)

PROGRAM main
  VAR
    (* Dados da planta ModSim - Holding Registers 40001..40006 *)
    NivelPVRaw : UINT AT %IW0;
    ValvulaSaidaRaw : UINT AT %IW1;
    VazaoEntradaRaw : UINT AT %IW2;
    VazaoSaidaRaw : UINT AT %IW3;
    PlantaStatusRaw : UINT AT %IW4;
    BombaCmdRaw : UINT AT %QW0;

    (* Coils da planta ModSim 00001..00004 *)
    PlantaEnableFb : BOOL AT %IX0.0;
    PlantaResetFb : BOOL AT %IX0.1;
    FalhaSensorFb : BOOL AT %IX0.2;
    BombaDisponivelFb : BOOL AT %IX0.3;
    PlantaEnableCmd : BOOL AT %QX0.0;
    PlantaResetCmd : BOOL AT %QX0.1;
    FalhaSensorCmd : BOOL AT %QX0.2;
    BombaDisponivelCmd : BOOL AT %QX0.3;

    (* Holding Registers expostos ao ModScan na porta 1503 *)
    SpRaw : UINT AT %MW0;                 (* 40001: setpoint, 0..10000 *)
    KpRaw : UINT AT %MW1;                 (* 40002: Kp x 100 *)
    KiRaw : UINT AT %MW2;                 (* 40003: Ki x 1000 por segundo *)
    KdRaw : UINT AT %MW3;                 (* 40004: Kd x 100 *)
    ManualOutRaw : UINT AT %MW4;          (* 40005: saida manual, 0..10000 *)
    AutoModeRaw : UINT AT %MW5;           (* 40006: 0 manual, diferente de 0 automatico *)
    ControleEnableRaw : UINT AT %MW6;     (* 40007: habilita controle e planta *)
    ResetPlantaRaw : UINT AT %MW7;        (* 40008: escrever 1 gera pulso de reset *)
    FalhaSensorCmdRaw : UINT AT %MW8;     (* 40009: simula falha do sensor *)
    BombaDisponivelCmdRaw : UINT AT %MW9; (* 40010: disponibilidade simulada da bomba *)
    PvMonitorRaw : UINT AT %MW10;         (* 40011: nivel medido *)
    OutMonitorRaw : UINT AT %MW11;        (* 40012: saida aplicada *)
    ErroMonitorRaw : INT AT %MW12;        (* 40013: erro SP-PV *)
    ControlStatus : UINT AT %MW13;        (* 40014: palavra de estado *)
    ValvulaMonitorRaw : UINT AT %MW14;    (* 40015 *)
    QinMonitorRaw : UINT AT %MW15;        (* 40016 *)
    QoutMonitorRaw : UINT AT %MW16;       (* 40017 *)
    PlantStatusMonitor : UINT AT %MW17;   (* 40018 *)
    ConfigMagic : UINT AT %MW18;          (* 40019: 42330 indica inicializado *)
    ResetPidRaw : UINT AT %MW19;          (* 40020: escrever 1 zera memoria do PID *)
    PTermMonitor : INT AT %MW20;          (* 40021: termo P x 100 *)
    ITermMonitor : INT AT %MW21;          (* 40022: termo I x 100 *)
    DTermMonitor : INT AT %MW22;          (* 40023: termo D x 100 *)
    ReservedMonitor : UINT AT %MW23;      (* 40024 *)

    (* Variaveis internas *)
    Ts : REAL;
    PvPct : REAL;
    SpPct : REAL;
    Kp : REAL;
    Ki : REAL;
    Kd : REAL;
    ErrorPct : REAL;
    PrevErrorPct : REAL;
    IntegralTerm : REAL;
    DerivativeTerm : REAL;
    PTerm : REAL;
    DTerm : REAL;
    UnsatOutPct : REAL;
    CandidateIntegral : REAL;
    OutPct : REAL;
    ManualOutPct : REAL;
    SensorFault : BOOL;
    PidActive : BOOL;
    Saturated : BOOL;
    ResetPulseCounter : UINT;
  END_VAR

(* Inicializacao de parametros apenas quando a area %MW ainda nao foi preparada. *)
IF ConfigMagic <> UINT#42330 THEN
    SpRaw := UINT#5000;
    KpRaw := UINT#200;
    KiRaw := UINT#80;
    KdRaw := UINT#0;
    ManualOutRaw := UINT#2000;
    AutoModeRaw := UINT#1;
    ControleEnableRaw := UINT#1;
    ResetPlantaRaw := UINT#0;
    FalhaSensorCmdRaw := UINT#0;
    BombaDisponivelCmdRaw := UINT#1;
    ResetPidRaw := UINT#0;
    ConfigMagic := UINT#42330;
    IntegralTerm := 0.0;
    PrevErrorPct := 0.0;
    ResetPulseCounter := UINT#0;
END_IF;

(* Limites para comandos recebidos do supervisorio. *)
IF SpRaw > UINT#10000 THEN
    SpRaw := UINT#10000;
END_IF;
IF ManualOutRaw > UINT#10000 THEN
    ManualOutRaw := UINT#10000;
END_IF;

(* Comandos discretos enviados a planta. *)
PlantaEnableCmd := ControleEnableRaw <> UINT#0;
FalhaSensorCmd := FalhaSensorCmdRaw <> UINT#0;
BombaDisponivelCmd := BombaDisponivelCmdRaw <> UINT#0;

(* Pulso de reset com duracao de 1 segundo. *)
IF (ResetPlantaRaw <> UINT#0) AND (ResetPulseCounter = UINT#0) THEN
    ResetPulseCounter := UINT#10;
    ResetPlantaRaw := UINT#0;
END_IF;

IF ResetPulseCounter > UINT#0 THEN
    PlantaResetCmd := TRUE;
    ResetPulseCounter := ResetPulseCounter - UINT#1;
ELSE
    PlantaResetCmd := FALSE;
END_IF;

(* Conversao das escalas do processo e dos parametros. *)
Ts := 0.1;
PvPct := UINT_TO_REAL(NivelPVRaw) / 100.0;
SpPct := UINT_TO_REAL(SpRaw) / 100.0;
Kp := UINT_TO_REAL(KpRaw) / 100.0;
Ki := UINT_TO_REAL(KiRaw) / 1000.0;
Kd := UINT_TO_REAL(KdRaw) / 100.0;
ManualOutPct := UINT_TO_REAL(ManualOutRaw) / 100.0;

SensorFault := (NivelPVRaw = UINT#65535) OR FalhaSensorFb;
PidActive := (ControleEnableRaw <> UINT#0)
             AND (AutoModeRaw <> UINT#0)
             AND PlantaEnableFb
             AND BombaDisponivelFb
             AND (NOT SensorFault);

IF ResetPidRaw <> UINT#0 THEN
    IntegralTerm := 0.0;
    PrevErrorPct := 0.0;
    ResetPidRaw := UINT#0;
END_IF;

Saturated := FALSE;
PTerm := 0.0;
DTerm := 0.0;

IF PidActive THEN
    ErrorPct := SpPct - PvPct;
    PTerm := Kp * ErrorPct;
    DerivativeTerm := (ErrorPct - PrevErrorPct) / Ts;
    DTerm := Kd * DerivativeTerm;

    CandidateIntegral := IntegralTerm + (Ki * ErrorPct * Ts);
    IF CandidateIntegral > 100.0 THEN
        CandidateIntegral := 100.0;
    ELSIF CandidateIntegral < -100.0 THEN
        CandidateIntegral := -100.0;
    END_IF;

    UnsatOutPct := PTerm + CandidateIntegral + DTerm;

    (* Anti-windup por integracao condicional. *)
    IF ((UnsatOutPct >= 0.0) AND (UnsatOutPct <= 100.0))
       OR ((UnsatOutPct > 100.0) AND (ErrorPct < 0.0))
       OR ((UnsatOutPct < 0.0) AND (ErrorPct > 0.0)) THEN
        IntegralTerm := CandidateIntegral;
        UnsatOutPct := PTerm + IntegralTerm + DTerm;
    END_IF;

    IF UnsatOutPct > 100.0 THEN
        OutPct := 100.0;
        Saturated := TRUE;
    ELSIF UnsatOutPct < 0.0 THEN
        OutPct := 0.0;
        Saturated := TRUE;
    ELSE
        OutPct := UnsatOutPct;
    END_IF;

    PrevErrorPct := ErrorPct;
ELSIF (ControleEnableRaw <> UINT#0)
      AND (AutoModeRaw = UINT#0)
      AND BombaDisponivelFb
      AND (NOT SensorFault) THEN
    (* Modo manual. *)
    ErrorPct := SpPct - PvPct;
    OutPct := ManualOutPct;
    IntegralTerm := OutPct - (Kp * ErrorPct);
    IF IntegralTerm > 100.0 THEN
        IntegralTerm := 100.0;
    ELSIF IntegralTerm < -100.0 THEN
        IntegralTerm := -100.0;
    END_IF;
    PrevErrorPct := ErrorPct;
ELSE
    (* Estado seguro: comando da bomba zerado. *)
    ErrorPct := SpPct - PvPct;
    OutPct := 0.0;
    IntegralTerm := 0.0;
    PrevErrorPct := ErrorPct;
END_IF;

IF OutPct > 100.0 THEN
    OutPct := 100.0;
ELSIF OutPct < 0.0 THEN
    OutPct := 0.0;
END_IF;

BombaCmdRaw := REAL_TO_UINT(OutPct * 100.0);

(* Valores de supervisao. *)
PvMonitorRaw := NivelPVRaw;
OutMonitorRaw := BombaCmdRaw;
ErroMonitorRaw := REAL_TO_INT(ErrorPct * 100.0);
ValvulaMonitorRaw := ValvulaSaidaRaw;
QinMonitorRaw := VazaoEntradaRaw;
QoutMonitorRaw := VazaoSaidaRaw;
PlantStatusMonitor := PlantaStatusRaw;
PTermMonitor := REAL_TO_INT(PTerm * 100.0);
ITermMonitor := REAL_TO_INT(IntegralTerm * 100.0);
DTermMonitor := REAL_TO_INT(DTerm * 100.0);
ReservedMonitor := UINT#0;

(* Palavra de estado:
   bit 0 auto; bit 1 controle habilitado; bit 2 PID ativo;
   bit 3 falha de sensor; bit 4 saturado; bit 5 bomba disponivel;
   bit 6 planta habilitada; bit 7 pulso de reset. *)
ControlStatus := UINT#0;
IF AutoModeRaw <> UINT#0 THEN
    ControlStatus := ControlStatus + UINT#1;
END_IF;
IF ControleEnableRaw <> UINT#0 THEN
    ControlStatus := ControlStatus + UINT#2;
END_IF;
IF PidActive THEN
    ControlStatus := ControlStatus + UINT#4;
END_IF;
IF SensorFault THEN
    ControlStatus := ControlStatus + UINT#8;
END_IF;
IF Saturated THEN
    ControlStatus := ControlStatus + UINT#16;
END_IF;
IF BombaDisponivelFb THEN
    ControlStatus := ControlStatus + UINT#32;
END_IF;
IF PlantaEnableFb THEN
    ControlStatus := ControlStatus + UINT#64;
END_IF;
IF ResetPulseCounter > UINT#0 THEN
    ControlStatus := ControlStatus + UINT#128;
END_IF;

END_PROGRAM
