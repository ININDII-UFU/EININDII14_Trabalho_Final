# Como usar a tela genérica de sintonia no FUXA

## O que mudou

A tela não contém mais nomes obrigatórios como `NIVEL_PV_PCT` ou
`BOMBA_MV_PCT`. As tags são recebidas na execução do script
`AbrirSintoniaPID_GENERICO_CLIENT`.

A mesma tela pode ser usada para nível, vazão, temperatura, pressão ou
qualquer outra malha PID.

## 1. Instalar os recursos

Copie a pasta:

```text
resources/pid-tuning
```

para:

```text
<FUXA>/_appdata/_upload_files/pid-tuning
```

A página deve abrir em:

```text
http://localhost:1881/resources/pid-tuning/index.html?demo=1
```

## 2. Criar o script

No editor:

```text
Scripts → Add Script
```

Use:

```text
Nome: AbrirSintoniaPIDGenerica
Modo: CLIENT
```

Cole o conteúdo de:

```text
fuxa_scripts/AbrirSintoniaPID_GENERICO_CLIENT.js
```

## 3. Criar os parâmetros do script

Crie os parâmetros exatamente como estão em:

```text
docs/PARAMETROS_DO_SCRIPT.csv
```

Os três obrigatórios são:

| Parâmetro | Tipo |
|---|---|
| `tagPV` | Tag ID |
| `tagSP` | Tag ID |
| `tagMV` | Tag ID |

Os parâmetros Auto/Manual, Local/Remoto e Kp/Ti/Td são opcionais.

## 4. Associar a um botão

Selecione o botão:

```text
Events → Click → Run Script
```

Escolha `AbrirSintoniaPIDGenerica` e preencha os parâmetros.

Para outra malha, crie outro botão chamando o mesmo script e selecione outras
tags. Não duplique o HTML e não duplique o script.

## 5. Client Access

Libere:

```text
$getTag
$setTag
$getTagId
```

## 6. Comportamento dos parâmetros opcionais

- sem `tagAuto`: os botões Auto/Manual ficam desabilitados;
- sem `tagLocal`: os botões Local/Remoto ficam desabilitados;
- sem Kp/Ti/Td: o painel de parâmetros PID fica oculto;
- `tagPV`, `tagSP` e `tagMV` são obrigatórios.

## 7. IDs ou nomes

O recomendado é usar parâmetros do tipo `Tag ID`. A tela também aceita nomes
de tags, desde que `dispositivo` seja informado e `$getTagId` esteja
habilitado.

## 8. SVG incluído

`fuxa_tela_sintonia_generica_16x9.svg` abre somente uma demonstração sem tags.

Para operação real, abra a tela pelo script genérico, pois é o evento do botão
que fornece os IDs das tags.


## Sintonia automática por resposta ao degrau

A tela inclui identificação automática de uma planta aproximada por primeira
ordem com tempo morto, representada pelos parâmetros `K`, `L` e `T`.

### Procedimento

1. Coloque o controlador em Manual.
2. Aguarde a PV estabilizar.
3. Limpe o histórico.
4. Registre algumas amostras antes do degrau.
5. Aplique `A+` ou `A−` na MV.
6. Aguarde a PV aproximar-se de um novo regime.
7. Clique em `Analisar degrau registrado`.
8. Escolha IMC/SIMC, Ziegler–Nichols ou Cohen–Coon.
9. Escolha PI ou PID.
10. Use `Copiar para os campos` para revisar.
11. Use `Aplicar Kp/Ti/Td` somente após a validação.

### O que é calculado

- `ΔMV`: amplitude efetiva do degrau;
- `ΔPV`: variação permanente da variável de processo;
- `K = ΔPV/ΔMV`: ganho estático;
- `L`: tempo morto;
- `T`: constante de tempo;
- `R²`: qualidade do ajuste do modelo.

A identificação usa os instantes de 28,3% e 63,2% da resposta.

### Segurança

IMC/SIMC é o método padrão por ser mais conservador. Ziegler–Nichols tende a
produzir respostas mais agressivas. Antes de aplicar os parâmetros em uma
planta real, confirme limites de saída, anti-windup, intertravamentos e
condições seguras de operação.
