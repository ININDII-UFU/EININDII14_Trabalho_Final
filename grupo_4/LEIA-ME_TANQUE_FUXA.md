# Tanque SVG para o Grupo 4 — FUXA

Arquivo principal: `tanque_fuxa_grupo4.svg`

## IDs principais

- `tank-liquid`: corpo do líquido;
- `liquid-surface`: superfície do líquido;
- `level-indicator`: marcador lateral de nível;
- `pump`: bomba;
- `outlet-valve`: válvula de saída;
- `inlet-flow-arrow`: seta de entrada;
- `outlet-flow-arrow`: seta de saída;
- `status-enabled`: planta habilitada;
- `status-sensor-fault`: falha de sensor;
- `status-pump-available`: bomba disponível.

## Animação do nível

A base do líquido está em `y = 745`, e a altura útil é aproximadamente `595` unidades.

```text
altura = nivel_percentual × 5,95
y = 745 - altura
height = altura
liquid-surface.cy = y
```

Exemplos:

| Nível | y | height | cy |
|---:|---:|---:|---:|
| 0% | 745 | 0 | 745 |
| 25% | 596 | 149 | 596 |
| 50% | 448 | 297 | 448 |
| 75% | 299 | 446 | 299 |
| 100% | 150 | 595 | 150 |

Caso o FUXA importe o SVG apenas como uma imagem única, use o tanque como fundo e sobreponha uma barra vertical vinculada a `NIVEL_PV_RAW`.
