# 0001 — Monorepo com arquitetura limpa, DDD e PostgreSQL RLS

Status: aceita

## Contexto

O produto é multi-tenant, começa por eventos e inscrições e deve ser sustentável como projeto open source. A autorização não pode depender somente de filtros no código da aplicação.

## Decisão

Usar Nuxt 4 e NestJS 11 em um monorepo pnpm. O backend aplica arquitetura limpa, com regras puras no domínio e adaptadores substituíveis. PostgreSQL impõe isolamento por RLS forçada, papéis de banco separados e contexto de tenant local à transação. RBAC usa papéis configuráveis e permissões granulares.

## Alternativas consideradas

- filtros de tenant somente no ORM: rejeitado por não cobrir SQL raw e novos caminhos automaticamente;
- papel fixo em enum: rejeitado por exigir mudança de código para cada comunidade;
- serviço proprietário de identidade obrigatório: rejeitado para preservar autonomia das instalações.

## Consequências

Consultas de negócio precisam de unidade de trabalho tenant-aware. Migrações exigem classificação de tabela e testes com PostgreSQL real. Integrações sociais entram por portas e adaptadores opcionais.
