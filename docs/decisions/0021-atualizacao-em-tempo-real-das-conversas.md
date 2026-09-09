# 0021 — Atualização em tempo real das conversas

Status: aceita

## Contexto

A Central consultava conversas, mensagens e estado dos canais a cada três segundos. O comportamento é simples, mas multiplica consultas mesmo quando nada mudou e ainda introduz atraso perceptível no atendimento.

O fluxo é predominantemente servidor → navegador. API e worker são processos separados e podem ter várias réplicas, portanto uma notificação somente em memória não atende a implantação real.

## Decisão

- A Central usa Server-Sent Events (SSE) para receber invalidações de conversas e canais em tempo real.
- O Redis distribui eventos entre API, workers e réplicas por meio da porta `ConversationRealtimeBus`. Sem Redis, um adapter em memória preserva o desenvolvimento da API, mas não promete comunicação entre processos.
- O evento contém somente `tenantId` e o tipo de recurso alterado. Conteúdo de mensagem, mídia, contato, telefone e identificadores da conversa não passam pelo barramento.
- O endpoint SSE exige sessão válida, prova de sessão e `conversations.read`. O tenant é obtido exclusivamente da identidade autenticada.
- A API filtra eventos pelo tenant no servidor. O navegador recebe apenas uma invalidação e relê dados pelas rotas existentes, que reaplicam permissão granular, escopo da conversa e RLS.
- A conexão dura no máximo 60 segundos e é reconectada para revalidar a sessão. Heartbeats evitam encerramento por proxies ociosos.
- O polling de três segundos é removido. Uma sincronização de recuperação a cada 60 segundos permanece para cobrir perda temporária da conexão, reinício do Redis ou proxies sem suporte adequado a streaming.
- Em produção, o proxy deve desabilitar buffering para o endpoint SSE e manter timeout compatível com conexões longas.

## Alternativas consideradas

- WebSocket: válido para comunicação bidirecional, mas adiciona protocolo e infraestrutura desnecessários para invalidações unidirecionais.
- Polling mais rápido: descartado por aumentar carga sem eliminar latência.
- Enviar a mensagem completa no evento: descartado porque duplicaria autorização e ampliaria a exposição de dados pessoais no barramento.
- PostgreSQL `LISTEN/NOTIFY`: viável, mas o Redis já é a infraestrutura distribuída exigida pelo worker e mantém o banco focado na persistência.

## Consequências

- Mensagens, anexos e estados do canal aparecem normalmente em tempo real.
- Uma invalidação pode gerar nova leitura autorizada, porém não carrega dados sensíveis por si só.
- Instalações com múltiplos processos precisam de Redis para tempo real; o fallback de 60 segundos continua funcional quando o barramento estiver indisponível.
