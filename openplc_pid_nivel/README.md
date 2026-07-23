# Controle PID de nível — OpenPLC Runtime v4 + Open ModSim + ModScan

## Arquitetura

- **Open ModSim**: servidor Modbus TCP e planta dinâmica.
- **OpenPLC Runtime v4**: cliente/master Modbus e controlador PID.
- **ModScan**: segundo cliente Modbus para supervisão e testes.

## Parâmetros confirmados no arquivo da planta

- Protocolo: Modbus TCP
- IP de escuta do ModSim: `0.0.0.0`
- Porta: `1502`
- Unit ID: `1`
- Período do script: `500 ms`
- Escala: `0..10000 = 0,00..100,00%`
- Falha de sensor: `PV = 65535`

## 1. Abrir a planta

1. Abra `planta/planta_nivel_tanque.omsim` no Open ModSim.
2. Confirme que o script `03_Script_Planta_Nivel` está em modo **Periodically**, intervalo `500 ms`, e **Run on Startup**.
3. Inicie o servidor TCP na porta `1502`.
4. Confirme os valores iniciais aproximados: nível 2500, bomba 2000 e válvula 4000.

## 2. Abrir o programa no OpenPLC Editor v4

O arquivo `openplc/controle_nivel_pid.st` é um programa IEC 61131-3 completo. Crie/abra um projeto para **OpenPLC Runtime v4** e importe ou cole esse conteúdo como Structured Text. O bloco `PID_NIVEL` é separado do programa `MAIN`, facilitando a posterior chamada em Ladder.

A tarefa deve executar a cada `100 ms`, conforme a configuração presente no final do arquivo.

### Parâmetros iniciais

- SP = `50,0%`
- Kp = `2,0`
- Ki = `0,08 s⁻¹`
- Kd = `0,0 s`
- Saída = `0..100%`

São valores didáticos iniciais, não uma sintonia universal.

## 3. Configurar o Modbus Master no Editor/Runtime v4

No Project Explorer, adicione **Remote Device > Modbus**.

Transporte:

- TCP/IP
- IP `127.0.0.1` quando todos os programas estiverem no mesmo computador
- Porta `1502`
- Slave/Unit ID `1`
- Timeout `1000 ms`

Crie três grupos:

| Grupo | FC | Ciclo | Offset | Length | Espelho IEC |
|---|---:|---:|---:|---:|---|
| LeituraNivel | 03 | 100 ms | 0 | 1 | `%IW0` |
| EscritaBomba | 06 | 100 ms | 1 | 1 | `%QW0` |
| LeituraDiagnosticos | 03 | 500 ms | 2 | 4 | `%IW1..%IW4` |

O **offset é zero-based**. Assim, offset 0 corresponde a 40001 e offset 1 corresponde a 40002.

O arquivo `configuracao/modbus_master.json` serve como referência legível. Como o esquema interno pode variar entre builds do Runtime v4, recomenda-se criar os grupos pela interface do editor, que gera o JSON nativo correto.

## 4. Executar

1. Inicie o Open ModSim.
2. Compile e envie o programa ao Runtime v4.
3. Inicie o Runtime.
4. Abra o ModScan usando `configuracao/modscan_configuracao.txt`.
5. Observe o nível subir de aproximadamente 25% para o SP de 50%.

## Teste final verificável

1. Com a planta em execução, mantenha a válvula em 40% (`40003 = 4000`).
2. Use SP = 50% no OpenPLC.
3. Aguarde a estabilização e confirme no ModScan que `40001` converge para aproximadamente `5000`.
4. Altere `40003` para `6000`. A vazão de saída aumentará, o nível cairá temporariamente e o PID elevará `40002`.
5. Ative a coil `00003`. A planta publicará `40001 = 65535`; o controlador deve zerar `40002`.
6. Desative a coil `00003`; o controle volta a operar.

## Observações de rede

Quando o Runtime estiver em Docker, VM ou outro computador, `127.0.0.1` apontará para o próprio Runtime, não para o Windows que executa o ModSim. Nesse caso, configure no Remote Device o IP do computador que executa o ModSim e libere a porta TCP 1502 no firewall.
