# Roadmap

Este roadmap indica direção, não compromisso de prazo. Issues aceitas são a fonte mais atual.

## Agora — fundação do MVP

- login local e usuário admin inicial;
- RBAC granular por tenant;
- criação/publicação de eventos e formulário dinâmico;
- página pública e confirmação de inscrição;
- PostgreSQL RLS e testes cruzados entre tenants;
- rate limit por IP real atrás de Cloudflare e Traefik.
- central operacional com lista/exportação de inscrições;
- check-in manual e indicadores de presença;
- fechamento de inscrições, conclusão e cancelamento;
- versões de formulário, modelos de evento e campanhas em rascunho;
- sessões revogáveis.
- responsável e colaboradores por evento com escopos próprio/global;
- fundação da central de conversas e canais individuais por pastor.

## Próximo

- adapter compartilhado de fila e adapter oficial do WhatsApp com webhook validado;
- consentimento, opt-out, retenção e modelos aprovados para lembretes;
- QR Code e fluxo de check-in móvel/offline;
- comparação e edição avançada de versões do formulário;
- recorrência automática com exceções de calendário;
- MFA com passkey ou TOTP e recuperação de emergência auditada;
- convite e recuperação de conta;
- consentimentos e política de retenção de dados;
- storage compartilhado do rate limit para múltiplas réplicas.

## Em estudo

- login social OIDC com adaptadores Google e Microsoft;
- magic link para membros;
- conta global participando de várias comunidades;
- lista de espera, convidados e pagamentos por evento;
- notificações por e-mail, WhatsApp e mensageria.

Itens em estudo dependem das regras registradas em `docs/business-rules.md`.
