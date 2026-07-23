# Guia de validação do professor

## Objetivo

Validar o pacote uma vez na mesma versão do Open ModSim instalada no laboratório.

## Checklist

1. Abra `planta_nivel_tanque.omsim`.
2. Confirme que não aparece erro de XML.
3. Confirme que o script inicia automaticamente.
4. Confirme que a porta 1502 fica aberta.
5. Leia HR0 a HR5 com um cliente Modbus.
6. Escreva HR1 = 5000 e confirme aumento gradual de HR3.
7. Escreva HR2 = 7000 e confirme aumento de HR4 e queda de HR0.
8. Escreva C2 = 1 e confirme HR0 = 65535.
9. Retorne C2 = 0 e confirme recuperação da PV.
10. Escreva C3 = 0 e confirme queda gradual de HR3 para zero.
11. Escreva C1 = 1 e confirme:
    - HR0 retorna a 2500;
    - HR1 retorna a 2000;
    - HR2 retorna a 4000;
    - C1 retorna automaticamente a 0.
12. Conecte o projeto OpenPLC real e confirme endereçamento zero-based.

## Ensaio didático recomendado

- iniciar em 25%;
- executar PID com SP = 40%;
- após aproximação, aplicar SP = 60%;
- aumentar a válvula de 40% para 65%;
- injetar falha de sensor;
- remover a falha e aplicar reset.

## Critério de aprovação da planta

A planta está pronta quando:

- não apresenta exceções no console;
- aceita conexões na porta 1502;
- mantém valores entre 0 e 10000;
- publica 65535 somente durante falha de sensor;
- responde de forma monotônica ao aumento da bomba;
- responde de forma monotônica ao aumento da válvula;
- o reset é executado por pulso.
