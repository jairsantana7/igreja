# Classificação das tabelas RLS

Toda tabela de aplicação deve aparecer exatamente uma vez nesta lista.

| Tabela | Classe | Motivo | Política |
|---|---|---|---|
| `tenants` | tenant root | representa a própria comunidade | `id = current_tenant_id()` |
| `users` | tenant-direct | possui `tenant_id` | `tenant_id = current_tenant_id()` em leitura e escrita |
| `member_profiles` | tenant-direct | perfil complementar pertence a um usuário da comunidade | RLS direta + FK composta para usuário; telefone, autorização de comunicação, nascimento e endereço são dados pessoais protegidos por permissão específica |
| `member_children` | tenant-direct | filho informado pertence ao perfil de um membro da comunidade | RLS direta + FK composta para perfil/usuário; dados de menores não entram na auditoria |
| `member_onboarding_deliveries` | tenant-direct | entrega temporária pertence ao membro e à comunidade | RLS direta + FKs compostas para membro e criador; payload cifrado não entra em logs ou auditoria |
| `member_onboarding_directory` | global catalog | resolve UUID público opaco para o tenant da entrega | sem acesso direto do runtime; mantido por trigger e consultado somente por função resolver estreita |
| `tenant_directory` | global catalog | mapeia slug público para UUID no fluxo mínimo de login | sem acesso direto do runtime; somente função resolver |
| `event_public_directory` | global catalog | resolve um UUID público opaco para evento/tenant | sem acesso direto do runtime; somente função resolver |
| `permissions` | global catalog | chaves estáveis compartilhadas pelo produto | runtime somente leitura |
| `roles` | tenant-direct | papel é configurado pela comunidade | RLS direta |
| `role_permissions` | tenant-direct | associação pertence à comunidade | RLS direta + FK composta para papel |
| `user_roles` | tenant-direct | atribuição pertence à comunidade | RLS direta + FKs compostas |
| `events` | tenant-direct | evento pertence à comunidade | `tenant_id = current_tenant_id()` em leitura e escrita; galeria vinculada usa FK composta com `tenant_id` |
| `event_collaborators` | tenant-direct | colaboração relaciona evento e usuário da mesma comunidade | RLS direta + FKs compostas para evento e usuário |
| `event_form_fields` | tenant-direct | campo pertence a evento e comunidade | RLS direta + FK composta para evento |
| `event_media` | tenant-direct | imagem pertence ao evento da comunidade | RLS direta + FK composta para evento; conteúdo binário fica fora do banco |
| `event_galleries` | tenant-direct | álbum editorial pertence a um evento e à comunidade | RLS direta + FKs compostas para evento e criador; acesso de gestão também respeita o escopo do evento |
| `gallery_photos` | tenant-direct | foto e seus metadados pertencem à galeria da comunidade | RLS direta + FK composta para galeria; conteúdo binário fica no adapter `MediaStorage` |
| `gallery_public_directory` | global catalog | resolve UUID público opaco para tenant e galeria publicada | sem acesso direto do runtime; consultado somente por funções resolver estreitas |
| `event_registrations` | tenant-direct | inscrição pertence a evento e comunidade | RLS direta + FKs compostas |
| `registration_answers` | tenant-direct | resposta pertence à inscrição/campo/evento | RLS direta + FKs compostas para impedir cruzamento |
| `event_form_versions` | tenant-direct | fotografia versionada do formulário pertence ao evento | RLS direta + FKs compostas para evento e autor |
| `event_check_ins` | tenant-direct | presença pertence a uma inscrição e evento da comunidade | RLS direta + FKs compostas para inscrição e operador |
| `event_communications` | tenant-direct | campanha de comunicação pertence a um evento | RLS direta + FKs compostas para evento e autor |
| `communication_templates` | tenant-direct | modelo editorial de mensagem pertence à comunidade | RLS direta + FK composta para autor; conteúdo atual é derivado de versão imutável |
| `communication_template_versions` | tenant-direct | versão imutável pertence ao modelo e à comunidade | RLS direta + FKs compostas para modelo e autor |
| `event_reminder_rules` | tenant-direct | configuração de lembrete pertence a evento, versão e canal da mesma comunidade | RLS direta + FKs compostas para impedir vínculos cruzados |
| `event_templates` | tenant-direct | modelo reutilizável pertence à comunidade | RLS direta + FK composta para autor |
| `auth_sessions` | tenant-direct | sessão revogável e hashes da prova/assinatura pertencem ao usuário da comunidade | RLS direta + FK composta para usuário; JWT, prova bruta e `User-Agent` nunca são persistidos |
| `conversation_channels` | tenant-direct | número/canal pertence a um responsável da comunidade | RLS direta + FK composta para o responsável; segredo fica fora do banco |
| `conversation_provider_states` | tenant-direct | estado opaco e criptografado do dispositivo vinculado pertence a um canal da comunidade | RLS direta + FK composta incluindo `provider_key`; runtime acessa somente dentro da transação do tenant; não possui trigger de auditoria para não registrar rotação de chaves |
| `conversations` | tenant-direct | atendimento pertence ao canal, contato e comunidade | RLS direta + FKs compostas para canal, evento, membro e responsável |
| `conversation_messages` | tenant-direct | mensagem pertence a uma conversa da comunidade | RLS direta + FKs compostas para conversa e remetente interno |
| `conversation_message_attachments` | tenant-direct | metadado de mídia privada pertence a uma mensagem e conversa da comunidade | RLS direta + FK composta para mensagem/conversa; binário fica no adapter `MediaStorage` e exige autorização da conversa |
| `conversation_message_reactions` | tenant-direct | reação pertence a uma mensagem e conversa da comunidade | RLS direta + FK composta para mensagem/conversa e ator interno opcional |
| `whatsapp_message_templates` | tenant-direct | projeção de template pertence ao canal da comunidade | RLS direta + FK composta para canal; Meta é a fonte oficial do conteúdo e status |
| `external_accounts` | tenant-direct | identidade social pertence à conta da comunidade | RLS direta + FK composta para usuário |
| `community_integrations` | tenant-direct | configuração de integração pertence à comunidade | RLS direta; segredos ficam fora da tabela |
| `audit_events` | tenant-direct | trilha de alterações pertence à comunidade | RLS direta; runtime somente leitura; paginação e filtros usam índices iniciados por `tenant_id`; triggers gravam como owner |
| `followup_stages` | tenant-direct | etapas configuráveis do acompanhamento pertencem à comunidade | RLS direta + índice iniciado por tenant |
| `followup_tags` | tenant-direct | etiquetas de acompanhamento pertencem à comunidade | RLS direta + índice iniciado por tenant |
| `pastoral_followups` | tenant-direct | acompanhamento sensível pertence à comunidade e a um responsável | RLS direta + FKs compostas para membro, responsável e etapa |
| `followup_conversations` | tenant-direct | vínculo entre acompanhamento e conversa não pode atravessar comunidades | RLS direta + FKs compostas para ambos os agregados |
| `followup_tag_assignments` | tenant-direct | associação de etiqueta deve preservar o mesmo tenant | RLS direta + FKs compostas para acompanhamento e etiqueta |
| `followup_notes` | tenant-direct | anotação pastoral sensível pertence ao acompanhamento e à comunidade | RLS direta + FKs compostas para acompanhamento e autor |
| `followup_stage_changes` | tenant-direct | histórico imutável de movimentação pertence ao acompanhamento | RLS direta + FKs compostas para acompanhamento, etapas e ator |
| `event_offerings` | tenant-direct | opção adicional pertence a um evento da comunidade | RLS direta + FK composta para evento |
| `event_registration_participants` | tenant-direct | pessoa confirmada é uma fotografia vinculada à inscrição e ao evento | RLS direta + FK composta para inscrição; check-in referencia ator do mesmo tenant |
| `registration_offering_selections` | tenant-direct | seleção de adicional pertence à inscrição e à oferta do mesmo evento | RLS direta + FKs compostas para inscrição e oferta |

