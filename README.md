# Igreja

Base open source para uma plataforma de gestão de comunidades. O primeiro MVP permite ao pastor criar eventos com formulários de inscrição e compartilhar um link no qual membros entram ou criam conta para confirmar presença.

`Igreja` é somente o nome técnico deste repositório. A marca exibida na interface vem de `APP_NAME` e pode ser definida por cada instalação.

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
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Abra `http://localhost:3100`. O seed local cria:

- comunidade: `comunidade-demo`
- administrador inicial: `Admin Inicial` — `admin@comunidade.local` / `Comunidade#2026`
- membro com WhatsApp verificado e família já cadastrados para testar confirmações sem repetir dados: `Membro Demonstração` — `membro@comunidade.local` ou `(13) 99999-0002` / `Membro#2026`
- evento futuro com café da manhã opcional e PIX manual de demonstração: `Encontro de boas-vindas`
- evento futuro sem inscrição do membro de demonstração para testar o portal: `Encontro de oração`
- evento concluído com inscrição histórica do membro de demonstração: `Domingo em comunidade`
- galeria pública com três fotos sintéticas: `http://localhost:3100/g/65000000-0000-4000-8000-000000000001`
- evento público com a galeria anterior vinculada: `http://localhost:3100/e/40000000-0000-4000-8000-000000000001`

Essas credenciais são apenas para desenvolvimento. A API fica em `http://localhost:3101/api` e o PostgreSQL escuta somente em `127.0.0.1:5434`.
O membro de demonstração possui somente as permissões mínimas para confirmar eventos, gerenciar sua sessão e visualizar galerias destinadas a membros; ele não acessa o dashboard administrativo.

## Comandos

```bash
pnpm dev        # web e API
pnpm check      # tipos, testes e builds
pnpm db:up      # inicia PostgreSQL
pnpm infra:up   # inicia PostgreSQL e Redis
pnpm db:migrate # aplica somente migrations pendentes e valida checksums
pnpm worker     # inicia o consumidor BullMQ em outro terminal
pnpm whatsapp:worker # mantém as sessões do WhatsApp Web em outro processo
pnpm db:seed    # cria dados sintéticos locais
pnpm db:down    # encerra containers
```

## Escopo do MVP

- login por comunidade com e-mail ou telefone verificado;
- usuário admin inicial para criar os demais papéis e acessos;
- dashboard de eventos;
- central operacional por evento com inscrições, presença, formulário, comunicação e auditoria;
- eventos com responsável e colaboradores, incluindo escopos de acesso próprio e global;
- central de conversas com canais individuais por pastor e vínculo opcional ao evento;
- acompanhamento pastoral em Kanban, com etapas, etiquetas, próxima ação, notas privadas ou da equipe e histórico;
- Central de comunicação com modelos locais versionados, prévia, variáveis e histórico;
- lembretes configuráveis por evento, canal, público, antecedência e versão do modelo;
- sincronização dos templates oficiais e seus status pela Meta WhatsApp Cloud API;
- check-in manual, indicadores de comparecimento e exportação CSV;
- ciclo de vida com fechamento de inscrições e conclusão;
- galerias públicas ou exclusivas para membros, com capa, ordem, legendas, acessibilidade e reaproveitamento em novos eventos;
- fotografias versionadas do formulário e modelos reutilizáveis de evento;
- criação de evento, formulário dinâmico e imagens em hero, carrossel ou fundo fixo;
- página pública para inscrição do membro;
- portal do membro com eventos disponíveis e histórico das próprias inscrições, separado da gestão;
- PIX manual vinculado por evento, com QR Code no valor dos adicionais e autodeclaração do membro;
- conta local de membro e base extensível para login social;
- perfil complementar opcional com data de nascimento, endereço e filhos, protegido por permissões específicas;
- papéis editáveis com permissões granulares verificadas no backend;
- trilha de auditoria para criações, edições e exclusões;
- configurações desacopladas para login social, PIX e gateways de pagamento;
- portas substituíveis para logs, cache, filas, pagamentos, identidade externa e armazenamento de mídia;
- sessões revogáveis e porta de MFA preparada para adaptadores;
- sessão dividida entre cookie `HttpOnly` e prova efêmera da aba, sem JWT no `localStorage`;
- isolamento de todas as comunidades pelo PostgreSQL RLS.

## Limites operacionais atuais

- mídia em disco e throttling em memória servem somente a uma topologia simples; produção distribuída exige storage compartilhado;
- BullMQ persiste jobs, mas não torna campanhas e lembretes entregáveis sem scheduler e adapter do canal;
- WhatsApp via QR Code é não oficial, experimental, restrito a conversas individuais e exige um worker persistente com uma réplica;
- a Meta Cloud API já sincroniza templates, mas Embedded Signup, webhook e envio oficial ainda estão no roadmap.

Consulte [Implantação e operação](docs/deployment.md) e [Integrações](docs/integrations.md) antes de habilitar workers ou fornecedores.

## Projeto

- [Guia de uso do MVP](docs/user-guide.md)
- [Arquitetura](docs/architecture.md)
- [Regras de negócio](docs/business-rules.md)
- [Referência da API](docs/api-reference.md)
- [Implantação e operação](docs/deployment.md)
- [Migrations e atualização do banco](docs/database-migrations.md)
- [Como implementar integrações](docs/integrations.md)
- [Regras de RLS](docs/rls-table-classification.md)
- [Proxy, IP real e rate limit](docs/reverse-proxy-security.md)
- [Solução de problemas](docs/troubleshooting.md)
- [Releases e compatibilidade](docs/releases.md)
- [Changelog](CHANGELOG.md)
- [Registros de decisão](docs/decisions/README.md)
- [Política de segurança](SECURITY.md)
- [Como contribuir](CONTRIBUTING.md)
- [Governança](GOVERNANCE.md)
- [Roadmap](ROADMAP.md)
- [Código de conduta](CODE_OF_CONDUCT.md)

Licenciado sob a [Apache License 2.0](LICENSE). Consulte também os avisos de atribuição em [NOTICE](NOTICE).
