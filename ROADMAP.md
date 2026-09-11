# Roadmap

Este roadmap indica direção, não compromisso de prazo. Issues aceitas são a fonte mais atual.

## Disponível no MVP

- login local e usuário admin inicial;
- RBAC granular por tenant;
- criação/publicação de eventos e formulário dinâmico;
- página pública e confirmação de inscrição;
- PostgreSQL RLS e testes cruzados entre tenants;
- rate limit por IP real atrás de Cloudflare e Traefik;
- central operacional com lista/exportação de inscrições;
- check-in manual e indicadores de presença;
- fechamento de inscrições, conclusão e cancelamento;
- versões de formulário, modelos de evento e campanhas em rascunho;
- sessões revogáveis;
- cookies `HttpOnly`, prova de sessão e proteção contra replay/CSRF;
- perfil complementar opcional de membros com permissões sensíveis próprias;
- responsável e colaboradores por evento com escopos próprio/global;
- central de conversas e canais individuais por pastor;
- modelos de comunicação versionados e regras de lembrete por evento;
- adapter compartilhado BullMQ/Redis e worker separado, habilitados de forma explícita;
- acompanhamento pastoral com Kanban, etapas, etiquetas, próximas ações e notas internas;
- cadastro progressivo reutilizado na inscrição, seleção familiar de participantes e adicionais opcionais por evento;
- galerias editoriais de eventos concluídos, com privacidade, processamento assíncrono, acessibilidade e página pública;
- conector opcional e experimental do WhatsApp via QR Code para conversas individuais;
- sincronização incremental de histórico, imagens, áudios, respostas e reações nas conversas;
- PIX manual vinculado ao evento, QR Code de convite e login por e-mail ou telefone verificado;
- ledger verificável de migrations e procedimento de atualização de instalações existentes.

## Próximo

- envio e recebimento pela Meta Cloud API, Embedded Signup e webhook validado;
- scheduler de lembretes, consentimento, opt-out, retenção e vínculo com modelos aprovados da Meta;
- QR Code e fluxo de check-in móvel/offline;
- comparação e edição avançada de versões do formulário;
- recorrência automática com exceções de calendário;
- MFA com passkey ou TOTP e recuperação de emergência auditada;
- convite e recuperação de conta;
- consentimentos e política de retenção de dados;
- storage compartilhado do rate limit para múltiplas réplicas;
- object storage pronto para produção e lock distribuído por canal do worker WhatsApp;
- artefato OpenAPI gerado e validado automaticamente contra os controllers.

## Em estudo

- login social OIDC com adaptadores Google e Microsoft;
- magic link para membros;
- conta global participando de várias comunidades;
- lista de espera, convidados e gateway com conciliação de pagamentos por evento;
- notificações por e-mail, WhatsApp e mensageria.

Itens em estudo dependem das regras registradas em `docs/business-rules.md`.
