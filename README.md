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
- central operacional por evento com inscrições, presença, formulário, comunicação e auditoria;
- eventos com responsável e colaboradores, incluindo escopos de acesso próprio e global;
- central de conversas com canais individuais por pastor e vínculo opcional ao evento;
- check-in manual, indicadores de comparecimento e exportação CSV;
- ciclo de vida com fechamento de inscrições e conclusão;
- fotografias versionadas do formulário e modelos reutilizáveis de evento;
- criação de evento, formulário dinâmico e imagens em hero, carrossel ou fundo fixo;
- página pública para inscrição do membro;
- conta local de membro e base extensível para login social;
- papéis editáveis com permissões granulares verificadas no backend;
- trilha de auditoria para criações, edições e exclusões;
- configurações desacopladas para login social, PIX e gateways de pagamento;
- portas substituíveis para logs, cache, filas, pagamentos, identidade externa e armazenamento de mídia;
- sessões revogáveis e porta de MFA preparada para adaptadores;
- isolamento de todas as comunidades pelo PostgreSQL RLS.

O adapter de mídia local é voltado ao desenvolvimento. Instalações de produção devem registrar um adapter de object storage e um backend compartilhado para cache/throttling quando houver múltiplas réplicas.

Campanhas ficam como rascunho enquanto não existir um adaptador de fila. Essa falha explícita é intencional: a instalação nunca informa que uma mensagem foi enviada sem confirmação do broker.

A central de conversas já preserva canais, atendimentos e respostas pendentes, mas não conecta um número real por padrão. Cada instalação precisa fornecer um adapter `ConversationProvider`, credenciais em secret manager, webhook validado e uma implementação compartilhada de `JobQueue`.

## Projeto

- [Arquitetura](docs/architecture.md)
- [Regras de negócio](docs/business-rules.md)
- [Como implementar integrações](docs/integrations.md)
- [Regras de RLS](docs/rls-table-classification.md)
- [Proxy, IP real e rate limit](docs/reverse-proxy-security.md)
- [Política de segurança](SECURITY.md)
- [Como contribuir](CONTRIBUTING.md)
- [Governança](GOVERNANCE.md)
- [Roadmap](ROADMAP.md)
- [Código de conduta](CODE_OF_CONDUCT.md)

Licenciado sob [MIT](LICENSE).
