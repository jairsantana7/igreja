# Referência da API HTTP

Esta é a referência humana da API `v0.1`. O prefixo padrão é `/api`; em desenvolvimento, a base é `http://localhost:3101/api`. Mudanças incompatíveis seguem `docs/releases.md`.

## Autenticação, tenant e erros

O login grava a sessão em cookie `HttpOnly`, `SameSite=Strict` e devolve `sessionProof` no JSON. O navegador mantém essa prova em `sessionStorage` e envia `X-Session-Proof` em cada chamada autenticada. Clientes não devem ler, copiar para logs ou persistir o cookie.

```http
POST /api/auth/login
Content-Type: application/json

{"tenantSlug":"comunidade-demo","identifier":"membro@comunidade.local","password":"Membro#2026"}
```

```json
{
  "sessionProof": "valor-efêmero",
  "user": {
    "userId": "uuid",
    "tenantId": "uuid",
    "name": "Membro Demonstração",
    "email": "membro@comunidade.local",
    "roles": ["member"],
    "permissions": ["events.register", "events.member_portal_read"]
  }
}
```

O cliente não envia `tenant_id`: o backend o obtém da identidade autenticada ou de um diretório público estreito. Campos não declarados são rejeitados. Erros usam os status `400`, `401`, `403`, `404`, `409`, `429` e `500` com corpo NestJS sanitizado, por exemplo:

```json
{"statusCode":403,"message":"Acesso não autorizado.","error":"Forbidden"}
```

Permissões listadas são cumulativas quando separadas por `+` e alternativas quando separadas por `|`. Além do guard HTTP, casos de uso sensíveis repetem a autorização e podem restringir recursos próprios ou globais.

## Rotas públicas e sessões

| Método e rota | Acesso | Corpo/observação |
|---|---|---|
| `GET /health` | público | sonda sem dados internos |
| `POST /auth/login` | público, 5/min/IP | `LoginDto` |
| `GET /public/events/:publicId` | público | evento publicado por UUID opaco |
| `POST /public/events/:publicId/login` | público, 5/min/IP | `EventLoginDto`; cria sessão |
| `POST /public/events/:publicId/signup` | público, 5/min/IP | `EventSignUpDto`; cria conta, inscrição e sessão |
| `GET /public/events/:publicId/registration-context` | `events.register` | perfil e família reutilizáveis |
| `POST /public/events/:publicId/registrations` | `events.register` | `RegistrationDto`; responde `409` se o membro já estiver confirmado |
| `GET /public/events/:publicId/media/:mediaId` | público | mídia publicada do evento |
| `GET /public/galleries/:publicId` | público | galeria publicada conforme visibilidade |
| `GET /public/galleries/:publicId/photos/:photoId/:variant` | público | variante autorizada da foto |
| `POST /public/member-onboarding/:deliveryId/resolve` | público | `MemberOnboardingTokenDto` |
| `PUT /public/member-onboarding/:deliveryId` | público | `CompleteMemberOnboardingDto` |
| `GET /sessions/current` | autenticado | identidade e capacidades atuais |
| `GET /sessions` | `sessions.manage` | sessões ativas do próprio usuário |
| `DELETE /sessions/others` | `sessions.manage` | revoga outras sessões |
| `DELETE /sessions/current` | autenticado | revoga sessão e limpa cookie |

## Eventos, inscrições e comunicação

