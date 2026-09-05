SET LOCAL ROLE igreja_owner;

ALTER TABLE public.events
  ADD COLUMN media_display_mode text NOT NULL DEFAULT 'hero'
  CONSTRAINT events_media_display_mode_check
    CHECK (media_display_mode IN ('hero', 'carousel', 'fixed'));

CREATE TABLE public.event_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  storage_key text NOT NULL UNIQUE CHECK (storage_key ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  alt_text text NOT NULL DEFAULT '' CHECK (length(alt_text) <= 180),
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_media_id_event_tenant_key UNIQUE (id, event_id, tenant_id),
  CONSTRAINT event_media_event_position_key UNIQUE (event_id, position),
  CONSTRAINT event_media_event_tenant_fk FOREIGN KEY (event_id, tenant_id)
    REFERENCES public.events (id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX event_media_tenant_event_idx
  ON public.event_media (tenant_id, event_id, position);

ALTER TABLE public.event_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_media FORCE ROW LEVEL SECURITY;

CREATE POLICY event_media_tenant_isolation
ON public.event_media
TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE FUNCTION app.register_public_event(
  p_public_id uuid,
  p_tenant_id uuid,
  p_event_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_tenant_id IS DISTINCT FROM app.current_tenant_id() THEN
    RAISE EXCEPTION 'public event tenant context mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.events
     WHERE id = p_event_id
       AND tenant_id = p_tenant_id
       AND public_id = p_public_id
  ) THEN
    RAISE EXCEPTION 'event not found in tenant context';
  END IF;

  INSERT INTO public.event_public_directory (public_id, tenant_id, event_id)
  VALUES (p_public_id, p_tenant_id, p_event_id);
END
$$;

CREATE OR REPLACE FUNCTION app.resolve_public_event(p_public_id uuid)
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
    'mediaDisplayMode', events.media_display_mode,
    'images', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', media.id,
        'altText', media.alt_text
      ) ORDER BY media.position)
      FROM public.event_media AS media
      WHERE media.event_id = events.id
        AND media.tenant_id = events.tenant_id
    ), '[]'::jsonb),
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

CREATE FUNCTION app.resolve_public_event_media(p_public_id uuid, p_media_id uuid)
RETURNS TABLE (storage_key text, mime_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  resolved_tenant_id uuid;
BEGIN
  SELECT directory.tenant_id
    INTO resolved_tenant_id
    FROM public.event_public_directory AS directory
   WHERE directory.public_id = p_public_id;

  IF resolved_tenant_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('app.tenant_id', resolved_tenant_id::text, true);

  RETURN QUERY
  SELECT media.storage_key, media.mime_type
    FROM public.event_media AS media
    JOIN public.events AS events
      ON events.id = media.event_id
     AND events.tenant_id = media.tenant_id
   WHERE events.public_id = p_public_id
     AND events.status = 'published'
     AND media.id = p_media_id;
END
$$;

CREATE TRIGGER event_media_audit
AFTER INSERT OR UPDATE OR DELETE ON public.event_media
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');

REVOKE ALL ON public.event_media FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_media TO igreja_runtime;

REVOKE ALL ON FUNCTION app.register_public_event(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_public_event_media(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.register_public_event(uuid, uuid, uuid) TO igreja_runtime;
GRANT EXECUTE ON FUNCTION app.resolve_public_event_media(uuid, uuid) TO igreja_runtime;
