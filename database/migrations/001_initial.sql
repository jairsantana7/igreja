SET LOCAL ROLE igreja_owner;

CREATE SCHEMA app AUTHORIZATION igreja_owner;
REVOKE ALL ON SCHEMA app FROM PUBLIC;

CREATE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE TABLE public.tenant_directory (
  tenant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_directory_fk FOREIGN KEY (id)
    REFERENCES public.tenant_directory (tenant_id) ON DELETE RESTRICT
);

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  email text NOT NULL CHECK (email = lower(email)),
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT users_tenant_email_key UNIQUE (tenant_id, email),
  CONSTRAINT users_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id) ON DELETE RESTRICT
);
CREATE INDEX users_tenant_idx ON public.users (tenant_id);

CREATE TABLE public.permissions (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  description text NOT NULL
);

INSERT INTO public.permissions (key, description) VALUES
  ('events.read', 'Visualizar eventos internos'),
  ('events.create', 'Criar eventos e formulários'),
  ('events.update', 'Editar eventos e formulários'),
  ('events.publish', 'Publicar e cancelar eventos'),
  ('events.registrations_read', 'Visualizar inscrições e respostas'),
  ('events.register', 'Confirmar a própria inscrição'),
  ('users.read', 'Visualizar usuários e seus papéis'),
  ('users.create', 'Criar usuários da comunidade'),
  ('users.update', 'Editar usuários e atribuir papéis'),
  ('roles.read', 'Visualizar papéis e permissões'),
  ('roles.manage', 'Criar papéis e atribuir permissões');

CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_-]{1,62}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT roles_tenant_key_key UNIQUE (tenant_id, key),
  CONSTRAINT roles_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id) ON DELETE CASCADE
);
CREATE INDEX roles_tenant_idx ON public.roles (tenant_id);

CREATE TABLE public.role_permissions (
  tenant_id uuid NOT NULL,
  role_id uuid NOT NULL,
  permission_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, role_id, permission_key),
  CONSTRAINT role_permissions_role_tenant_fk FOREIGN KEY (role_id, tenant_id)
    REFERENCES public.roles (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT role_permissions_permission_fk FOREIGN KEY (permission_key)
    REFERENCES public.permissions (key) ON DELETE RESTRICT
);

