/**************************************************************************
 * PLANTA DIDÁTICA DE CONTROLE DE NÍVEL — OPEN MODSIM 2
 *
 * Uso:
 *   - executar no modo Periodically;
 *   - intervalo obrigatório: 500 ms;
 *   - Unit ID: 1;
 *   - endereçamento interno do script: offset zero-based.
 *
 * Holding Registers — offsets:
 *   HR[0] / 40001: NIVEL_PV_RAW              0..10000 = 0,00..100,00%
 *   HR[1] / 40002: BOMBA_CMD_RAW             0..10000 = 0,00..100,00%
 *   HR[2] / 40003: VALVULA_SAIDA_CMD_RAW     0..10000 = 0,00..100,00%
 *   HR[3] / 40004: VAZAO_ENTRADA_RAW         0..10000 = 0,00..100,00%
 *   HR[4] / 40005: VAZAO_SAIDA_RAW           0..10000 = 0,00..100,00%
 *   HR[5] / 40006: PLANTA_STATUS_WORD        palavra de estado
 *
 * Coils — offsets:
 *   C[0] / 00001: PLANTA_ENABLE
 *   C[1] / 00002: PLANTA_RESET               pulso; autoapagado pelo script
 *   C[2] / 00003: FALHA_SENSOR_SIM
 *   C[3] / 00004: BOMBA_DISPONIVEL_SIM
 *
 * Bits de PLANTA_STATUS_WORD:
 *   bit 0  = planta habilitada
 *   bit 1  = bomba disponível
 *   bit 2  = falha de sensor injetada
 *   bit 3  = reset executado neste ciclo
 *   bit 4  = comando recebido fora de 0..10000 e limitado
 *   bit 5  = tanque no limite físico inferior
 *   bit 6  = tanque no limite físico superior
 *   bit 7  = vazão da bomba próxima do comando
 *   bit 8  = script da planta em execução
 *   bit 15 = heartbeat alternado
 *
 * Observação:
 *   os bits de status são diagnósticos da planta. Os alunos devem implementar
 *   seus próprios alarmes e intertravamentos no OpenPLC.
 **************************************************************************/

Server.addressBase = AddressBase.Base0;

var DEVICE_ID = 1;

/* Holding Registers */
var HR_NIVEL_PV_RAW = 0;
var HR_BOMBA_CMD_RAW = 1;
var HR_VALVULA_SAIDA_CMD_RAW = 2;
var HR_VAZAO_ENTRADA_RAW = 3;
var HR_VAZAO_SAIDA_RAW = 4;
var HR_PLANTA_STATUS_WORD = 5;

/* Coils */
var C_PLANTA_ENABLE = 0;
var C_PLANTA_RESET = 1;
var C_FALHA_SENSOR_SIM = 2;
var C_BOMBA_DISPONIVEL_SIM = 3;

/* Condição inicial */
var NIVEL_INICIAL_PCT = 25.0;
var BOMBA_INICIAL_PCT = 20.0;
var VALVULA_SAIDA_INICIAL_PCT = 40.0;

/*
 * Modelo da planta:
 *
 * Qin = dinâmica de primeira ordem do comando da bomba
 * Qout = abertura da válvula × sqrt(nível normalizado)
 * dN/dt = ganho do tanque × (Qin - Qout)
 *
 * Todas as vazões internas são representadas em % da vazão nominal.
 */
var TAU_BOMBA_S = 2.5;
var GANHO_NIVEL_PCT_POR_FLUXO_S = 0.025;
var LIMITE_RASTREAMENTO_BOMBA_PCT = 1.0;

function limit(value, minimum, maximum)
{
    if (value < minimum)
        return minimum;

    if (value > maximum)
        return maximum;

    return value;
}

function readStoredNumber(key, defaultValue)
{
    var value = Number(Storage.getItem(key));

    if (isNaN(value) || !isFinite(value))
        return defaultValue;

    return value;
}

function percentToRaw(valuePct)
{
    return Math.round(limit(valuePct, 0.0, 100.0) * 100.0);
}

function rawToPercent(valueRaw)
{
    return limit(Number(valueRaw), 0.0, 10000.0) / 100.0;
}

