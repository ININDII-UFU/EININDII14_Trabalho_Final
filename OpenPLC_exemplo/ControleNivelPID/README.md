# Controle de nível PID — OpenPLC Editor/Runtime v4

Projeto nativo para o OpenPLC Editor v4, preparado para:

- **Open ModSim**: planta Modbus TCP em `porta 1502`, Unit ID `1`;
- **OpenPLC Runtime v4**: controlador PID;
- **ModScan**: supervisório Modbus TCP conectado ao OpenPLC em `porta 1503`.

## 1. Como abrir no OpenPLC Editor desktop

1. Extraia o arquivo ZIP.
2. Abra o OpenPLC Editor.
3. Use **File > Open Project** ou **Open Project** na tela inicial.
4. Selecione a **pasta `ControleNivelPID`**, e não um arquivo interno.
5. O Editor localizará o `project.json` na raiz da pasta.
6. Abra `Programs > main`.

O projeto já contém:

- tarefa cíclica `task0` em `T#100ms`;
- instância `instance0` executando `main`;
- alvo `OpenPLC Runtime v4`;
- dispositivo remoto `PlantaModSim`;
- servidor Modbus `SupervisaoModScan`.

## 2. Endereço do ModSim

O projeto usa inicialmente:

- Host: `127.0.0.1`
- Porta: `1502`
- Unit ID: `1`

Isso funciona quando o ModSim e o Runtime enxergam a mesma interface local.

Caso o Runtime v4 esteja em Docker, máquina virtual ou outro computador, abra:

`Devices > Remote Devices > PlantaModSim`

e substitua `127.0.0.1` pelo IP do computador que executa o ModSim. Em Docker Desktop, pode ser necessário usar o IP do host ou `host.docker.internal`, conforme a configuração do Runtime.

## 3. Iniciar a planta

1. Abra `planta_nivel_tanque.omsim` no Open ModSim.
2. Confirme a porta TCP `1502`.
3. Confirme o Unit ID `1`.
4. Inicie a simulação.

A planta fornecida utiliza:

| Endereço Modbus | Offset | Variável | Escala |
|---|---:|---|---|
| 40001 | 0 | Nível medido | 0–10000 = 0–100% |
| 40002 | 1 | Comando da bomba | 0–10000 = 0–100% |
| 40003 | 2 | Comando da válvula de saída | 0–10000 |
| 40004 | 3 | Vazão de entrada | 0–10000 |
| 40005 | 4 | Vazão de saída | 0–10000 |
| 40006 | 5 | Palavra de estado da planta | bits |
| 00001 | 0 | Habilitação da planta | BOOL |
| 00002 | 1 | Reset da planta | pulso BOOL |
| 00003 | 2 | Simulação de falha do sensor | BOOL |
| 00004 | 3 | Bomba disponível | BOOL |

O valor `65535` no nível é tratado como falha de sensor e força a saída da bomba para zero.

## 4. Compilar e executar

1. Conecte o Editor ao OpenPLC Runtime v4.
2. Confirme que o alvo selecionado é **OpenPLC Runtime v4**.
3. Compile o projeto.
4. Faça o deploy para o Runtime.
5. Inicie a execução.
6. Verifique no ModSim se o registrador `40002` começa a variar.

## 5. Configuração do ModScan

Conecte o ModScan ao **OpenPLC Runtime**, não diretamente ao ModSim:

- IP: endereço do OpenPLC Runtime;
- Porta: `1503`;
- Device/Unit ID: `1`;
- Tipo: Holding Registers;
- Endereço inicial: `40001` ou offset `0`, conforme o modo de exibição do ModScan;
- Comprimento: `24`;
- Formato principal: unsigned 16-bit;
- Para os termos assinados, use signed 16-bit em `40013`, `40021`, `40022` e `40023`.

### Mapa do supervisório

