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
pnpm infra:up
pnpm db:seed
pnpm dev
```

Abra `http://localhost:3100`. O seed local cria:

- comunidade: `comunidade-demo`
- usuário inicial: `Admin Inicial`
- e-mail: `admin@comunidade.local`
- senha: `Comunidade#2026`
- evento futuro: `Encontro de boas-vindas`
- evento concluído: `Domingo em comunidade`
- galeria pública com três fotos sintéticas: `http://localhost:3100/g/65000000-0000-4000-8000-000000000001`

Essas credenciais são apenas para desenvolvimento. A API fica em `http://localhost:3101/api` e o PostgreSQL escuta somente em `127.0.0.1:5434`.

## Comandos

```bash
pnpm dev        # web e API
pnpm check      # tipos, testes e builds
pnpm db:up      # inicia PostgreSQL
pnpm infra:up   # inicia PostgreSQL e Redis
pnpm worker     # inicia o consumidor BullMQ em outro terminal
pnpm whatsapp:worker # mantém as sessões do WhatsApp Web em outro processo
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
- conta local de membro e base extensível para login social;
- perfil complementar opcional com data de nascimento, endereço e filhos, protegido por permissões específicas;
- papéis editáveis com permissões granulares verificadas no backend;
- trilha de auditoria para criações, edições e exclusões;
- configurações desacopladas para login social, PIX e gateways de pagamento;
- portas substituíveis para logs, cache, filas, pagamentos, identidade externa e armazenamento de mídia;
- sessões revogáveis e porta de MFA preparada para adaptadores;
- sessão dividida entre cookie `HttpOnly` e prova efêmera da aba, sem JWT no `localStorage`;
- isolamento de todas as comunidades pelo PostgreSQL RLS.

O adapter de mídia local é voltado ao desenvolvimento. Instalações de produção devem registrar um adapter de object storage e um backend compartilhado para cache/throttling quando houver múltiplas réplicas.

As galerias são criadas a partir de eventos concluídos no menu **Galerias**. Com BullMQ habilitado, `pnpm worker` produz versões WebP para exibição e miniatura; sem worker, o original validado continua disponível. Em produção, API e worker devem compartilhar o mesmo `MediaStorage` privado.

O adapter BullMQ/Redis está disponível de forma opt-in. Para usá-lo, configure `JOB_QUEUE_DRIVER=bullmq`, execute `pnpm infra:up` e mantenha `pnpm worker` em outro processo. A fila não equivale a entrega: campanhas e lembretes continuam sem envio enquanto não houver scheduler e adapter do canal.

Para testar conversas individuais com o WhatsApp via QR Code, gere uma chave com `openssl rand -base64 32`, preencha `CONVERSATION_SESSION_ENCRYPTION_KEY`, configure `WHATSAPP_WEB_DRIVER=baileys` e execute `pnpm whatsapp:worker`. No dashboard, abra **Conversas → Canais**, crie um canal do tipo **WhatsApp via QR Code** e leia o QR. Alternativamente, suba o worker isolado com `docker compose --profile whatsapp up -d --build whatsapp-worker`. A API também deve usar as mesmas variáveis e chave. Execute somente uma réplica desse worker até a instalação possuir um lock distribuído por canal. A carga inicial usa os limites `WHATSAPP_HISTORY_CHAT_LIMIT` e `WHATSAPP_HISTORY_MESSAGE_LIMIT`; um canal pareado antes de esse recurso existir precisa ser desconectado e pareado novamente uma vez para solicitar o histórico inicial.

Esse conector é não oficial, experimental e limitado a conversas diretas iniciadas ou respondidas por uma pessoa. Não é usado por campanhas nem lembretes automáticos. Instalações que precisam de garantias operacionais devem preferir a Meta Cloud API. O contrato `ConversationProvider` permite substituir Baileys por outro adapter sem alterar casos de uso ou domínio.

A central de conversas preserva canais, atendimentos e respostas pendentes. O adapter oficial já sincroniza templates pela WABA, mas Embedded Signup, envio e recebimento oficiais ainda exigem configuração da Meta e webhook validado. O adapter Baileys opcional oferece apenas o fluxo experimental por QR descrito acima.

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

Licenciado sob a [Apache License 2.0](LICENSE). Consulte também os avisos de atribuição em [NOTICE](NOTICE).
