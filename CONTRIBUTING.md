# Como contribuir

Obrigado por contribuir. Antes de escrever código, abra uma issue para mudanças de domínio ou segurança e descreva o caso de uso, as invariantes e o impacto multi-tenant.

## Fluxo local

1. Crie um branch a partir de `main`.
2. Copie `.env.example` para `.env` e instale com `pnpm install`.
3. Inicie a infraestrutura com `pnpm infra:up` e execute `pnpm db:migrate`.
4. Faça uma alteração pequena e coesa.
5. Adicione ou ajuste testes e documentação.
6. Execute `pnpm check`.
7. Abra um pull request usando o template.

Use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`). Não inclua dados reais em fixtures, issues ou logs.

## Onde alterar

- `domain`: entidades, value objects e invariantes sem NestJS ou infraestrutura;
- `application`: casos de uso e portas;
- `infrastructure`: PostgreSQL, criptografia, filas e fornecedores;
- `presentation`: HTTP, validação e tradução de erros;
- `app.module.ts`: composição das implementações.

Um controller não recebe `tenant_id` público, não contém SQL e declara a permissão granular. Casos de uso sensíveis repetem a autorização. Consulte `docs/architecture.md` antes de criar um bounded context.

## Banco, RLS e testes

Antes de uma migration:

1. classifique a tabela em `docs/rls-table-classification.md`;
2. use FK composta com `tenant_id`, RLS `ENABLE`/`FORCE`, `USING`/`WITH CHECK` e privilégio mínimo;
3. adicione um cenário com dois tenants em `rls.integration.spec.ts`;
4. siga `docs/database-migrations.md` e nunca altere SQL já aplicado.

Testes unitários ficam em `apps/api/test`. Testes de RLS usam PostgreSQL real e são ignorados quando `DATABASE_ADMIN_URL` não está disponível. Para executá-los isoladamente:

```bash
pnpm --filter @igreja/api test:rls
```

## Permissões e integrações

Toda funcionalidade autenticada nova precisa de uma chave `context.action`, seed para o papel administrativo, decorator no controller, validação no caso de uso e teste de acesso negado. Ocultar o menu no Nuxt é apenas experiência visual.

Novos fornecedores implementam uma porta e são registrados no composition root. Inclua teste de contrato, variáveis, rotação de segredo e modo de falha conforme `docs/integrations.md`.

## Pull request

Descreva comportamento observável, impacto em dados/tenancy, compatibilidade e como verificou. Mudanças de domínio, segurança, persistência ou contrato público incluem ADR e entrada em `CHANGELOG.md`. Use dados totalmente sintéticos em exemplos.

Problemas comuns estão em `docs/troubleshooting.md`. Vulnerabilidades seguem exclusivamente `SECURITY.md`.

Salvo declaração explícita em contrário, ao enviar uma contribuição para inclusão no projeto você concorda que ela seja licenciada sob a [Apache License 2.0](LICENSE), sem termos adicionais, conforme a seção 5 da licença.
