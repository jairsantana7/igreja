SET LOCAL ROLE igreja_owner;

INSERT INTO public.permissions (key, description) VALUES
  ('communications.templates_read', 'Visualizar modelos de mensagem da comunidade'),
  ('communications.templates_manage', 'Criar, versionar e controlar modelos de mensagem'),
  ('events.reminders_manage', 'Configurar lembretes automáticos de eventos')
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
    CROSS JOIN (VALUES
      ('communications.templates_read'),
      ('communications.templates_manage'),
      ('events.reminders_manage')
    ) AS additions(permission_key)
    WHERE roles.key = 'admin' AND roles.is_system
    ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$migration$;

CREATE TABLE public.communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 3 AND 120),
  purpose text NOT NULL CHECK (purpose IN ('registration_confirmation', 'event_reminder', 'event_update', 'event_cancellation', 'post_event')),
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communication_templates_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT communication_templates_tenant_name_key UNIQUE (tenant_id, name),
  CONSTRAINT communication_templates_creator_tenant_fk FOREIGN KEY (created_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX communication_templates_tenant_status_name_idx
  ON public.communication_templates (tenant_id, status, name, id);

CREATE TABLE public.communication_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  template_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  subject text NOT NULL DEFAULT '' CHECK (length(subject) <= 160),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 5000),
  variables jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(variables) = 'array'),
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communication_template_versions_id_template_tenant_key UNIQUE (id, template_id, tenant_id),
  CONSTRAINT communication_template_versions_number_key UNIQUE (tenant_id, template_id, version),
  CONSTRAINT communication_template_versions_template_tenant_fk FOREIGN KEY (template_id, tenant_id)
    REFERENCES public.communication_templates (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT communication_template_versions_creator_tenant_fk FOREIGN KEY (created_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX communication_template_versions_tenant_template_idx
  ON public.communication_template_versions (tenant_id, template_id, version DESC);

CREATE TABLE public.event_reminder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  template_id uuid NOT NULL,
  template_version_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  audience text NOT NULL CHECK (audience IN ('confirmed', 'checked_in', 'not_checked_in')),
  offset_minutes_before integer NOT NULL CHECK (offset_minutes_before BETWEEN 15 AND 43200),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_reminder_rules_id_event_tenant_key UNIQUE (id, event_id, tenant_id),
  CONSTRAINT event_reminder_rules_event_tenant_fk FOREIGN KEY (event_id, tenant_id)
    REFERENCES public.events (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT event_reminder_rules_template_tenant_fk FOREIGN KEY (template_id, tenant_id)
    REFERENCES public.communication_templates (id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT event_reminder_rules_version_template_tenant_fk FOREIGN KEY (template_version_id, template_id, tenant_id)
    REFERENCES public.communication_template_versions (id, template_id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT event_reminder_rules_channel_tenant_fk FOREIGN KEY (channel_id, tenant_id)
    REFERENCES public.conversation_channels (id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT event_reminder_rules_creator_tenant_fk FOREIGN KEY (created_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX event_reminder_rules_tenant_event_idx
  ON public.event_reminder_rules (tenant_id, event_id, enabled, offset_minutes_before, id);
CREATE INDEX event_reminder_rules_tenant_due_idx
  ON public.event_reminder_rules (tenant_id, enabled, event_id)
  WHERE enabled;

ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.communication_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_template_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.event_reminder_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_reminder_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY communication_templates_tenant_isolation
ON public.communication_templates TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY communication_template_versions_tenant_isolation
ON public.communication_template_versions TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY event_reminder_rules_tenant_isolation
ON public.event_reminder_rules TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE TRIGGER communication_templates_audit
AFTER INSERT OR UPDATE OR DELETE ON public.communication_templates
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER communication_template_versions_audit
AFTER INSERT OR UPDATE OR DELETE ON public.communication_template_versions
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER event_reminder_rules_audit
AFTER INSERT OR UPDATE OR DELETE ON public.event_reminder_rules
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');

REVOKE ALL ON public.communication_templates, public.communication_template_versions, public.event_reminder_rules FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_templates, public.communication_template_versions, public.event_reminder_rules TO igreja_runtime;