## Funções estreitas sem contexto prévio

- `app.resolve_login_identity`: resolve somente a identidade mínima do login a partir do slug público e entra no contexto do tenant antes de consultar tabelas protegidas.
- `app.resolve_member_onboarding_tenant`: resolve somente o tenant de uma entrega ativa a partir de UUID público opaco e entra no contexto antes de consultar a tabela protegida.
- `app.resolve_public_gallery` e `app.resolve_public_gallery_photo`: resolvem uma galeria pública por UUID opaco, entram no tenant correto e retornam somente metadados ou a chave da mídia publicada.
- `app.resolve_public_event_linked_gallery`: resolve somente a galeria pública vinculada a um evento publicado, entrando no tenant pelo diretório opaco do evento.
- `app.list_restorable_conversation_channels`: percorre o catálogo de tenants e entra em cada contexto RLS; retorna ao worker apenas `tenant_id` e `channel_id` de sessões WhatsApp restauráveis.
- O runtime não recebe `SELECT` direto nos catálogos globais. As funções usam `SECURITY DEFINER`, `search_path` fixo, owner sem `BYPASSRLS` e `EXECUTE` explícito.

## Regras para novas tabelas

1. Escolha uma classe: tenant-direct, tenant-derived, tenant root, global catalog ou platform-privileged.
2. Prefira `tenant_id NOT NULL` nas tabelas de domínio.
3. Crie índice começando por `tenant_id`.
4. Use chave única `(id, tenant_id)` no pai e FK composta no filho.
5. Prove isolamento de leitura e mutação com dois tenants usando `igreja_runtime`.

Objetos não classificados bloqueiam o merge.
