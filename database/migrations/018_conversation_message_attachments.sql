SET LOCAL ROLE igreja_owner;

ALTER TABLE public.conversation_messages
  ADD CONSTRAINT conversation_messages_id_conversation_tenant_key
  UNIQUE (id, conversation_id, tenant_id);

CREATE TABLE public.conversation_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  message_id uuid NOT NULL,
  storage_key text NOT NULL UNIQUE
    CHECK (storage_key ~ '^[0-9a-f-]{36}\.(jpg|png|webp|ogg|mp3|m4a|aac)$'),
  media_kind text NOT NULL CHECK (media_kind IN ('image', 'audio')),
  mime_type text NOT NULL CHECK (mime_type IN (
    'image/jpeg', 'image/png', 'image/webp',
    'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac'
  )),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 20971520),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 86400),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_message_attachments_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT conversation_message_attachments_message_key UNIQUE (tenant_id, message_id),
  CONSTRAINT conversation_message_attachments_message_tenant_fk
    FOREIGN KEY (message_id, conversation_id, tenant_id)
    REFERENCES public.conversation_messages (id, conversation_id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX conversation_message_attachments_tenant_conversation_idx
  ON public.conversation_message_attachments (tenant_id, conversation_id, message_id);

ALTER TABLE public.conversation_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_message_attachments FORCE ROW LEVEL SECURITY;

CREATE POLICY conversation_message_attachments_tenant_isolation
ON public.conversation_message_attachments TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE TRIGGER conversation_message_attachments_audit
AFTER INSERT OR UPDATE OR DELETE ON public.conversation_message_attachments
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');

REVOKE ALL ON public.conversation_message_attachments FROM PUBLIC;
GRANT SELECT, INSERT ON public.conversation_message_attachments TO igreja_runtime;
