# 0032 — Inscrição confirmada não é reenviada

Status: aceita

## Contexto

A combinação de evento e membro já era única no PostgreSQL, mas o repositório usava `UPSERT` para substituir respostas, participantes e adicionais quando o membro confirmava novamente. A página pública apresentava essa ação como “Atualizar inscrição”, sem um caso de uso próprio, regras de prazo ou auditoria semântica para edição.

## Decisão

- Uma inscrição com estado `confirmed` não aceita outra confirmação para o mesmo membro e evento.
- O caso de uso consulta o estado antes de preparar a gravação e o repositório repete a verificação dentro da transação bloqueada pelo evento, protegendo requisições simultâneas.
- A restrição única `(event_id, user_id)` permanece como última barreira no PostgreSQL.
- A página pública troca o formulário por um comprovante e oferece apenas “Revisar minha inscrição” em modo de leitura.
- Uma inscrição cancelada poderá ser reativada pelo mecanismo já existente até a regra de cancelamento pelo membro ser definida; ela não é apresentada como inscrição confirmada.

## Alternativas consideradas

- manter a confirmação idempotente retornando o registro existente: descartada porque o cliente não saberia se os dados enviados foram ignorados;
- continuar atualizando silenciosamente: descartada porque mistura criação e edição e pode alterar participantes ou PIX sem uma intenção explícita;
- remover a restrição única e criar várias inscrições: descartada porque distorce capacidade, presença e comunicação.

## Consequências

Tentativas repetidas recebem HTTP `409` e não produzem mutação parcial. Uma futura edição ou desistência precisará de endpoint, permissão, prazo e auditoria próprios.
