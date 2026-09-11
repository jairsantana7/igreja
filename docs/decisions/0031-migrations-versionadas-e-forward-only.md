# 0031 — Migrations versionadas, verificáveis e forward-only

Status: aceita

## Contexto

O bootstrap do PostgreSQL executava todos os arquivos somente na criação do volume. Uma instalação existente não possuía ledger nem caminho seguro de atualização, e alterar silenciosamente um arquivo antigo poderia produzir schemas diferentes com a mesma versão do código.

## Decisão

Cada migration possui prefixo sequencial, é aplicada em transação e registrada em `schema_migrations` com SHA-256. O executor usa o papel migrator, assume o owner somente na transação e mantém um advisory lock durante toda a execução. Migrations publicadas são imutáveis e correções avançam em novo arquivo.

Instalações anteriores ao ledger passam por uma adoção única, explícita e condicionada à verificação dos marcos conhecidos do schema. Rollback normal ocorre por compatibilidade de aplicação ou por nova migration; restauração de backup é reservada a falhas destrutivas.

## Alternativas consideradas

- recriar volumes em toda atualização: descartada por perder dados;
- reaplicar todos os SQLs com `IF NOT EXISTS`: descartada por mascarar drift e operações parciais;
- usar o superusuário na aplicação: descartada por violar privilégio mínimo e ampliar o impacto de comprometimento.

## Consequências

Deploys precisam executar um job de migration antes da nova aplicação. O diretório de migrations e o ledger passam a ser parte do contrato de release. Mudanças incompatíveis exigem estratégia expand/contract e instruções no changelog.

