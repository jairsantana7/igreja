SET LOCAL ROLE igreja_owner;

ALTER TABLE public.conversation_channels
  DROP CONSTRAINT conversation_channels_status_check,
  ADD COLUMN connection_error_code text,
  ADD COLUMN pairing_expires_at timestamptz,
  ADD COLUMN connected_at timestamptz,
  ADD COLUMN last_seen_at timestamptz,
  ADD CONSTRAINT conversation_channels_status_check CHECK (
    status IN ('configured', 'connecting', 'awaiting_qr', 'connected', 'disconnecting', 'disconnected', 'failed')
  ),
  ADD CONSTRAINT conversation_channels_connection_error_code_check CHECK (
    connection_error_code IS NULL OR connection_error_code ~ '^[a-z][a-z0-9_]{1,62}$'
  ),
  ADD CONSTRAINT conversation_channels_id_tenant_provider_key
    UNIQUE (id, tenant_id, provider_key);

CREATE TABLE public.conversation_provider_states (
  tenant_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  provider_key text NOT NULL CHECK (provider_key ~ '^[a-z][a-z0-9_-]{1,62}$'),
  state_key text NOT NULL CHECK (length(state_key) BETWEEN 1 AND 512),
  encrypted_value bytea NOT NULL CHECK (octet_length(encrypted_value) >= 30),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, channel_id, provider_key, state_key),
  CONSTRAINT conversation_provider_states_channel_tenant_provider_fk
    FOREIGN KEY (channel_id, tenant_id, provider_key)
    REFERENCES public.conversation_channels (id, tenant_id, provider_key)
    ON DELETE CASCADE
);

CREATE INDEX conversation_provider_states_tenant_channel_idx
  ON public.conversation_provider_states (tenant_id, channel_id, provider_key, updated_at DESC);

CREATE UNIQUE INDEX conversation_messages_tenant_conversation_provider_id_key
  ON public.conversation_messages (tenant_id, conversation_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE public.conversation_provider_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_provider_states FORCE ROW LEVEL SECURITY;

CREATE POLICY conversation_provider_states_tenant_isolation
ON public.conversation_provider_states TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

REVOKE ALL ON public.conversation_provider_states FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_provider_states TO igreja_runtime;
