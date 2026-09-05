SET LOCAL ROLE igreja_owner;

ALTER TABLE public.auth_sessions
  ADD COLUMN proof_hash text,
  ADD COLUMN user_agent_hash text;

-- Sessões antigas formavam uma credencial Bearer completa e não possuem a
-- segunda prova. FORCE RLS permanece ativo: a manutenção percorre cada tenant
-- conhecido e instala contexto local, sem conexão ou política de bypass.
DO $migration$
DECLARE
  current_tenant uuid;
BEGIN
  FOR current_tenant IN SELECT tenant_id FROM public.tenant_directory LOOP
    PERFORM set_config('app.tenant_id', current_tenant::text, true);
    UPDATE public.auth_sessions
    SET revoked_at = COALESCE(revoked_at, now()),
        proof_hash = repeat('0', 64),
        user_agent_hash = repeat('0', 64)
    WHERE tenant_id = current_tenant;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$migration$;

ALTER TABLE public.auth_sessions
  ALTER COLUMN proof_hash SET NOT NULL,
  ALTER COLUMN user_agent_hash SET NOT NULL,
  ADD CONSTRAINT auth_sessions_proof_hash_check CHECK (proof_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT auth_sessions_user_agent_hash_check CHECK (user_agent_hash ~ '^[0-9a-f]{64}$');
