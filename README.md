# Igreja

Base open source para uma plataforma de gestão de comunidades. O primeiro MVP permite ao pastor criar eventos com formulários de inscrição e compartilhar um link no qual membros entram ou criam conta para confirmar presença.

## Stack

- Nuxt 4 + Vue 3 no frontend
- NestJS 11 com arquitetura limpa e DDD no backend
- PostgreSQL 17 com Row-Level Security (RLS)
- pnpm workspaces e Docker Compose

## Primeiros passos

Requisitos: Node.js 22.19+, pnpm 11+ e Docker com Compose.

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:seed
pnpm dev
```

Abra `http://localhost:3100`. O seed local cria:

- comunidade: `comunidade-demo`
- usuário inicial: `Admin Inicial`
- e-mail: `admin@comunidade.local`
- senha: `Comunidade#2026`

Essas credenciais são apenas para desenvolvimento. A API fica em `http://localhost:3101/api` e o PostgreSQL escuta somente em `127.0.0.1:5434`.

## Comandos

```bash
pnpm dev        # web e API
pnpm check      # tipos, testes e builds
pnpm db:up      # inicia PostgreSQL
pnpm db:seed    # cria dados sintéticos locais
pnpm db:down    # encerra containers
```

## Escopo do MVP

- login do pastor por comunidade;
- usuário admin inicial para criar os demais papéis e acessos;
- dashboard de eventos;
- criação de evento e formulário dinâmico;
- página pública para inscrição do membro;
- conta local de membro e base extensível para login social;
- isolamento de todas as comunidades pelo PostgreSQL RLS.

## Projeto

- [Arquitetura](docs/architecture.md)
- [Regras de RLS](docs/rls-table-classification.md)
- [Proxy, IP real e rate limit](docs/reverse-proxy-security.md)
- [Política de segurança](SECURITY.md)
- [Como contribuir](CONTRIBUTING.md)
- [Governança](GOVERNANCE.md)
- [Roadmap](ROADMAP.md)
- [Código de conduta](CODE_OF_CONDUCT.md)

Licenciado sob [MIT](LICENSE).
