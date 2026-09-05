# Classificação das tabelas RLS

Toda tabela de aplicação deve aparecer exatamente uma vez nesta lista.

| Tabela | Classe | Motivo | Política |
|---|---|---|---|
| `tenants` | tenant root | representa a própria comunidade | `id = current_tenant_id()` |
| `users` | tenant-direct | possui `tenant_id` | `tenant_id = current_tenant_id()` em leitura e escrita |
| `member_profiles` | tenant-direct | perfil complementar pertence a um usuário da comunidade | RLS direta + FK composta para usuário; nascimento e endereço são dados pessoais protegidos por permissão específica |
| `member_children` | tenant-direct | filho informado pertence ao perfil de um membro da comunidade | RLS direta + FK composta para perfil/usuário; dados de menores não entram na auditoria |
| `tenant_directory` | global catalog | mapeia slug público para UUID no fluxo mínimo de login | sem acesso direto do runtime; somente função resolver |
| `event_public_directory` | global catalog | resolve um UUID público opaco para evento/tenant | sem acesso direto do runtime; somente função resolver |
| `permissions` | global catalog | chaves estáveis compartilhadas pelo produto | runtime somente leitura |
| `roles` | tenant-direct | papel é configurado pela comunidade | RLS direta |
| `role_permissions` | tenant-direct | associação pertence à comunidade | RLS direta + FK composta para papel |
| `user_roles` | tenant-direct | atribuição pertence à comunidade | RLS direta + FKs compostas |
| `events` | tenant-direct | evento pertence à comunidade | `tenant_id = current_tenant_id()` em leitura e escrita |
| `event_collaborators` | tenant-direct | colaboração relaciona evento e usuário da mesma comunidade | RLS direta + FKs compostas para evento e usuário |
| `event_form_fields` | tenant-direct | campo pertence a evento e comunidade | RLS direta + FK composta para evento |
| `event_media` | tenant-direct | imagem pertence ao evento da comunidade | RLS direta + FK composta para evento; conteúdo binário fica fora do banco |
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
| `conversations` | tenant-direct | atendimento pertence ao canal, contato e comunidade | RLS direta + FKs compostas para canal, evento, membro e responsável |
| `conversation_messages` | tenant-direct | mensagem pertence a uma conversa da comunidade | RLS direta + FKs compostas para conversa e remetente interno |
| `whatsapp_message_templates` | tenant-direct | projeção de template pertence ao canal da comunidade | RLS direta + FK composta para canal; Meta é a fonte oficial do conteúdo e status |
| `external_accounts` | tenant-direct | identidade social pertence à conta da comunidade | RLS direta + FK composta para usuário |
| `community_integrations` | tenant-direct | configuração de integração pertence à comunidade | RLS direta; segredos ficam fora da tabela |
| `audit_events` | tenant-direct | trilha de alterações pertence à comunidade | RLS direta; runtime somente leitura; paginação e filtros usam índices iniciados por `tenant_id`; triggers gravam como owner |

## Regras para novas tabelas

1. Escolha uma classe: tenant-direct, tenant-derived, tenant root, global catalog ou platform-privileged.
2. Prefira `tenant_id NOT NULL` nas tabelas de domínio.
3. Crie índice começando por `tenant_id`.
4. Use chave única `(id, tenant_id)` no pai e FK composta no filho.
5. Prove isolamento de leitura e mutação com dois tenants usando `igreja_runtime`.

Objetos não classificados bloqueiam o merge.