| Método e rota | Permissão | Corpo/observação |
|---|---|---|
| `GET /dashboard` | `events.read` | indicadores do dashboard |
| `GET /member/events` | `events.member_portal_read` | eventos disponíveis e inscrições confirmadas do próprio usuário |
| `GET /events` | `events.read` | lista conforme escopo próprio/global |
| `GET /events/linkable-galleries` | `galleries.link` | galerias que podem ser vinculadas |
| `GET /events/:eventId` | `events.read` | detalhes operacionais |
| `POST /events` | `events.create` | `CreateEventDto` |
| `PUT /events/:eventId` | `events.update` | `UpdateEventDto` |
| `POST /events/:eventId/cancel` | `events.publish` | cancela evento |
| `POST /events/:eventId/close-registrations` | `events.publish` | fecha novas inscrições |
| `POST /events/:eventId/complete` | `events.publish` | conclui evento |
| `GET /events/:eventId/collaborator-candidates` | `events.collaborators_manage` | usuários elegíveis |
| `PUT /events/:eventId/collaborators` | `events.collaborators_manage` | `UpdateEventCollaboratorsDto` |
| `POST /events/:eventId/media` | `events.update` | `multipart/form-data`, campo `file` |
| `GET /events/:eventId/registrations` | `events.registrations_read` | inscrições e participantes |
| `POST /events/:eventId/registrations/:registrationId/check-in` | `events.checkin` | check-in da inscrição |
| `DELETE /events/:eventId/registrations/:registrationId/check-in` | `events.checkin` | desfaz check-in |
| `POST /events/:eventId/registrations/:registrationId/participants/:participantId/check-in` | `events.checkin` | check-in individual |
| `DELETE /events/:eventId/registrations/:registrationId/participants/:participantId/check-in` | `events.checkin` | desfaz check-in individual |
| `GET /events/:eventId/communications` | `events.communicate` | campanhas persistidas |
| `POST /events/:eventId/communications` | `events.communicate` | `CreateEventCommunicationDto` |
| `POST /events/:eventId/communications/:communicationId/queue` | `events.communicate` | enfileira quando adapter está ativo |
| `GET /event-templates` | `events.templates_manage` | modelos reutilizáveis de evento |
| `POST /events/:eventId/template` | `events.templates_manage` | `CreateEventTemplateDto` |
| `GET /events/:eventId/reminders` | `events.reminders_manage` | regras de lembrete |
| `POST /events/:eventId/reminders` | `events.reminders_manage` | `SaveEventReminderDto` |
| `PUT /events/:eventId/reminders/:reminderId` | `events.reminders_manage` | `SaveEventReminderDto` |
| `DELETE /events/:eventId/reminders/:reminderId` | `events.reminders_manage` | remove regra |
| `GET /communication/templates` | `communications.templates_read` | modelos locais |
| `GET /communication/templates/:templateId/versions` | `communications.templates_read` | versões imutáveis |
| `POST /communication/templates` | `communications.templates_manage` | `SaveCommunicationTemplateDto` |
| `PUT /communication/templates/:templateId` | `communications.templates_manage` | cria nova versão |
| `PUT /communication/templates/:templateId/status` | `communications.templates_manage` | `SetCommunicationTemplateStatusDto` |

## Acesso, membros, configurações e auditoria

| Método e rota | Permissão | Corpo/observação |
|---|---|---|
| `GET /access` | `roles.read` | papéis e catálogo de permissões |
| `POST /access/roles` | `roles.manage` | `CreateRoleDto` |
| `PUT /access/roles/:roleId` | `roles.manage` | `UpdateRolePermissionsDto` |
| `GET /access/users` | `users.read` | membros/usuários |
| `POST /access/users` | `users.create` + `members.profile_manage` | `CreateUserDto` |
| `PUT /access/users/:userId/name` | `users.update` | `UpdateUserNameDto` |
| `GET /members/:memberId/profile` | `members.profile_read` | perfil complementar |
| `PUT /members/:memberId/profile` | `members.profile_manage` | `UpdateMemberProfileDto` |
| `GET /members/:memberId/conversations/current` | `conversations.read` | conversa atual, se houver |
| `POST /members/:memberId/conversations` | `members.profile_read` + `conversations.reply` | `StartMemberConversationDto` |
| `GET /members/onboarding-deliveries` | `members.credentials_manage` | fila de entrega manual |
| `POST /members/onboarding-deliveries/:deliveryId/reveal` | `members.credentials_manage` | revela uma vez sob política do caso de uso |
| `PUT /members/onboarding-deliveries/:deliveryId/delivered` | `members.credentials_manage` | marca entrega manual |
| `DELETE /members/onboarding-deliveries/:deliveryId` | `members.credentials_manage` | descarta entrega pendente |
| `GET /settings` | `settings.read` | configuração sem segredos resolvidos |
| `PUT /settings` | `settings.manage` | `UpdateCommunitySettingsDto` |
| `GET /audit` | `audit.read` | `limit`, `cursor`, `eventId`, `action` |

A auditoria usa paginação por cursor. `limit` aceita `1..100`; envie o cursor devolvido pela página anterior, sem interpretá-lo no cliente.

## Conversas

| Método e rota | Permissão | Corpo/observação |
|---|---|---|
| `GET /conversation-channels` | `channels.manage_own` \| `channels.manage_all` \| `conversations.read` | canais visíveis |
| `POST /conversation-channels` | `channels.manage_own` \| `channels.manage_all` | `CreateConversationChannelDto` |
| `GET /conversation-channels/:channelId/connection` | gestão de canal | estado/QR, `no-store` |
| `POST /conversation-channels/:channelId/connection` | gestão de canal | inicia conexão, 10/min/IP |
| `DELETE /conversation-channels/:channelId/connection` | gestão de canal | desconecta, 10/min/IP |
| `DELETE /conversation-channels/:channelId` | gestão de canal | `204`; pode responder `409` se ainda houver dependências |
| `GET /conversation-channels/:channelId/templates` | `whatsapp.templates_read` | projeção oficial |
| `POST /conversation-channels/:channelId/templates/sync` | `whatsapp.templates_sync` | consulta Meta, 10/min/IP |
| `GET /conversations` | `conversations.read` | lista conforme canal próprio/global |
| `GET /conversations/events` | `conversations.read` | SSE, heartbeat e reconexão pelo cliente |
| `POST /conversations` | `conversations.reply` | `CreateConversationDto` |
| `POST /conversations/:conversationId/member` | leitura + criação de usuário + gestão de perfil | `CreateMemberFromConversationDto` |
| `GET /conversations/:conversationId/messages` | `conversations.read` | histórico persistido |
| `POST /conversations/:conversationId/history-sync` | `conversations.read` | solicita sincronização incremental |
| `GET /conversations/:conversationId/media/:mediaId` | `conversations.read` | mídia privada autorizada |
| `POST /conversations/:conversationId/messages` | `conversations.reply` | `ReplyConversationDto` |
| `PUT /conversations/:conversationId/messages/:messageId/reaction` | `conversations.reply` | `ReactConversationMessageDto` |
| `POST /conversations/:conversationId/media` | `conversations.reply` | `multipart/form-data`: `file`, `caption`, `replyToMessageId` |
| `PUT /conversations/:conversationId/status` | `conversations.assign` | `UpdateConversationStatusDto` |

