SET LOCAL ROLE igreja_owner;

ALTER TABLE public.events
  ADD COLUMN hero_shade_color text NOT NULL DEFAULT '#173D32'
  CONSTRAINT events_hero_shade_color_check
    CHECK (hero_shade_color ~ '^#[0-9A-F]{6}$');

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
    'heroShadeColor', events.hero_shade_color,
    'familyRegistrationEnabled', events.family_registration_enabled,
    'images', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', media.id,
        'altText', media.alt_text
      ) ORDER BY media.position)
      FROM public.event_media AS media
      WHERE media.event_id = events.id
        AND media.tenant_id = events.tenant_id
    ), '[]'::jsonb),
    'offerings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', offerings.id,
        'key', offerings.offering_key,
        'name', offerings.name,
        'description', offerings.description,
        'priceCents', offerings.price_cents
      ) ORDER BY offerings.position)
      FROM public.event_offerings AS offerings
      WHERE offerings.event_id = events.id
        AND offerings.tenant_id = events.tenant_id
        AND offerings.active
    ), '[]'::jsonb),
    'pix', (
      SELECT CASE WHEN integrations.enabled THEN jsonb_build_object(
        'keyType', integrations.configuration ->> 'keyType',
        'key', integrations.configuration ->> 'key',
        'recipientName', integrations.configuration ->> 'recipientName',
        'city', integrations.configuration ->> 'city'
      ) ELSE NULL END
      FROM public.community_integrations AS integrations
      WHERE integrations.tenant_id = events.tenant_id
        AND integrations.category = 'payment'
        AND integrations.provider_key = 'pix_manual'
      LIMIT 1
    ),
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

REVOKE ALL ON FUNCTION app.resolve_public_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_public_event(uuid) TO igreja_runtime;
