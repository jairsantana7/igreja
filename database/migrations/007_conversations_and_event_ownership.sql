SET LOCAL ROLE igreja_owner;

INSERT INTO public.permissions (key, description) VALUES
  ('events.read_all', 'Visualizar todos os eventos da comunidade'),
  ('events.manage_all', 'Administrar todos os eventos da comunidade'),
  ('events.collaborators_manage', 'Compartilhar eventos com colaboradores'),
  ('conversations.read', 'Acessar a central de conversas'),
  ('conversations.read_all', 'Visualizar todas as conversas da comunidade'),
  ('conversations.reply', 'Responder conversas acessíveis'),
  ('conversations.assign', 'Atribuir e resolver conversas acessíveis'),
  ('channels.manage_own', 'Configurar os próprios canais de conversa'),
  ('channels.manage_all', 'Configurar todos os canais da comunidade')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

-- O papel administrativo de sistema precisa conseguir delegar as capacidades novas
-- em instalações que já possuem dados. Outros papéis permanecem em menor privilégio.
INSERT INTO public.role_permissions (tenant_id, role_id, permission_key)
SELECT roles.tenant_id, roles.id, new_permissions.permission_key
FROM public.roles
CROSS JOIN (VALUES
  ('events.read_all'),
  ('events.manage_all'),
  ('events.collaborators_manage'),
  ('conversations.read'),
  ('conversations.read_all'),
  ('conversations.reply'),
  ('conversations.assign'),
  ('channels.manage_own'),
  ('channels.manage_all')
) AS new_permissions(permission_key)
WHERE roles.key = 'admin' AND roles.is_system
ON CONFLICT DO NOTHING;

CREATE INDEX events_tenant_creator_idx
  ON public.events (tenant_id, created_by_user_id, starts_at);

CREATE TABLE public.event_collaborators (
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  added_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_id, user_id),
  CONSTRAINT event_collaborators_event_tenant_fk FOREIGN KEY (event_id, tenant_id)
    REFERENCES public.events (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT event_collaborators_user_tenant_fk FOREIGN KEY (user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT event_collaborators_actor_tenant_fk FOREIGN KEY (added_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX event_collaborators_tenant_user_idx
  ON public.event_collaborators (tenant_id, user_id, event_id);

CREATE TABLE public.conversation_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  provider_key text NOT NULL CHECK (provider_key ~ '^[a-z][a-z0-9_-]{1,62}$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 80),
  phone_number text NOT NULL CHECK (length(trim(phone_number)) BETWEEN 8 AND 32),
  provider_account_id text NOT NULL DEFAULT '' CHECK (length(provider_account_id) <= 180),
  secret_reference text CHECK (secret_reference IS NULL OR secret_reference ~ '^[A-Z][A-Z0-9_]{2,127}$'),
  status text NOT NULL DEFAULT 'configured' CHECK (status IN ('configured', 'connected', 'disconnected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_channels_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT conversation_channels_tenant_provider_phone_key UNIQUE (tenant_id, provider_key, phone_number),
  CONSTRAINT conversation_channels_owner_tenant_fk FOREIGN KEY (owner_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX conversation_channels_tenant_owner_idx
  ON public.conversation_channels (tenant_id, owner_user_id, display_name);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  event_id uuid,
  member_user_id uuid,
  assigned_user_id uuid NOT NULL,
  contact_name text NOT NULL CHECK (length(trim(contact_name)) BETWEEN 2 AND 120),
  contact_address text NOT NULL CHECK (length(trim(contact_address)) BETWEEN 3 AND 180),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting', 'resolved')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT conversations_channel_tenant_fk FOREIGN KEY (channel_id, tenant_id)
    REFERENCES public.conversation_channels (id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT conversations_event_tenant_fk FOREIGN KEY (event_id, tenant_id)
    REFERENCES public.events (id, tenant_id) ON DELETE SET NULL (event_id),
  CONSTRAINT conversations_member_tenant_fk FOREIGN KEY (member_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE SET NULL (member_user_id),
  CONSTRAINT conversations_assignee_tenant_fk FOREIGN KEY (assigned_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX conversations_tenant_assignee_status_idx
  ON public.conversations (tenant_id, assigned_user_id, status, last_message_at DESC);
CREATE INDEX conversations_tenant_channel_idx
  ON public.conversations (tenant_id, channel_id, last_message_at DESC);

CREATE TABLE public.conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  sent_by_user_id uuid,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 10000),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'pending', 'queued', 'sent', 'delivered', 'read', 'failed')),
  queue_job_id text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_messages_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT conversation_messages_conversation_tenant_fk FOREIGN KEY (conversation_id, tenant_id)
    REFERENCES public.conversations (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT conversation_messages_sender_tenant_fk FOREIGN KEY (sent_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX conversation_messages_tenant_conversation_idx
  ON public.conversation_messages (tenant_id, conversation_id, created_at, id);

ALTER TABLE public.event_communications
  ADD COLUMN conversation_channel_id uuid,
  ADD COLUMN scheduled_for timestamptz,
  ADD CONSTRAINT event_communications_channel_tenant_fk
    FOREIGN KEY (conversation_channel_id, tenant_id)
    REFERENCES public.conversation_channels (id, tenant_id) ON DELETE RESTRICT;

ALTER TABLE public.event_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_collaborators FORCE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_channels FORCE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY event_collaborators_tenant_isolation
ON public.event_collaborators TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY conversation_channels_tenant_isolation
ON public.conversation_channels TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY conversations_tenant_isolation
ON public.conversations TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY conversation_messages_tenant_isolation
ON public.conversation_messages TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE TRIGGER event_collaborators_audit
AFTER INSERT OR UPDATE OR DELETE ON public.event_collaborators
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('event_id');
CREATE TRIGGER conversation_channels_audit
AFTER INSERT OR UPDATE OR DELETE ON public.conversation_channels
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER conversations_audit
AFTER INSERT OR UPDATE OR DELETE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER conversation_messages_audit
AFTER INSERT OR UPDATE OR DELETE ON public.conversation_messages
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');

REVOKE ALL ON public.event_collaborators, public.conversation_channels, public.conversations, public.conversation_messages FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_collaborators, public.conversation_channels, public.conversations, public.conversation_messages TO igreja_runtime;
