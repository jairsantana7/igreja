# 0004 — Eventos responsáveis e conversas individuais

Status: aceita

## Contexto

Uma comunidade pode ter vários pastores. Eventos, números de WhatsApp e atendimentos precisam ter responsabilidade clara sem criar um tenant por pastor ou permitir leitura transversal implícita.

## Decisão

- A comunidade continua sendo a fronteira de isolamento RLS.
- O criador é o responsável inicial do evento; colaboradores são vínculos explícitos com usuários da mesma comunidade.
- Eventos próprios ou compartilhados são o escopo padrão. `events.read_all` e `events.manage_all` liberam supervisão transversal separadamente.
- Cada canal de conversa pertence a um usuário. Sem `conversations.read_all`, a central mostra canais próprios ou conversas atribuídas ao usuário.
- Papéis apenas agrupam `events.*`, `conversations.*` e `channels.*`; nenhuma decisão consulta o nome do papel.
- Mensagens de saída são persistidas antes da fila e entregues por `ConversationProvider` fora do request HTTP.
- Credenciais não ficam no banco; somente a referência ao segredo é persistida.

## Alternativas consideradas

- Criar um tenant por pastor: rejeitada porque quebraria colaboração, administração e visão da comunidade.
- Compartilhar automaticamente todos os eventos e números: rejeitada por excesso de privilégio e falta de responsabilidade operacional.
- Integrar diretamente com uma API específica no caso de uso: rejeitada para preservar inversão de dependência e permitir instalações open source diferentes.

## Consequências

Há filtros de autorização dentro do tenant além da RLS, pois RLS protege a comunidade e não a responsabilidade individual. Administradores precisam receber permissões globais explicitamente. Transferência de responsabilidade, retenção, consentimento, opt-out, templates do WhatsApp e webhook continuam bloqueados até regras próprias serem aceitas.
