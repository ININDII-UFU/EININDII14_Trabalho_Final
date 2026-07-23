# Uso da planta por grupo

## Grupo 1 — PID e bomba

Usar:

- HR0 `NIVEL_PV_RAW`;
- HR1 `BOMBA_CMD_RAW`;
- HR3 `VAZAO_ENTRADA_RAW`;
- HR4 `VAZAO_SAIDA_RAW`;
- C0 `PLANTA_ENABLE`;
- C3 `BOMBA_DISPONIVEL_SIM`.

## Grupo 2 — PID e segurança

Usar todos os sinais do Grupo 1 e também:

- C1 `PLANTA_RESET`;
- C2 `FALHA_SENSOR_SIM`;
- HR5 `PLANTA_STATUS_WORD` somente para diagnóstico.

Os alarmes LL/HH devem ser calculados no OpenPLC, e não extraídos da palavra de status.

## Grupo 3 — PID, LIMIT, MAX e MIN

Usar:

- HR0 `NIVEL_PV_RAW`;
- HR1 `BOMBA_CMD_RAW`;
- HR2 `VALVULA_SAIDA_CMD_RAW`;
- HR3 `VAZAO_ENTRADA_RAW`;
- HR4 `VAZAO_SAIDA_RAW`;
- C0 `PLANTA_ENABLE`.

O distúrbio deve ser aplicado alterando HR2.

## Grupo 4 — FUXA e diagnóstico

O OpenPLC acessa a planta pela porta 1502.

FUXA e Open ModScan não devem acessar diretamente o Open ModSim. Eles devem acessar o servidor Modbus publicado pelo OpenPLC na porta 1503.
