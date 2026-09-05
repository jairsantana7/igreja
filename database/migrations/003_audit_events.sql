SET LOCAL ROLE igreja_owner;

INSERT INTO public.permissions (key, description) VALUES
  ('audit.read', 'Visualizar a trilha de auditoria da comunidade')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  actor_user_id uuid,
  actor_name text,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  resource_type text NOT NULL CHECK (resource_type ~ '^[a-z][a-z0-9_]{1,62}$'),
  resource_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_events_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT audit_events_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT audit_events_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX audit_events_tenant_created_idx
  ON public.audit_events (tenant_id, created_at DESC, id DESC);
CREATE INDEX audit_events_tenant_resource_idx
  ON public.audit_events (tenant_id, resource_type, resource_id);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_events_tenant_isolation
ON public.audit_events
TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

-- Operacoes de manutencao executadas pelo owner (migrations, seed e restore)
-- podem nao ter um tenant no contexto. O runtime nunca recebe esta politica.
CREATE POLICY audit_events_owner_operations
ON public.audit_events
TO igreja_owner
USING (true)
WITH CHECK (true);

CREATE FUNCTION app.current_actor_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.actor_user_id', true), '')::uuid
$$;

CREATE FUNCTION app.record_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  row_data jsonb;
  row_tenant_id uuid;
  row_resource_id uuid;
  current_actor_id uuid;
  current_actor_name text;
  event_action text;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  row_tenant_id := (row_data ->> 'tenant_id')::uuid;
  row_resource_id := (row_data ->> TG_ARGV[0])::uuid;

  IF app.current_tenant_id() IS NOT NULL
     AND row_tenant_id IS DISTINCT FROM app.current_tenant_id() THEN
    RAISE EXCEPTION 'audit tenant context mismatch';
  END IF;

  current_actor_id := app.current_actor_user_id();
  IF current_actor_id IS NOT NULL THEN
    SELECT users.name INTO current_actor_name
      FROM public.users AS users
     WHERE users.id = current_actor_id
       AND users.tenant_id = row_tenant_id;
  END IF;

  event_action := CASE TG_OP
    WHEN 'INSERT' THEN 'created'
    WHEN 'UPDATE' THEN 'updated'
    WHEN 'DELETE' THEN 'deleted'
  END;

  INSERT INTO public.audit_events (
    tenant_id, actor_user_id, actor_name, action, resource_type, resource_id, metadata
  ) VALUES (
    row_tenant_id,
    current_actor_id,
    current_actor_name,
    event_action,
    TG_TABLE_NAME,
    row_resource_id,
    jsonb_build_object('source', 'database_trigger')
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

CREATE TRIGGER users_audit AFTER INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER roles_audit AFTER INSERT OR UPDATE OR DELETE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER role_permissions_audit AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('role_id');
CREATE TRIGGER user_roles_audit AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('user_id');
CREATE TRIGGER events_audit AFTER INSERT OR UPDATE OR DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER event_form_fields_audit AFTER INSERT OR UPDATE OR DELETE ON public.event_form_fields
  FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('event_id');
CREATE TRIGGER event_registrations_audit AFTER INSERT OR UPDATE OR DELETE ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER registration_answers_audit AFTER INSERT OR UPDATE OR DELETE ON public.registration_answers
  FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('registration_id');
CREATE TRIGGER community_integrations_audit AFTER INSERT OR UPDATE OR DELETE ON public.community_integrations
  FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');

REVOKE ALL ON public.audit_events FROM PUBLIC;
REVOKE ALL ON public.audit_events FROM igreja_runtime;
GRANT SELECT ON public.audit_events TO igreja_runtime;
REVOKE ALL ON FUNCTION app.current_actor_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_audit_event() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_actor_user_id() TO igreja_runtime;
