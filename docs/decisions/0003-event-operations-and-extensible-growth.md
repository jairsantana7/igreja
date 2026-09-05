# 0003 — Central operacional e crescimento extensível

Status: aceita

## Contexto

O dashboard precisa diferenciar inscrição de presença e reunir o trabalho diário do pastor sem transformar o produto em um ERP genérico. Comunicação, recorrência, pagamentos e segurança também precisam evoluir sem acoplar o núcleo a fornecedores.

## Decisão

- O detalhe do evento será a central operacional com visão geral, inscrições, formulário, comunicação e auditoria.
- Check-in será uma entidade própria, manual e reversível no MVP.
- O formulário terá fotografias imutáveis e cada inscrição guardará a versão vigente.
- Modelos reutilizam conteúdo; recorrência automática aguarda regras próprias.
- Campanhas persistem antes do enqueue e dependem das portas `JobQueue` e de canal.
- Pagamentos permanecem um bounded context separado e dependem de `PaymentGateway`.
- Tokens pertencem a sessões revogáveis. MFA depende de `MultiFactorProvider`; recuperação emergencial nunca usa bypass implícito de tenant.
- Toda capacidade autenticada continua protegida por permissão granular no controller e no caso de uso sensível.

## Alternativas consideradas

- Usar apenas a contagem de inscrições como presença: rejeitada porque mistura intenções diferentes.
- Enviar mensagens dentro da requisição HTTP: rejeitada por falha parcial, latência e acoplamento ao fornecedor.
- Criar automaticamente eventos recorrentes: adiada por falta de regras sobre calendário, exceções e alterações em série.
- Implementar pagamento dentro de inscrições: rejeitada para manter estados, conciliação e reembolso fora do agregado de evento.

## Consequências

O produto ganha uma área operacional útil e extensível. Há mais tabelas tenant-direct, todas com RLS forçada e FKs compostas. QR Code, entrega real de mensagens, recorrência automática, cobrança e MFA continuam bloqueados até suas regras e adaptadores serem definidos.
