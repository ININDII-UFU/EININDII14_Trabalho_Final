# Sintonia FUXA — pacote genérico com sintonia automática

Este pacote contém uma única tela de sintonia reutilizável para diferentes
malhas PID.

## Arquivo principal do FUXA

```text
fuxa_scripts/AbrirSintoniaPID_GENERICO_CLIENT.js
```

O script recebe as tags na chamada do evento. Não existem nomes de tags
obrigatórios gravados na tela.

## Recursos

```text
resources/pid-tuning/index.html
resources/pid-tuning/pid-tuning.js
resources/pid-tuning/fuxa-adapter.js
resources/pid-tuning/styles.css
resources/pid-tuning/plotly-2.30.0.min.js
```

## Documentação

- `docs/GUIA_TELA_GENERICA.md`
- `docs/PARAMETROS_DO_SCRIPT.csv`
- `docs/EXEMPLO_CHAMADA_MALHA_NIVEL.csv`

## Parâmetros mínimos

- `tagPV`: Tag ID da PV;
- `tagSP`: Tag ID do SP;
- `tagMV`: Tag ID da MV.

## Parâmetros opcionais

- modo Auto/Manual;
- seleção Local/Remoto;
- Kp, Ti e Td;
- título;
- unidades;
- escalas de PV/SP e MV;
- período de amostragem;
- dimensões da janela.

## Compatibilidade

A página usa primeiro `window.parent.fuxaScriptAPI`. Como alternativas, procura
a API na própria janela e em `window.opener`.

Também existe fallback para:

```text
GET  /api/getTagValue
POST /api/setTagValue
```

## Observação sobre arquivos LEGADO

Os arquivos cujo nome começa por `LEGADO_` foram preservados apenas para
comparação. Eles não devem ser utilizados no projeto novo.


## Motor de sintonia incluído

`resources/pid-tuning/pid-autotune.js` implementa:

- detecção automática do degrau de MV;
- identificação de `K`, `L` e `T`;
- avaliação de ajuste por `R²`;
- Ziegler–Nichols para PI e PID;
- Cohen–Coon para PI e PID;
- IMC/SIMC para PI e PID;
- cópia dos valores calculados;
- aplicação opcional às tags de Kp, Ti e Td.

A ferramenta de tangente do código original também foi preservada.
