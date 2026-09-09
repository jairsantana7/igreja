SET LOCAL ROLE igreja_owner;

INSERT INTO public.permissions (key, description) VALUES
  ('members.credentials_manage', 'Administrar a entrega de acesso temporário dos membros')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

DO $migration$
DECLARE current_tenant uuid;
BEGIN
  FOR current_tenant IN SELECT tenant_id FROM public.tenant_directory LOOP
    PERFORM set_config('app.tenant_id', current_tenant::text, true);
    INSERT INTO public.role_permissions (tenant_id, role_id, permission_key)
    SELECT roles.tenant_id, roles.id, 'members.credentials_manage'
    FROM public.roles
    WHERE roles.key = 'admin' AND roles.is_system
    ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$migration$;

ALTER TABLE public.users
  ADD COLUMN temporary_password_expires_at timestamptz;

CREATE OR REPLACE FUNCTION app.resolve_login_identity(p_tenant_slug text, p_email text)
RETURNS TABLE (
  user_id uuid,
  tenant_id uuid,
  user_name text,
  user_email text,
  password_hash text,
  role_keys text[],
  permission_keys text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE resolved_tenant_id uuid;
BEGIN
  SELECT directory.tenant_id INTO resolved_tenant_id
  FROM public.tenant_directory AS directory
  WHERE directory.slug = lower(trim(p_tenant_slug));
  IF resolved_tenant_id IS NULL THEN RETURN; END IF;
  PERFORM set_config('app.tenant_id', resolved_tenant_id::text, true);

  RETURN QUERY
  SELECT users.id, users.tenant_id, users.name, users.email,
    CASE
      WHEN users.temporary_password_expires_at IS NOT NULL
        AND users.temporary_password_expires_at <= now() THEN NULL
      ELSE users.password_hash
    END,
    COALESCE(array_agg(DISTINCT roles.key) FILTER (WHERE roles.key IS NOT NULL), ARRAY[]::text[]),
    COALESCE(array_agg(DISTINCT role_permissions.permission_key) FILTER (WHERE role_permissions.permission_key IS NOT NULL), ARRAY[]::text[])
  FROM public.users AS users
  LEFT JOIN public.user_roles ON user_roles.user_id = users.id AND user_roles.tenant_id = users.tenant_id
  LEFT JOIN public.roles ON roles.id = user_roles.role_id AND roles.tenant_id = user_roles.tenant_id
  LEFT JOIN public.role_permissions ON role_permissions.role_id = roles.id AND role_permissions.tenant_id = roles.tenant_id
  WHERE users.tenant_id = resolved_tenant_id AND users.email = lower(trim(p_email))
  GROUP BY users.id, users.tenant_id, users.name, users.email, users.password_hash, users.temporary_password_expires_at
  LIMIT 1;
END
$$;

CREATE TABLE public.member_onboarding_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  member_user_id uuid NOT NULL,
  phone text NOT NULL CHECK (length(trim(phone)) BETWEEN 8 AND 32),
  token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  encrypted_payload bytea,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'revealed', 'delivered', 'completed', 'revoked')),
  expires_at timestamptz NOT NULL,
  revealed_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_onboarding_deliveries_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT member_onboarding_deliveries_token_key UNIQUE (token_hash),
  CONSTRAINT member_onboarding_deliveries_member_tenant_fk
    FOREIGN KEY (member_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT member_onboarding_deliveries_creator_tenant_fk
    FOREIGN KEY (created_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT member_onboarding_deliveries_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT member_onboarding_deliveries_payload_check CHECK (
    (status IN ('completed', 'revoked') AND encrypted_payload IS NULL)
    OR (status IN ('pending', 'revealed', 'delivered') AND encrypted_payload IS NOT NULL)
  )
);

CREATE INDEX member_onboarding_deliveries_tenant_queue_idx
  ON public.member_onboarding_deliveries (tenant_id, status, created_at DESC, id DESC);
CREATE INDEX member_onboarding_deliveries_tenant_member_idx
  ON public.member_onboarding_deliveries (tenant_id, member_user_id, created_at DESC);

CREATE TABLE public.member_onboarding_directory (
  delivery_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  CONSTRAINT member_onboarding_directory_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES public.tenant_directory (tenant_id) ON DELETE CASCADE
);

CREATE FUNCTION app.sync_member_onboarding_directory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.member_onboarding_directory WHERE delivery_id = OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO public.member_onboarding_directory (delivery_id, tenant_id)
  VALUES (NEW.id, NEW.tenant_id)
  ON CONFLICT (delivery_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id;
  RETURN NEW;
END
$$;

CREATE TRIGGER member_onboarding_directory_sync
AFTER INSERT OR DELETE ON public.member_onboarding_deliveries
FOR EACH ROW EXECUTE FUNCTION app.sync_member_onboarding_directory();

ALTER TABLE public.member_onboarding_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_onboarding_deliveries FORCE ROW LEVEL SECURITY;

CREATE POLICY member_onboarding_deliveries_tenant_isolation
ON public.member_onboarding_deliveries TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE FUNCTION app.resolve_member_onboarding_tenant(p_delivery_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE resolved_tenant_id uuid;
BEGIN
  SELECT directory.tenant_id INTO resolved_tenant_id
  FROM public.member_onboarding_directory AS directory
  WHERE directory.delivery_id = p_delivery_id;
  IF resolved_tenant_id IS NULL THEN RETURN NULL; END IF;

  PERFORM set_config('app.tenant_id', resolved_tenant_id::text, true);
  IF NOT EXISTS (
    SELECT 1 FROM public.member_onboarding_deliveries AS deliveries
    WHERE deliveries.id = p_delivery_id
      AND deliveries.status IN ('pending', 'revealed', 'delivered')
      AND deliveries.expires_at > now()
  ) THEN RETURN NULL; END IF;
  RETURN resolved_tenant_id;
END
$$;

CREATE TRIGGER member_onboarding_deliveries_audit
AFTER INSERT OR UPDATE OR DELETE ON public.member_onboarding_deliveries
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');

REVOKE ALL ON public.member_onboarding_deliveries, public.member_onboarding_directory FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_onboarding_deliveries TO igreja_runtime;
REVOKE ALL ON public.member_onboarding_directory FROM igreja_runtime;
REVOKE ALL ON FUNCTION app.sync_member_onboarding_directory() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_member_onboarding_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_member_onboarding_tenant(uuid) TO igreja_runtime;
