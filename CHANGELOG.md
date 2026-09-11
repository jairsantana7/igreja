# Changelog

Todas as mudanças relevantes serão documentadas neste arquivo. O formato segue Keep a Changelog e as versões seguem a política de `docs/releases.md`.

## [Não lançado]

### Adicionado

- portal **Meus eventos** para membros consultarem eventos disponíveis e o histórico das próprias inscrições;
- permissão granular `events.member_portal_read` e endpoint autenticado `GET /member/events`;
- executor transacional de migrations com advisory lock, ledger e validação de checksum;
- procedimento seguro para adoção de instalações anteriores ao ledger;
- guias de implantação, operação, API, usuário, releases e solução de problemas;
- templates de issue para bugs e documentação.

### Alterado

- a página pública trata a inscrição confirmada como somente leitura e impede uma nova confirmação para a mesma combinação de membro e evento.

### Segurança

- documentação operacional de backups, segredos, proxy confiável, escala e resposta a vulnerabilidades.

### Base existente

- fundação do MVP de eventos, inscrições, membros, permissões, auditoria, conversas, acompanhamento pastoral, galerias e PIX manual;
- Nuxt 4, NestJS 11 e PostgreSQL 17 com isolamento multi-tenant por RLS;
- adapters substituíveis para integrações, mídia, filas, cache e observabilidade.

[Não lançado]: https://github.com/jairsantana7/igreja/commits/main
