SET LOCAL ROLE igreja_owner;

CREATE OR REPLACE FUNCTION app.record_audit_event()
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
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'database_trigger',
      'eventId', CASE WHEN TG_TABLE_NAME = 'events' THEN row_resource_id::text ELSE row_data ->> 'event_id' END
    ))
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

REVOKE ALL ON FUNCTION app.record_audit_event() FROM PUBLIC;
