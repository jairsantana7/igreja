# 0012 — BullMQ com worker separado

Status: aceita

## Contexto

Respostas individuais e comunicações de evento já são persistidas antes do enqueue, mas a implementação padrão de `JobQueue` é desabilitada. Executar transporte externo no processo HTTP aumenta latência, mistura responsabilidades e dificulta repetição segura.

## Decisão

- BullMQ sobre Redis é o primeiro adapter compartilhado de `JobQueue`, habilitado explicitamente por configuração.
- A API usa conexão de produtor com falha rápida; o worker usa conexão persistente e reconectável.
- O Redis usa `noeviction` e persistência AOF no ambiente local.
- Jobs carregam somente identificadores e um `tenantId` derivado da identidade autenticada. O worker valida esses identificadores e abre uma transação RLS própria para cada alteração no PostgreSQL.
- Chaves de deduplicação vêm do identificador persistido da mensagem ou comunicação.
- A fila retém uma quantidade limitada de jobs concluídos e falhos para diagnóstico.
- O worker é um processo separado. Enquanto nenhum adapter de entrega estiver registrado, ele falha explicitamente o job e, ao esgotar as tentativas, marca o registro persistido como `failed`.
- `JOB_QUEUE_DRIVER=disabled` permanece o padrão seguro para instalações sem Redis e worker.

## Alternativas consideradas

- Executar no request HTTP: rejeitada por acoplamento e por não tolerar indisponibilidade do fornecedor.
- Usar Redis como fonte definitiva de estado: rejeitada; PostgreSQL continua sendo o registro auditável da intenção e do resultado.
- Habilitar BullMQ automaticamente quando `REDIS_URL` existir: rejeitada para não enfileirar trabalho em instalações sem consumidor.

## Consequências

Instalações podem trocar BullMQ por outro adapter sem alterar casos de uso. API, Redis e worker precisam ser monitorados e implantados separadamente. A presença da fila não significa que WhatsApp ou e-mail estejam configurados; essa capacidade depende de um `ConversationProvider` real.
