# Registros de decisão arquitetural

Crie um arquivo numerado a partir do template para decisões que alterem domínio, segurança, dados, APIs ou dependências centrais. ADRs aceitos não são reescritos; uma decisão nova substitui a anterior e cria links entre elas.

## Índice

| ADR | Decisão | Status |
|---|---|---|
| [0001](0001-clean-ddd-postgres-rls.md) | Monorepo com arquitetura limpa, DDD e PostgreSQL RLS | aceita |
| [0002](0002-decoupled-integrations.md) | Integrações desacopladas e segredos externos | aceita |
| [0003](0003-event-operations-and-extensible-growth.md) | Central operacional e crescimento extensível | aceita |
| [0004](0004-eventos-responsaveis-e-conversas-individuais.md) | Eventos responsáveis e conversas individuais | aceita |
| [0005](0005-sessao-dividida-no-navegador.md) | Sessão dividida no navegador | aceita |
| [0006](0006-perfil-complementar-de-membros.md) | Perfil complementar de membros | aceita |
| [0007](0007-licenca-apache-2.md) | Licença Apache 2.0 para a edição comunitária | aceita |
| [0008](0008-nascimento-no-perfil-do-membro.md) | Nascimento no perfil complementar do membro | aceita |
| [0009](0009-paginacao-da-auditoria.md) | Paginação por cursor da auditoria | aceita |
| [0010](0010-projecao-de-templates-do-whatsapp.md) | Projeção de templates oficiais do WhatsApp | aceita |
| [0011](0011-modelos-versionados-e-lembretes-de-eventos.md) | Modelos versionados e lembretes de eventos | aceita |
| [0012](0012-bullmq-com-worker-separado.md) | BullMQ com worker separado | aceita |
| [0013](0013-acompanhamento-pastoral.md) | Acompanhamento pastoral | aceita |
| [0014](0014-cadastro-progressivo-e-participantes.md) | Cadastro progressivo e participantes | aceita |
| [0015](0015-login-social-no-convite-do-evento.md) | Login social no convite do evento | aceita |
| [0016](0016-conector-whatsapp-web-opcional.md) | Conector WhatsApp Web opcional | aceita |
| [0017](0017-consentimento-whatsapp-do-membro.md) | Consentimento de WhatsApp do membro | aceita |
| [0018](0018-contato-da-conversa-como-membro.md) | Contato da conversa como membro | aceita |
| [0019](0019-midia-privada-nas-conversas.md) | Mídia privada nas conversas | aceita |
| [0020](0020-envio-de-midia-pela-central.md) | Envio de mídia pela central | aceita |
| [0021](0021-atualizacao-em-tempo-real-das-conversas.md) | Atualização em tempo real das conversas | aceita |
| [0022](0022-restauracao-de-canais-no-worker.md) | Restauração de canais no worker | aceita |
| [0023](0023-sincronizacao-do-historico-whatsapp.md) | Sincronização do histórico WhatsApp | aceita |
| [0024](0024-acoes-em-mensagens.md) | Ações em mensagens | aceita |
| [0025](0025-entrega-de-acesso-e-atualizacao-cadastral.md) | Entrega de acesso e atualização cadastral | aceita |
| [0026](0026-conversa-a-partir-do-membro.md) | Conversa a partir do membro | aceita |
| [0027](0027-exclusao-de-acompanhamento.md) | Exclusão de acompanhamento | aceita |
| [0028](0028-galerias-de-eventos.md) | Galerias de eventos | aceita |
| [0029](0029-pix-manual-por-evento.md) | PIX manual por evento | aceita |
| [0030](0030-login-por-email-ou-telefone.md) | Login por e-mail ou telefone | aceita |
| [0031](0031-migrations-versionadas-e-forward-only.md) | Migrations versionadas e forward-only | aceita |
| [0032](0032-inscricao-confirmada-nao-e-reenviada.md) | Inscrição confirmada não é reenviada | aceita |
| [0033](0033-portal-de-eventos-do-membro.md) | Portal de eventos do membro separado da gestão | aceita |

## Template

```md
# NNNN — Título

Status: proposta | aceita | substituída

## Contexto

## Decisão

## Alternativas consideradas

## Consequências
```
