SET LOCAL ROLE igreja_owner;

CREATE OR REPLACE FUNCTION app.normalize_br_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $$
  WITH value AS (
    SELECT trim(p_phone) AS source, regexp_replace(p_phone, '[^0-9]', '', 'g') AS digits
  )
  SELECT CASE
    WHEN source LIKE '+%' AND digits ~ '^[1-9][0-9]{7,14}$' THEN '+' || digits
    WHEN digits ~ '^55[0-9]{10,11}$' THEN '+' || digits
    WHEN digits ~ '^[0-9]{10,11}$' THEN '+55' || digits
    ELSE NULL
  END
  FROM value
$$;

REVOKE ALL ON FUNCTION app.normalize_br_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.normalize_br_phone(text) TO igreja_runtime;

ALTER TABLE public.member_profiles
  ADD COLUMN phone_normalized text,
  ADD COLUMN phone_verified_at timestamptz;

DO $migration$
DECLARE current_tenant uuid;
BEGIN
  FOR current_tenant IN SELECT tenant_id FROM public.tenant_directory LOOP
    PERFORM set_config('app.tenant_id', current_tenant::text, true);
    UPDATE public.member_profiles
    SET phone_normalized = app.normalize_br_phone(phone)
    WHERE phone IS NOT NULL;
    IF EXISTS (
      SELECT 1 FROM public.member_profiles
      WHERE phone IS NOT NULL AND phone_normalized IS NULL
    ) THEN
      RAISE EXCEPTION 'Existem telefones de membros que não podem ser normalizados na comunidade %.', current_tenant;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.member_profiles
      WHERE phone_normalized IS NOT NULL
      GROUP BY tenant_id, phone_normalized
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Existem telefones duplicados na comunidade %.', current_tenant;
    END IF;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$migration$;

ALTER TABLE public.member_profiles
  ADD CONSTRAINT member_profiles_phone_normalized_check CHECK (
    (phone IS NULL AND phone_normalized IS NULL)
    OR
    (phone IS NOT NULL AND phone_normalized IS NOT NULL
      AND phone_normalized = app.normalize_br_phone(phone))
  ),
  ADD CONSTRAINT member_profiles_phone_verified_check CHECK (
    phone_verified_at IS NULL OR phone_normalized IS NOT NULL
  );

CREATE UNIQUE INDEX member_profiles_tenant_phone_normalized_key
  ON public.member_profiles (tenant_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE OR REPLACE FUNCTION app.sync_member_profile_phone_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE normalized text;
BEGIN
  normalized := app.normalize_br_phone(NEW.phone);
  IF TG_OP = 'UPDATE'
    AND normalized IS DISTINCT FROM OLD.phone_normalized
    AND NEW.phone_verified_at IS NOT DISTINCT FROM OLD.phone_verified_at
  THEN
    NEW.phone_verified_at := NULL;
  END IF;
  NEW.phone_normalized := normalized;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app.sync_member_profile_phone_identity() FROM PUBLIC;

CREATE TRIGGER member_profiles_phone_identity
BEFORE INSERT OR UPDATE OF phone, phone_verified_at ON public.member_profiles
FOR EACH ROW EXECUTE FUNCTION app.sync_member_profile_phone_identity();

DO $migration$
DECLARE current_tenant uuid;
BEGIN
  FOR current_tenant IN SELECT tenant_id FROM public.tenant_directory LOOP
    PERFORM set_config('app.tenant_id', current_tenant::text, true);
    UPDATE public.member_profiles AS profiles
    SET phone_verified_at = completed.last_completed_at
    FROM (
      SELECT deliveries.tenant_id, deliveries.member_user_id, max(deliveries.completed_at) AS last_completed_at
      FROM public.member_onboarding_deliveries AS deliveries
      WHERE deliveries.status = 'completed' AND deliveries.completed_at IS NOT NULL
      GROUP BY deliveries.tenant_id, deliveries.member_user_id
    ) AS completed
    WHERE profiles.tenant_id = completed.tenant_id
      AND profiles.user_id = completed.member_user_id
      AND profiles.phone_normalized IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.member_onboarding_deliveries AS deliveries
        WHERE deliveries.tenant_id = profiles.tenant_id
          AND deliveries.member_user_id = profiles.user_id
          AND deliveries.status = 'completed'
          AND deliveries.completed_at IS NOT NULL
          AND app.normalize_br_phone(deliveries.phone) = profiles.phone_normalized
      );
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$migration$;

DROP FUNCTION app.resolve_login_identity(text, text);

CREATE FUNCTION app.resolve_login_identity(p_tenant_slug text, p_identifier text)
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
  LEFT JOIN public.member_profiles AS profiles
    ON profiles.user_id = users.id AND profiles.tenant_id = users.tenant_id
  LEFT JOIN public.user_roles ON user_roles.user_id = users.id AND user_roles.tenant_id = users.tenant_id
  LEFT JOIN public.roles ON roles.id = user_roles.role_id AND roles.tenant_id = user_roles.tenant_id
  LEFT JOIN public.role_permissions ON role_permissions.role_id = roles.id AND role_permissions.tenant_id = roles.tenant_id
  WHERE users.tenant_id = resolved_tenant_id
    AND (
      users.email = lower(trim(p_identifier))
      OR (
        profiles.phone_normalized = p_identifier
        AND profiles.phone_verified_at IS NOT NULL
      )
    )
  GROUP BY users.id, users.tenant_id, users.name, users.email, users.password_hash, users.temporary_password_expires_at
  LIMIT 1;
END
$$;

REVOKE ALL ON FUNCTION app.resolve_login_identity(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_login_identity(text, text) TO igreja_runtime;

COMMENT ON COLUMN public.member_profiles.phone_normalized IS
  'Telefone canônico E.164 usado para unicidade e busca; continua protegido pela RLS do perfil.';
COMMENT ON COLUMN public.member_profiles.phone_verified_at IS
  'Instante em que a posse do telefone foi confirmada por um fluxo confiável.';
