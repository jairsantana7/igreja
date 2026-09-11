SET LOCAL ROLE igreja_owner;

INSERT INTO public.permissions (key, description)
VALUES ('events.member_portal_read', 'Consultar eventos disponíveis e as próprias inscrições')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

DO $migration$
DECLARE current_tenant uuid;
BEGIN
  FOR current_tenant IN SELECT tenant_id FROM public.tenant_directory LOOP
    PERFORM set_config('app.tenant_id', current_tenant::text, true);
    INSERT INTO public.role_permissions (tenant_id, role_id, permission_key)
    SELECT roles.tenant_id, roles.id, 'events.member_portal_read'
    FROM public.roles
    WHERE roles.key IN ('admin', 'member')
      AND roles.is_system
    ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$migration$;
