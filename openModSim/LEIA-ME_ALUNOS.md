# Planta de nível no Open ModSim — instruções para os alunos

## Arquivo a abrir

`planta_nivel_tanque.omsim`

O arquivo já contém:

- servidor Modbus TCP;
- Unit ID 1;
- mapa de seis Holding Registers;
- mapa de quatro Coils;
- script da planta;
- valores iniciais;
- execução automática do script a cada 500 ms.

Não crie outra planta e não altere o script.

## Inicialização

1. Feche outras instâncias do Open ModSim.
2. Abra `planta_nivel_tanque.omsim`.
3. Confirme que a conexão TCP está ativa na porta `1502`.
4. Abra a aba `01_Holding_Registers_Planta`.
5. Confirme valores próximos de:

| Endereço | Variável | Valor esperado |
|---|---|---:|
| 40001 | `NIVEL_PV_RAW` | 2500 |
| 40002 | `BOMBA_CMD_RAW` | 2000 |
| 40003 | `VALVULA_SAIDA_CMD_RAW` | 4000 |
| 40004 | `VAZAO_ENTRADA_RAW` | aproximadamente 2000 |
| 40005 | `VAZAO_SAIDA_RAW` | aproximadamente 2000 |

6. Abra `02_Coils_Comandos` e confirme:
   - 00001 = 1;
   - 00002 = 0;
   - 00003 = 0;
   - 00004 = 1.

## Configuração do OpenPLC

```text
Protocolo: Modbus TCP
Host: 127.0.0.1
Porta: 1502
Unit ID: 1
Endereços: offsets zero-based
```

Use o arquivo `configuracao_openplc_cliente.csv` para criar os canais.

## Conversão de escala

```text
NIVEL_PV_PCT = NIVEL_PV_RAW / 100.0
BOMBA_CMD_RAW = BOMBA_CMD_PCT * 100.0
```

Exemplos:

- 2500 = 25,00%;
- 5000 = 50,00%;
- 10000 = 100,00%;
- 65535 em `NIVEL_PV_RAW` indica falha simulada.

## Comandos permitidos durante a aula

- alterar `BOMBA_CMD_RAW`;
- alterar `VALVULA_SAIDA_CMD_RAW`;
- habilitar/desabilitar `PLANTA_ENABLE`;
- aplicar pulso em `PLANTA_RESET`;
- ativar/desativar `FALHA_SENSOR_SIM`;
- ativar/desativar `BOMBA_DISPONIVEL_SIM`.

Não escreva em `NIVEL_PV_RAW`, `VAZAO_ENTRADA_RAW`, `VAZAO_SAIDA_RAW` ou `PLANTA_STATUS_WORD`.

## Reset

Ao escrever 1 em `PLANTA_RESET`, a planta:

- retorna o nível para 25%;
- retorna a bomba para 20%;
- retorna a válvula de saída para 40%;
- apaga automaticamente o coil de reset.

## Falha de sensor

Ao ativar `FALHA_SENSOR_SIM`:

- o nível real interno continua evoluindo;
- `NIVEL_PV_RAW` passa a publicar 65535;
- a lógica do OpenPLC deve detectar a leitura inválida.

## Encerramento

Pare o OpenPLC antes de fechar o Open ModSim. Não salve alterações no arquivo da planta.
