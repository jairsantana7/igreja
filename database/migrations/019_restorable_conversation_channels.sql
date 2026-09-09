SET LOCAL ROLE igreja_owner;

CREATE OR REPLACE FUNCTION app.list_restorable_conversation_channels()
RETURNS TABLE (tenant_id uuid, channel_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  current_tenant uuid;
BEGIN
  FOR current_tenant IN
    SELECT directory.tenant_id
    FROM public.tenant_directory AS directory
    ORDER BY directory.tenant_id
  LOOP
    PERFORM pg_catalog.set_config('app.tenant_id', current_tenant::text, true);

    RETURN QUERY
    SELECT channels.tenant_id, channels.id
    FROM public.conversation_channels AS channels
    WHERE channels.tenant_id = current_tenant
      AND channels.provider_key = 'whatsapp_web'
      AND channels.status IN ('connecting', 'awaiting_qr', 'connected', 'failed')
      AND EXISTS (
        SELECT 1
        FROM public.conversation_provider_states AS states
        WHERE states.tenant_id = channels.tenant_id
          AND states.channel_id = channels.id
          AND states.provider_key = channels.provider_key
          AND states.state_key = 'baileys:creds'
      );
  END LOOP;

  PERFORM pg_catalog.set_config('app.tenant_id', '', true);
END;
$$;

ALTER FUNCTION app.list_restorable_conversation_channels() OWNER TO igreja_owner;
REVOKE ALL ON FUNCTION app.list_restorable_conversation_channels() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_restorable_conversation_channels() TO igreja_runtime;

COMMENT ON FUNCTION app.list_restorable_conversation_channels() IS
  'Retorna somente tenant e canal necessários para o worker restaurar sessões WhatsApp persistidas.';