function setBit(word, bitNumber, condition)
{
    if (condition)
        return word | (1 << bitNumber);

    return word;
}

function publishPlant(levelPct, inletFlowPct, outletFlowPct, sensorFault, statusWord)
{
    var publishedLevelRaw = sensorFault
        ? 65535
        : percentToRaw(levelPct);

    Server.writeHolding(HR_NIVEL_PV_RAW, publishedLevelRaw, DEVICE_ID);
    Server.writeHolding(HR_VAZAO_ENTRADA_RAW, percentToRaw(inletFlowPct), DEVICE_ID);
    Server.writeHolding(HR_VAZAO_SAIDA_RAW, percentToRaw(outletFlowPct), DEVICE_ID);
    Server.writeHolding(HR_PLANTA_STATUS_WORD, statusWord, DEVICE_ID);
}

function resetPlant()
{
    Storage.setItem("tankLevelPct", NIVEL_INICIAL_PCT);
    Storage.setItem("pumpFlowPct", BOMBA_INICIAL_PCT);

    Server.writeHolding(
        HR_BOMBA_CMD_RAW,
        percentToRaw(BOMBA_INICIAL_PCT),
        DEVICE_ID
    );

    Server.writeHolding(
        HR_VALVULA_SAIDA_CMD_RAW,
        percentToRaw(VALVULA_SAIDA_INICIAL_PCT),
        DEVICE_ID
    );

    /* O reset é tratado como pulso, evitando reset permanente. */
    Server.writeCoil(C_PLANTA_RESET, false, DEVICE_ID);
}

function init()
{
    Storage.clear();

    Server.writeCoil(C_PLANTA_ENABLE, true, DEVICE_ID);
    Server.writeCoil(C_PLANTA_RESET, false, DEVICE_ID);
    Server.writeCoil(C_FALHA_SENSOR_SIM, false, DEVICE_ID);
    Server.writeCoil(C_BOMBA_DISPONIVEL_SIM, true, DEVICE_ID);

    resetPlant();

    publishPlant(
        NIVEL_INICIAL_PCT,
        BOMBA_INICIAL_PCT,
        BOMBA_INICIAL_PCT,
        false,
        0
    );

    Server.onError(DEVICE_ID, function(error)
    {
        console.error("Erro Modbus da planta: " + error);
    });

    console.log("====================================================");
    console.log("PLANTA DIDATICA DE NIVEL INICIADA");
    console.log("Servidor esperado: Modbus TCP, porta 1502, Unit ID 1");
    console.log("Escala analogica: 0..10000 = 0,00..100,00%");
    console.log("HR0 PV | HR1 bomba | HR2 valvula | HR3 Qin | HR4 Qout");
    console.log("C0 enable | C1 reset | C2 falha sensor | C3 bomba disp.");
    console.log("====================================================");
}

