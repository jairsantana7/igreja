SET LOCAL ROLE igreja_owner;

INSERT INTO public.permissions (key, description) VALUES
  ('members.profile_read', 'Visualizar endereço e dados familiares do perfil complementar'),
  ('members.profile_manage', 'Editar endereço e dados familiares do perfil complementar')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

DO $migration$
DECLARE
  current_tenant uuid;
BEGIN
  FOR current_tenant IN SELECT tenant_id FROM public.tenant_directory LOOP
    PERFORM set_config('app.tenant_id', current_tenant::text, true);
    INSERT INTO public.role_permissions (tenant_id, role_id, permission_key)
    SELECT roles.tenant_id, roles.id, new_permissions.permission_key
    FROM public.roles
    CROSS JOIN (VALUES
      ('events.read_all'), ('events.manage_all'), ('events.collaborators_manage'),
      ('conversations.read'), ('conversations.read_all'), ('conversations.reply'),
      ('conversations.assign'), ('channels.manage_own'), ('channels.manage_all'),
      ('members.profile_read'), ('members.profile_manage')
    ) AS new_permissions(permission_key)
    WHERE roles.key = 'admin' AND roles.is_system
    ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$migration$;

CREATE TABLE public.member_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  postal_code text CHECK (postal_code IS NULL OR length(postal_code) <= 16),
  street text CHECK (street IS NULL OR length(street) <= 160),
  address_number text CHECK (address_number IS NULL OR length(address_number) <= 32),
  complement text CHECK (complement IS NULL OR length(complement) <= 120),
  neighborhood text CHECK (neighborhood IS NULL OR length(neighborhood) <= 120),
  city text CHECK (city IS NULL OR length(city) <= 120),
  state text CHECK (state IS NULL OR state ~ '^[A-Z]{2}$'),
  updated_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_profiles_id_user_tenant_key UNIQUE (id, user_id, tenant_id),
  CONSTRAINT member_profiles_user_tenant_key UNIQUE (user_id, tenant_id),
  CONSTRAINT member_profiles_user_tenant_fk FOREIGN KEY (user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT member_profiles_actor_tenant_fk FOREIGN KEY (updated_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX member_profiles_tenant_user_idx ON public.member_profiles (tenant_id, user_id);

CREATE TABLE public.member_children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  member_user_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  birth_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_children_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT member_children_profile_user_tenant_fk FOREIGN KEY (profile_id, member_user_id, tenant_id)
    REFERENCES public.member_profiles (id, user_id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX member_children_tenant_member_idx ON public.member_children (tenant_id, member_user_id, name);

ALTER TABLE public.member_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.member_children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_children FORCE ROW LEVEL SECURITY;

CREATE POLICY member_profiles_tenant_isolation
ON public.member_profiles TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY member_children_tenant_isolation
ON public.member_children TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE TRIGGER member_profiles_audit
AFTER INSERT OR UPDATE OR DELETE ON public.member_profiles
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('user_id');
CREATE TRIGGER member_children_audit
AFTER INSERT OR UPDATE OR DELETE ON public.member_children
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');

REVOKE ALL ON public.member_profiles, public.member_children FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_profiles, public.member_children TO igreja_runtime;
