# Regras do projeto

Estas regras valem para todo o repositório.

## Produto e linguagem

- A interface e a documentação para usuários devem ser escritas em português do Brasil.
- O nome público da aplicação vem de `APP_NAME`; não fixe marca em componentes, e-mails ou respostas da API.
- Não invente regras de negócio. Registre decisões e dúvidas antes de implementar comportamento de domínio novo.
- O primeiro bounded context é `Eventos e inscrições`: pastores criam eventos e formulários; membros criam conta ou entram para confirmar participação.

## Arquitetura limpa e DDD

- `domain` contém entidades, value objects e invariantes puras; não importa NestJS, PostgreSQL ou bibliotecas HTTP.
- `application` contém casos de uso e portas; depende somente de `domain`.
- `infrastructure` implementa portas de banco, criptografia e serviços externos.
- `presentation` adapta HTTP para casos de uso; controllers não contêm regra de negócio nem SQL.
- Dependências apontam para dentro. A composição acontece em `app.module.ts`.
- Um módulo futuro deve representar um bounded context explícito, com nomes do vocabulário do negócio.
- Autenticação social implementa a porta `ExternalIdentityProvider`; não acople casos de uso a Google, Microsoft ou outro fornecedor.
- Autorização usa permissões granulares (`context.action`), não condicionais por nome de papel. Papéis apenas agrupam permissões por tenant.
- Controllers declaram permissões com decorator; casos de uso sensíveis também validam autorização quando puderem ser chamados fora de HTTP.

## PostgreSQL e RLS

- Toda tabela nova deve ser classificada em `docs/rls-table-classification.md` antes da migração.
- Tabelas de tenant devem usar RLS com `ENABLE` e `FORCE ROW LEVEL SECURITY`, `USING` e `WITH CHECK`.
- O papel `igreja_runtime` é `NOSUPERUSER`, `NOBYPASSRLS`, não é dono de tabelas e não altera schema.
- O tenant vem de identidade autenticada no servidor. Nunca aceite `tenant_id` do body, query string ou cabeçalho público.
- Toda consulta protegida ocorre na mesma transação que `set_config('app.tenant_id', ..., true)`.
- Nunca use `SET app.tenant_id` em nível de sessão ou uma conexão irrestrita como fallback.
- Relações entre tabelas de tenant devem incluir `tenant_id` e foreign key composta para impedir vínculos cruzados.
- SQL raw deve ser parametrizado. Valores secretos e dados pessoais não entram em logs.

## IP real e rate limit

- A API usa `request.ip`, calculado pelo `trust proxy` do Express; não leia `CF-Connecting-IP` diretamente.
- Nunca configure `trust proxy=true`. Mantenha redes confiáveis explícitas em `TRUST_PROXY`.
- Em produção, somente o Traefik acessa a API. O Traefik aceita forwarded headers apenas dos CIDRs oficiais da Cloudflare.
- Rotas de autenticação sempre recebem limite mais restrito que as demais rotas.
- Para múltiplas réplicas, substitua o armazenamento em memória do throttler por armazenamento compartilhado antes do rollout.

## Qualidade e colaboração open source

- Prefira padrões abertos, configuração por ambiente e adaptadores substituíveis; não torne um serviço proprietário obrigatório.
- Mudanças arquiteturais ou de regras criam um ADR curto em `docs/decisions/`.
- APIs públicas e variáveis novas devem ser documentadas no mesmo pull request.
- Alterações relevantes incluem testes e documentação.
- Rode `pnpm check` antes de abrir pull request.
- Commits seguem Conventional Commits.
- Nunca commite `.env`, tokens, senhas reais, dumps ou dados de produção.
