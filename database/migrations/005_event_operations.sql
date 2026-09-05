SET LOCAL ROLE igreja_owner;

ALTER TYPE public.event_status ADD VALUE IF NOT EXISTS 'registration_closed';
ALTER TYPE public.event_status ADD VALUE IF NOT EXISTS 'completed';

INSERT INTO public.permissions (key, description) VALUES
  ('events.checkin', 'Confirmar e desfazer presença em eventos'),
  ('events.communicate', 'Preparar e enfileirar comunicações de eventos'),
  ('events.templates_manage', 'Criar e usar modelos de eventos'),
  ('sessions.manage', 'Visualizar e revogar sessões da própria conta')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

ALTER TABLE public.events
  ADD COLUMN current_form_version integer NOT NULL DEFAULT 1
  CHECK (current_form_version > 0);

CREATE TABLE public.event_form_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  schema_snapshot jsonb NOT NULL CHECK (jsonb_typeof(schema_snapshot) = 'array'),
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_form_versions_id_event_tenant_key UNIQUE (id, event_id, tenant_id),
  CONSTRAINT event_form_versions_event_version_key UNIQUE (event_id, tenant_id, version),
  CONSTRAINT event_form_versions_event_tenant_fk FOREIGN KEY (event_id, tenant_id)
    REFERENCES public.events (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT event_form_versions_creator_tenant_fk FOREIGN KEY (created_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX event_form_versions_tenant_event_idx
  ON public.event_form_versions (tenant_id, event_id, version DESC);

INSERT INTO public.event_form_versions (
  tenant_id, event_id, version, schema_snapshot, created_by_user_id, created_at
)
SELECT
  events.tenant_id,
  events.id,
  1,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', fields.id,
      'key', fields.field_key,
      'label', fields.label,
      'type', fields.type,
      'required', fields.required,
      'options', fields.options
    ) ORDER BY fields.position)
    FROM public.event_form_fields AS fields
    WHERE fields.event_id = events.id
      AND fields.tenant_id = events.tenant_id
  ), '[]'::jsonb),
  events.created_by_user_id,
  events.created_at
FROM public.events AS events;

ALTER TABLE public.event_registrations
  ADD COLUMN form_version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT event_registrations_form_version_fk
    FOREIGN KEY (event_id, tenant_id, form_version)
    REFERENCES public.event_form_versions (event_id, tenant_id, version) ON DELETE RESTRICT;

CREATE TABLE public.event_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  checked_in_by_user_id uuid NOT NULL,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_check_ins_id_event_tenant_key UNIQUE (id, event_id, tenant_id),
  CONSTRAINT event_check_ins_registration_key UNIQUE (registration_id, event_id, tenant_id),
  CONSTRAINT event_check_ins_registration_event_tenant_fk
    FOREIGN KEY (registration_id, event_id, tenant_id)
    REFERENCES public.event_registrations (id, event_id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT event_check_ins_operator_tenant_fk FOREIGN KEY (checked_in_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX event_check_ins_tenant_event_idx
  ON public.event_check_ins (tenant_id, event_id, checked_in_at DESC);

CREATE TABLE public.event_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  audience text NOT NULL CHECK (audience IN ('confirmed', 'checked_in', 'not_checked_in')),
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  subject text NOT NULL DEFAULT '' CHECK (length(subject) <= 160),
  message text NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'sent', 'failed')),
  queue_job_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  queued_at timestamptz,
  CONSTRAINT event_communications_id_event_tenant_key UNIQUE (id, event_id, tenant_id),
  CONSTRAINT event_communications_event_tenant_fk FOREIGN KEY (event_id, tenant_id)
    REFERENCES public.events (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT event_communications_creator_tenant_fk FOREIGN KEY (created_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX event_communications_tenant_event_idx
  ON public.event_communications (tenant_id, event_id, created_at DESC);

CREATE TABLE public.event_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 3 AND 120),
  description text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  media_display_mode text NOT NULL DEFAULT 'hero'
    CHECK (media_display_mode IN ('hero', 'carousel', 'fixed')),
  form_schema jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(form_schema) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_templates_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT event_templates_tenant_name_key UNIQUE (tenant_id, name),
  CONSTRAINT event_templates_creator_tenant_fk FOREIGN KEY (created_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX event_templates_tenant_name_idx ON public.event_templates (tenant_id, name);

CREATE TABLE public.auth_sessions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT auth_sessions_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT auth_sessions_user_tenant_fk FOREIGN KEY (user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT auth_sessions_expiry_check CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_tenant_user_idx
  ON public.auth_sessions (tenant_id, user_id, created_at DESC);

ALTER TABLE public.event_form_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_form_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.event_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_check_ins FORCE ROW LEVEL SECURITY;
ALTER TABLE public.event_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_communications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.event_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY event_form_versions_tenant_isolation
ON public.event_form_versions TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY event_check_ins_tenant_isolation
ON public.event_check_ins TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY event_communications_tenant_isolation
ON public.event_communications TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY event_templates_tenant_isolation
ON public.event_templates TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY auth_sessions_tenant_isolation
ON public.auth_sessions TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE TRIGGER event_form_versions_audit
AFTER INSERT OR UPDATE OR DELETE ON public.event_form_versions
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER event_check_ins_audit
AFTER INSERT OR UPDATE OR DELETE ON public.event_check_ins
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER event_communications_audit
AFTER INSERT OR UPDATE OR DELETE ON public.event_communications
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER event_templates_audit
AFTER INSERT OR UPDATE OR DELETE ON public.event_templates
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER auth_sessions_audit
AFTER INSERT OR UPDATE OR DELETE ON public.auth_sessions
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');

REVOKE ALL ON
  public.event_form_versions,
  public.event_check_ins,
  public.event_communications,
  public.event_templates,
  public.auth_sessions
FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.event_form_versions,
  public.event_check_ins,
  public.event_communications,
  public.event_templates,
  public.auth_sessions
TO igreja_runtime;