function tick()
{
    var dt = Number(Script.period) / 1000.0;

    if (isNaN(dt) || !isFinite(dt) || dt <= 0.0)
        dt = 0.5;

    /* Proteção caso o período seja alterado acidentalmente. */
    dt = limit(dt, 0.5, 10.0);

    var plantEnabled = Server.readCoil(C_PLANTA_ENABLE, DEVICE_ID);
    var resetRequested = Server.readCoil(C_PLANTA_RESET, DEVICE_ID);
    var sensorFault = Server.readCoil(C_FALHA_SENSOR_SIM, DEVICE_ID);
    var pumpAvailable = Server.readCoil(C_BOMBA_DISPONIVEL_SIM, DEVICE_ID);

    var pumpCommandRawReceived =
        Number(Server.readHolding(HR_BOMBA_CMD_RAW, DEVICE_ID));

    var outletCommandRawReceived =
        Number(Server.readHolding(HR_VALVULA_SAIDA_CMD_RAW, DEVICE_ID));

    var commandWasLimited =
        pumpCommandRawReceived < 0 ||
        pumpCommandRawReceived > 10000 ||
        outletCommandRawReceived < 0 ||
        outletCommandRawReceived > 10000;

    var pumpCommandPct = rawToPercent(pumpCommandRawReceived);
    var outletOpeningPct = rawToPercent(outletCommandRawReceived);

    /*
     * Reescreve os comandos limitados. Assim, os registradores sempre
     * apresentam o valor efetivamente aceito pela planta.
     */
    Server.writeHolding(
        HR_BOMBA_CMD_RAW,
        percentToRaw(pumpCommandPct),
        DEVICE_ID
    );

    Server.writeHolding(
        HR_VALVULA_SAIDA_CMD_RAW,
        percentToRaw(outletOpeningPct),
        DEVICE_ID
    );

    var resetExecuted = false;

    if (resetRequested)
    {
        resetPlant();
        resetExecuted = true;

        pumpCommandPct = BOMBA_INICIAL_PCT;
        outletOpeningPct = VALVULA_SAIDA_INICIAL_PCT;
    }

    var tankLevelPct =
        readStoredNumber("tankLevelPct", NIVEL_INICIAL_PCT);

    var pumpFlowPct =
        readStoredNumber("pumpFlowPct", BOMBA_INICIAL_PCT);

    var inletFlowPct = 0.0;
    var outletFlowPct = 0.0;

    if (plantEnabled)
    {
        var targetPumpFlowPct =
            pumpAvailable ? pumpCommandPct : 0.0;

        /*
         * Aproximação discreta de uma dinâmica de primeira ordem:
         * y(k+1) = y(k) + alpha * (u(k) - y(k))
         */
        var alpha = dt / (TAU_BOMBA_S + dt);
        alpha = limit(alpha, 0.0, 1.0);

        pumpFlowPct =
            pumpFlowPct +
            alpha * (targetPumpFlowPct - pumpFlowPct);

        pumpFlowPct = limit(pumpFlowPct, 0.0, 100.0);
        inletFlowPct = pumpFlowPct;

        /*
         * Descarga gravitacional simplificada.
         * Com nível de 25% e válvula em 40%, Qout = 20%,
         * equilibrando a condição inicial da bomba.
         */
        outletFlowPct =
            outletOpeningPct *
            Math.sqrt(limit(tankLevelPct, 0.0, 100.0) / 100.0);

        outletFlowPct = limit(outletFlowPct, 0.0, 100.0);

        var levelDerivativePctPerSecond =
            GANHO_NIVEL_PCT_POR_FLUXO_S *
            (inletFlowPct - outletFlowPct);

        tankLevelPct =
            tankLevelPct +
            levelDerivativePctPerSecond * dt;

        tankLevelPct = limit(tankLevelPct, 0.0, 100.0);
    }
    else
    {
        /*
         * Planta desabilitada: a evolução do nível é congelada e as vazões
         * publicadas são zeradas. A vazão interna da bomba é zerada para que
         * a retomada ocorra de forma previsível.
         */
        pumpFlowPct = 0.0;
        inletFlowPct = 0.0;
        outletFlowPct = 0.0;
    }

    Storage.setItem("tankLevelPct", tankLevelPct);
    Storage.setItem("pumpFlowPct", pumpFlowPct);

    var statusWord = 0;

    statusWord = setBit(statusWord, 0, plantEnabled);
    statusWord = setBit(statusWord, 1, pumpAvailable);
    statusWord = setBit(statusWord, 2, sensorFault);
    statusWord = setBit(statusWord, 3, resetExecuted);
    statusWord = setBit(statusWord, 4, commandWasLimited);
    statusWord = setBit(statusWord, 5, tankLevelPct <= 0.01);
    statusWord = setBit(statusWord, 6, tankLevelPct >= 99.99);
    statusWord = setBit(
        statusWord,
        7,
        Math.abs(pumpFlowPct - (pumpAvailable ? pumpCommandPct : 0.0))
            <= LIMITE_RASTREAMENTO_BOMBA_PCT
    );
    statusWord = setBit(statusWord, 8, true);
    statusWord = setBit(statusWord, 15, (Script.runCount % 2) === 0);

    publishPlant(
        tankLevelPct,
        inletFlowPct,
        outletFlowPct,
        sensorFault,
        statusWord
    );
}

Script.onInit(init);
tick();