CREATE TABLE public.user_roles (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, role_id),
  CONSTRAINT user_roles_user_tenant_fk FOREIGN KEY (user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT user_roles_role_tenant_fk FOREIGN KEY (role_id, tenant_id)
    REFERENCES public.roles (id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE public.external_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_accounts_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT external_accounts_provider_key UNIQUE (tenant_id, provider, provider_subject),
  CONSTRAINT external_accounts_user_tenant_fk FOREIGN KEY (user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX external_accounts_tenant_user_idx ON public.external_accounts (tenant_id, user_id);

CREATE TYPE public.event_status AS ENUM ('draft', 'published', 'cancelled');
CREATE TYPE public.form_field_type AS ENUM ('short_text', 'long_text', 'single_choice', 'checkbox');
CREATE TYPE public.registration_status AS ENUM ('confirmed', 'cancelled');

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  public_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  slug text NOT NULL CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 160),
  description text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  registration_deadline timestamptz,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status public.event_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT events_tenant_slug_key UNIQUE (tenant_id, slug),
  CONSTRAINT events_creator_tenant_fk FOREIGN KEY (created_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT events_deadline_check CHECK (registration_deadline IS NULL OR registration_deadline <= starts_at)
);
CREATE INDEX events_tenant_starts_idx ON public.events (tenant_id, starts_at);

CREATE TABLE public.event_public_directory (
  public_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_public_directory_event_tenant_fk FOREIGN KEY (event_id, tenant_id)
    REFERENCES public.events (id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE public.event_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  field_key text NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]{1,62}$'),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 2 AND 120),
  type public.form_field_type NOT NULL,
  required boolean NOT NULL DEFAULT false,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL CHECK (position >= 0),
  CONSTRAINT event_form_fields_id_event_tenant_key UNIQUE (id, event_id, tenant_id),
  CONSTRAINT event_form_fields_event_key UNIQUE (event_id, field_key),
  CONSTRAINT event_form_fields_event_tenant_fk FOREIGN KEY (event_id, tenant_id)
    REFERENCES public.events (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT event_form_fields_options_array_check CHECK (jsonb_typeof(options) = 'array'),
  CONSTRAINT event_form_fields_choice_options_check CHECK (
    type <> 'single_choice' OR jsonb_array_length(options) > 0
  )
);
CREATE INDEX event_form_fields_tenant_event_idx ON public.event_form_fields (tenant_id, event_id, position);

CREATE TABLE public.event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status public.registration_status NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_registrations_id_event_tenant_key UNIQUE (id, event_id, tenant_id),
  CONSTRAINT event_registrations_event_user_key UNIQUE (event_id, user_id),
  CONSTRAINT event_registrations_event_tenant_fk FOREIGN KEY (event_id, tenant_id)
    REFERENCES public.events (id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT event_registrations_user_tenant_fk FOREIGN KEY (user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX event_registrations_tenant_event_idx ON public.event_registrations (tenant_id, event_id);

CREATE TABLE public.registration_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  field_id uuid NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registration_answers_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT registration_answers_registration_field_key UNIQUE (registration_id, field_id),
  CONSTRAINT registration_answers_registration_event_tenant_fk
    FOREIGN KEY (registration_id, event_id, tenant_id)
    REFERENCES public.event_registrations (id, event_id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT registration_answers_field_event_tenant_fk
    FOREIGN KEY (field_id, event_id, tenant_id)
    REFERENCES public.event_form_fields (id, event_id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX registration_answers_tenant_registration_idx
  ON public.registration_answers (tenant_id, registration_id);

CREATE FUNCTION app.resolve_login_identity(p_tenant_slug text, p_email text)
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
DECLARE
  resolved_tenant_id uuid;
BEGIN
  SELECT directory.tenant_id
    INTO resolved_tenant_id
    FROM public.tenant_directory AS directory
   WHERE directory.slug = lower(trim(p_tenant_slug));

  IF resolved_tenant_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('app.tenant_id', resolved_tenant_id::text, true);

  RETURN QUERY
  SELECT
    users.id,
    users.tenant_id,
    users.name,
    users.email,
    users.password_hash,
    COALESCE(array_agg(DISTINCT roles.key) FILTER (WHERE roles.key IS NOT NULL), ARRAY[]::text[]),
    COALESCE(array_agg(DISTINCT role_permissions.permission_key) FILTER (WHERE role_permissions.permission_key IS NOT NULL), ARRAY[]::text[])
    FROM public.users AS users
    LEFT JOIN public.user_roles ON user_roles.user_id = users.id AND user_roles.tenant_id = users.tenant_id
    LEFT JOIN public.roles ON roles.id = user_roles.role_id AND roles.tenant_id = user_roles.tenant_id
    LEFT JOIN public.role_permissions ON role_permissions.role_id = roles.id AND role_permissions.tenant_id = roles.tenant_id
   WHERE users.tenant_id = resolved_tenant_id
     AND users.email = lower(trim(p_email))
   GROUP BY users.id, users.tenant_id, users.name, users.email, users.password_hash
   LIMIT 1;
END
$$;

CREATE FUNCTION app.resolve_public_event(p_public_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  resolved_tenant_id uuid;
  result jsonb;
BEGIN
  SELECT directory.tenant_id
    INTO resolved_tenant_id
    FROM public.event_public_directory AS directory
   WHERE directory.public_id = p_public_id;

  IF resolved_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('app.tenant_id', resolved_tenant_id::text, true);

  SELECT jsonb_build_object(
    'id', events.id,
    'publicId', events.public_id,
    'tenantId', events.tenant_id,
    'communityName', tenants.name,
    'title', events.title,
    'description', events.description,
    'location', events.location,
    'startsAt', events.starts_at,
    'registrationDeadline', events.registration_deadline,
    'capacity', events.capacity,
    'fields', COALESCE((
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
    ), '[]'::jsonb)
  )
    INTO result
    FROM public.events AS events
    JOIN public.tenants AS tenants ON tenants.id = events.tenant_id
   WHERE events.public_id = p_public_id
     AND events.status = 'published';

  RETURN result;
END
$$;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.external_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.event_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_form_fields FORCE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.registration_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_answers FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_self ON public.tenants TO igreja_runtime, igreja_owner
  USING (id = app.current_tenant_id())
  WITH CHECK (id = app.current_tenant_id());

CREATE POLICY users_tenant_isolation ON public.users TO igreja_runtime, igreja_owner
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY roles_tenant_isolation ON public.roles TO igreja_runtime, igreja_owner
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY role_permissions_tenant_isolation ON public.role_permissions TO igreja_runtime, igreja_owner
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY user_roles_tenant_isolation ON public.user_roles TO igreja_runtime, igreja_owner
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY external_accounts_tenant_isolation ON public.external_accounts TO igreja_runtime, igreja_owner
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY events_tenant_isolation ON public.events TO igreja_runtime, igreja_owner
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY event_form_fields_tenant_isolation ON public.event_form_fields TO igreja_runtime, igreja_owner
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY event_registrations_tenant_isolation ON public.event_registrations TO igreja_runtime, igreja_owner
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY registration_answers_tenant_isolation ON public.registration_answers TO igreja_runtime, igreja_owner
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;

GRANT USAGE ON SCHEMA app TO igreja_runtime;
GRANT SELECT ON public.tenants TO igreja_runtime;
GRANT SELECT ON public.permissions TO igreja_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.users,
  public.roles,
  public.role_permissions,
  public.user_roles,
  public.external_accounts,
  public.events,
  public.event_form_fields,
  public.event_registrations,
  public.registration_answers
TO igreja_runtime;
GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO igreja_runtime;
GRANT EXECUTE ON FUNCTION app.resolve_login_identity(text, text) TO igreja_runtime;
GRANT EXECUTE ON FUNCTION app.resolve_public_event(uuid) TO igreja_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE igreja_owner IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE igreja_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO igreja_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE igreja_owner IN SCHEMA app REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
