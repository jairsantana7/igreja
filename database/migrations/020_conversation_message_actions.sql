SET LOCAL ROLE igreja_owner;

ALTER TABLE public.conversation_messages
  ADD COLUMN quoted_message_id uuid,
  ADD CONSTRAINT conversation_messages_quote_same_conversation_fk
    FOREIGN KEY (quoted_message_id, conversation_id, tenant_id)
    REFERENCES public.conversation_messages (id, conversation_id, tenant_id)
    ON DELETE SET NULL (quoted_message_id);

CREATE INDEX conversation_messages_tenant_quote_idx
  ON public.conversation_messages (tenant_id, conversation_id, quoted_message_id)
  WHERE quoted_message_id IS NOT NULL;

CREATE TABLE public.conversation_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  message_id uuid NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('channel', 'contact')),
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16 AND emoji !~ '[[:space:]]'),
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_message_reactions_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT conversation_message_reactions_actor_key UNIQUE (tenant_id, message_id, actor_kind),
  CONSTRAINT conversation_message_reactions_message_tenant_fk
    FOREIGN KEY (message_id, conversation_id, tenant_id)
    REFERENCES public.conversation_messages (id, conversation_id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT conversation_message_reactions_user_tenant_fk
    FOREIGN KEY (created_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX conversation_message_reactions_tenant_conversation_idx
  ON public.conversation_message_reactions (tenant_id, conversation_id, message_id);

ALTER TABLE public.conversation_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_message_reactions FORCE ROW LEVEL SECURITY;

CREATE POLICY conversation_message_reactions_tenant_isolation
ON public.conversation_message_reactions TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE TRIGGER conversation_message_reactions_audit
AFTER INSERT OR UPDATE OR DELETE ON public.conversation_message_reactions
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');

REVOKE ALL ON public.conversation_message_reactions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_message_reactions TO igreja_runtime;