| ModScan | OpenPLC | Acesso | Descrição | Escala/valores |
|---|---|---|---|---|
| 40001 | `%MW0` | R/W | Setpoint | 0–10000 |
| 40002 | `%MW1` | R/W | Kp | valor ÷ 100 |
| 40003 | `%MW2` | R/W | Ki | valor ÷ 1000 por segundo |
| 40004 | `%MW3` | R/W | Kd | valor ÷ 100 |
| 40005 | `%MW4` | R/W | Saída manual | 0–10000 |
| 40006 | `%MW5` | R/W | Modo | 0 manual; 1 automático |
| 40007 | `%MW6` | R/W | Habilitação | 0 desligado; 1 ligado |
| 40008 | `%MW7` | W | Reset da planta | escrever 1 |
| 40009 | `%MW8` | R/W | Simular falha de sensor | 0/1 |
| 40010 | `%MW9` | R/W | Bomba disponível | 0/1 |
| 40011 | `%MW10` | R | Nível medido | 0–10000 |
| 40012 | `%MW11` | R | Saída aplicada | 0–10000 |
| 40013 | `%MW12` | R | Erro SP − PV | signed, x100 |
| 40014 | `%MW13` | R | Estado do controle | palavra de bits |
| 40015 | `%MW14` | R | Válvula de saída | 0–10000 |
| 40016 | `%MW15` | R | Vazão de entrada | 0–10000 |
| 40017 | `%MW16` | R | Vazão de saída | 0–10000 |
| 40018 | `%MW17` | R | Estado da planta | palavra de bits |
| 40019 | `%MW18` | R/W | Assinatura de configuração | 42330 |
| 40020 | `%MW19` | W | Reset da memória PID | escrever 1 |
| 40021 | `%MW20` | R | Termo proporcional | signed, x100 |
| 40022 | `%MW21` | R | Termo integral | signed, x100 |
| 40023 | `%MW22` | R | Termo derivativo | signed, x100 |
| 40024 | `%MW23` | R | Reservado | 0 |

### Palavra de estado em 40014

| Bit | Máscara | Significado |
|---:|---:|---|
| 0 | 1 | Modo automático |
| 1 | 2 | Controle habilitado |
| 2 | 4 | PID ativo |
| 3 | 8 | Falha de sensor |
| 4 | 16 | Saída saturada |
| 5 | 32 | Bomba disponível |
| 6 | 64 | Planta habilitada |
| 7 | 128 | Pulso de reset ativo |

## 6. Parâmetros iniciais

Ao primeiro ciclo, quando `%MW18` não contém `42330`, o programa inicializa:

- SP = `5000` → 50%;
- Kp = `200` → 2,00;
- Ki = `80` → 0,080 s⁻¹;
- Kd = `0`;
- modo automático;
- controle habilitado;
- bomba disponível.

Para restaurar esses padrões, escreva qualquer valor diferente de `42330` em `40019` e reinicie o programa, ou altere os registradores manualmente.

## 7. Teste verificável

1. Inicie o ModSim.
2. Execute o OpenPLC.
3. Abra 24 Holding Registers no ModScan, começando em 40001.
4. Confirme:
   - 40001 = aproximadamente `5000`;
   - 40006 = `1`;
   - 40007 = `1`;
   - 40010 = `1`;
   - 40011 mostra o nível;
   - 40012 mostra a saída da bomba.
5. Altere 40001 de `5000` para `7000`.
6. A saída em 40012 deve aumentar.
7. Ative falha escrevendo `1` em 40009.
8. A saída em 40012 deve ir a zero e o bit 3 de 40014 deve ligar.
9. Escreva `0` em 40009 para remover a falha.

## 8. Observação de validação

A estrutura de diretórios, os arquivos JSON e o arquivo da planta foram validados automaticamente. O código ST foi verificado quanto à estrutura de POU, blocos `VAR/END_VAR`, endereços IEC duplicados e fechamento `END_PROGRAM`.

A compilação final depende da versão instalada do OpenPLC Editor/Runtime e dos componentes do Runtime disponíveis na máquina.
