SET LOCAL ROLE igreja_owner;

INSERT INTO public.permissions (key, description) VALUES
  ('whatsapp.templates_read', 'Visualizar templates oficiais sincronizados do WhatsApp'),
  ('whatsapp.templates_sync', 'Sincronizar templates e status com a API oficial do WhatsApp')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

DO $migration$
DECLARE
  current_tenant uuid;
BEGIN
  FOR current_tenant IN SELECT tenant_id FROM public.tenant_directory LOOP
    PERFORM set_config('app.tenant_id', current_tenant::text, true);
    INSERT INTO public.role_permissions (tenant_id, role_id, permission_key)
    SELECT roles.tenant_id, roles.id, permission_key
    FROM public.roles
    CROSS JOIN (VALUES ('whatsapp.templates_read'), ('whatsapp.templates_sync')) AS additions(permission_key)
    WHERE roles.key = 'admin' AND roles.is_system
    ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$migration$;

ALTER TABLE public.conversation_channels
  ADD COLUMN templates_synchronized_at timestamptz;

CREATE TABLE public.whatsapp_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  provider_template_id text NOT NULL CHECK (length(provider_template_id) BETWEEN 1 AND 180),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 512),
  language text NOT NULL CHECK (length(language) BETWEEN 1 AND 35),
  category text NOT NULL CHECK (length(category) BETWEEN 1 AND 80),
  status text NOT NULL CHECK (length(status) BETWEEN 1 AND 80),
  components jsonb NOT NULL CHECK (jsonb_typeof(components) = 'array'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_message_templates_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT whatsapp_message_templates_provider_key UNIQUE (tenant_id, channel_id, provider_template_id),
  CONSTRAINT whatsapp_message_templates_channel_tenant_fk FOREIGN KEY (channel_id, tenant_id)
    REFERENCES public.conversation_channels (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX whatsapp_message_templates_tenant_channel_active_idx
  ON public.whatsapp_message_templates (tenant_id, channel_id, active, name, language);

ALTER TABLE public.whatsapp_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_message_templates_tenant_isolation
ON public.whatsapp_message_templates TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE TRIGGER whatsapp_message_templates_audit
AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_message_templates
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');

REVOKE ALL ON public.whatsapp_message_templates FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_message_templates TO igreja_runtime;
