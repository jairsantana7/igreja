# Roadmap

Este roadmap indica direção, não compromisso de prazo. Issues aceitas são a fonte mais atual.

## Agora — fundação do MVP

- login local e usuário admin inicial;
- RBAC granular por tenant;
- criação/publicação de eventos e formulário dinâmico;
- página pública e confirmação de inscrição;
- PostgreSQL RLS e testes cruzados entre tenants;
- rate limit por IP real atrás de Cloudflare e Traefik.

## Próximo

- interface de administração de usuários, papéis e permissões;
- edição, cancelamento e duplicação de eventos;
- lista/exportação de inscrições com autorização;
- convite e recuperação de conta;
- consentimentos e política de retenção de dados;
- storage compartilhado do rate limit para múltiplas réplicas.

## Em estudo

- login social OIDC com adaptadores Google e Microsoft;
- magic link para membros;
- conta global participando de várias comunidades;
- lista de espera, convidados, pagamentos e check-in;
- notificações por e-mail e mensageria.

Itens em estudo dependem das regras registradas em `docs/business-rules.md`.
