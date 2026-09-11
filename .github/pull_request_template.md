## O que mudou

<!-- Explique o resultado para usuários e mantenedores. -->

## Segurança e multi-tenancy

- [ ] Não cria tabela de aplicação, ou atualiza `docs/rls-table-classification.md` e inclui testes RLS.
- [ ] Não aceita `tenant_id` de entrada não confiável.
- [ ] Não adiciona segredo, dado pessoal ou fixture de produção.
- [ ] Funcionalidade autenticada declara permissão no controller e a valida no caso de uso sensível.
- [ ] Migration nova é forward-only, tem prefixo único e não altera arquivos já publicados.

## Compatibilidade e operação

- [ ] API, variáveis públicas, migrations e passos de upgrade foram documentados quando aplicável.
- [ ] O `CHANGELOG.md` registra a mudança relevante e o caminho de rollback/compatibilidade.

## Verificação

- [ ] `pnpm check`
- [ ] Documentação atualizada
