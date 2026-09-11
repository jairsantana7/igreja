# Migrations e atualização do banco

As migrations são incrementais, executadas em ordem e tratadas como imutáveis depois de aplicadas. O comando usa exclusivamente `DATABASE_MIGRATION_URL`, adquire um advisory lock no PostgreSQL e registra cada arquivo em `public.schema_migrations` com SHA-256 e horário de aplicação.

O papel `igreja_runtime` não lê nem altera esse ledger. O papel `igreja_migrator` pode assumir `igreja_owner` durante a transação da migration, mas não é superusuário e não possui `BYPASSRLS`.

## Instalação nova

```bash
cp .env.example .env
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

O entrypoint do container também aplica as migrations na primeira criação do volume. O comando explícito continua recomendado: ele valida o ledger e aplica qualquer arquivo mais recente.

## Atualização normal

1. Leia o `CHANGELOG.md` da versão de origem até a versão de destino.
2. Pare processos que fazem escrita se a nota da release exigir janela de manutenção.
3. Faça backup e teste a restauração em outro banco.
4. Disponibilize o novo código sem iniciar a nova API.
5. Execute `pnpm db:migrate` uma única vez como job de deploy.
6. Inicie API e workers e valide `GET /api/health`.

O lock permite apenas um executor por vez. Um checksum divergente interrompe a atualização: nunca edite uma migration já publicada; crie a próxima migration.

## Adoção de uma instalação anterior ao ledger

Instalações criadas antes do executor possuem as tabelas, mas não possuem registros em `schema_migrations`. Faça backup e execute uma única vez:

```bash
MIGRATION_BASELINE_CONFIRM=ADOTAR_SCHEMA_EXISTENTE pnpm db:migrate:adopt
```

O comando verifica os marcos do schema legado até `027_member_phone_login.sql`, registra seus checksums e só então aplica migrations posteriores. Ele recusa schemas parciais. Se a verificação falhar, não force o ledger: restaure uma versão conhecida ou compare o schema em um ambiente isolado.

## Produção e CI

- Injete `DATABASE_MIGRATION_URL` somente no job de migration; API e workers recebem apenas `DATABASE_URL`.
- Não execute migrations com o usuário runtime nem com o superusuário do cluster.
- Preserve os arquivos aplicados em todas as imagens/releases suportadas.
- A CI cria os papéis, aplica o mesmo conjunto de migrations e depois executa os testes RLS.
- Registre duração e resultado da migration, mas nunca a URL de conexão ou o conteúdo de linhas da aplicação.

Para uma imagem sem o workspace completo, execute o script compilado da API com `DATABASE_MIGRATIONS_PATH` apontando para o diretório SQL:

```bash
DATABASE_MIGRATIONS_PATH=/app/database/migrations node apps/api/dist/infrastructure/database/migrate.js
```

## Backup e rollback

As migrations são *forward-only*: correções normais entram em um novo arquivo. Antes de mudanças destrutivas, use a sequência expandir → migrar dados → trocar aplicação → contrair em uma release posterior.

Um rollback de aplicação só é seguro quando o `CHANGELOG` declara compatibilidade com o schema novo. Caso uma migration destrutiva falhe, restaure o backup validado; não tente apagar objetos manualmente em produção.

Exemplo de backup lógico, executado por uma identidade própria de backup:

```bash
pg_dump --format=custom --no-owner --file=backup.dump "$DATABASE_BACKUP_URL"
pg_restore --list backup.dump
```

Valide regularmente a restauração em outro banco e repita os testes RLS antes de considerar o backup utilizável.

## Criando uma migration

1. Classifique qualquer tabela em `docs/rls-table-classification.md` antes do SQL.
2. Use o próximo prefixo com três dígitos e nome em `snake_case`.
3. Comece com `SET LOCAL ROLE igreja_owner;`; o executor abre a transação.
4. Aplique RLS forçada, FKs compostas por tenant, índices e privilégios mínimos no mesmo arquivo.
5. Não aceite `tenant_id` de entrada pública nem use SQL dinâmico sem parâmetros.
6. Acrescente teste de isolamento entre dois tenants.
7. Rode `pnpm db:migrate`, `pnpm check` e documente compatibilidade/rollback no `CHANGELOG`.