## Acompanhamento e galerias

| Método e rota | Permissão | Corpo/observação |
|---|---|---|
| `GET /followups` | `followups.read_own` \| `followups.read_all` | Kanban acessível |
| `GET /followups/capabilities` | leitura de acompanhamentos | capacidades efetivas |
| `GET /followups/stages` | leitura de acompanhamentos | etapas |
| `POST /followups/stages` | `followups.pipeline_manage` | `CreateFollowupStageDto` |
| `GET /followups/tags` | leitura de acompanhamentos | etiquetas |
| `POST /followups/tags` | `followups.pipeline_manage` | `CreateFollowupTagDto` |
| `POST /followups` | `followups.manage` | `CreateFollowupFromConversationDto` |
| `GET /followups/:followupId` | leitura de acompanhamentos | cartão, notas e histórico autorizados |
| `PUT /followups/:followupId/stage` | `followups.manage` | `MoveFollowupDto` |
| `PUT /followups/:followupId` | `followups.manage` | `UpdateFollowupDto` |
| `DELETE /followups/:followupId` | `followups.delete` | exclusão auditada |
| `POST /followups/:followupId/notes` | `followups.notes_manage` | `AddFollowupNoteDto` |
| `DELETE /followups/:followupId/notes/:noteId` | `followups.notes_manage` | remove nota autorizada |
| `GET /galleries` | `galleries.read_own` \| `galleries.read_all` | lista de galerias |
| `GET /galleries/events` | `galleries.create` | eventos elegíveis |
| `POST /galleries` | `galleries.create` | `CreateGalleryDto` |
| `GET /galleries/:galleryId` | leitura de galerias | detalhes editoriais |
| `PUT /galleries/:galleryId` | `galleries.update` | `UpdateGalleryDto` |
| `PATCH /galleries/:galleryId/status` | `galleries.publish` | `SetGalleryStatusDto` |
| `POST /galleries/:galleryId/photos` | `galleries.update` | `multipart/form-data`, campo `file` |
| `PUT /galleries/:galleryId/photos/order` | `galleries.update` | `ReorderGalleryPhotosDto` |
| `PATCH /galleries/:galleryId/photos/:photoId` | `galleries.update` | `UpdateGalleryPhotoDto` |
| `DELETE /galleries/:galleryId/photos/:photoId` | `galleries.update` | remove foto e metadados |
| `GET /galleries/:galleryId/photos/:photoId/:variant` | leitura de galerias | mídia privada autorizada |
| `POST /galleries/:galleryId/photos/:photoId/reuse` | `galleries.reuse` + `events.update` | `ReuseGalleryPhotoDto` |
| `GET /galleries/shared/:publicId` | `galleries.view` | compartilhamento autenticado |
| `GET /galleries/shared/:publicId/photos/:photoId/:variant` | `galleries.view` | foto compartilhada para membros |

## Modelos de entrada

Os limites exatos são validados pelos DTOs em `apps/api/src/presentation/http/dto`. Campos principais:

- `LoginDto`: `tenantSlug`, `identifier` (e-mail ou telefone) e `password`;
- `CreateEventDto`/`UpdateEventDto`: conteúdo, datas ISO-8601, capacidade, modo/cor do hero, galeria, PIX, família, campos e adicionais;
- `RegistrationDto`: respostas, perfil progressivo, participantes, adicionais e declaração PIX;
- `UpdateMemberProfileDto`: telefone, nascimento, cônjuge, casamento, endereço e filhos;
- `UpdateCommunitySettingsDto`: login social e pagamentos, sempre com referência de segredo em vez do valor secreto;
- DTOs de conversa, comunicação, galeria e acompanhamento seguem as rotas acima.

Enquanto não houver um artefato OpenAPI gerado e validado na CI, os controllers e DTOs são a fonte executável. Toda alteração de rota ou variável pública deve atualizar esta referência no mesmo pull request.
