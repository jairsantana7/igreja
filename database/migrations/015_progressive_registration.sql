SET LOCAL ROLE igreja_owner;

ALTER TABLE public.member_profiles
  ADD COLUMN phone text CHECK (phone IS NULL OR length(trim(phone)) BETWEEN 8 AND 32),
  ADD COLUMN spouse_name text CHECK (spouse_name IS NULL OR length(trim(spouse_name)) BETWEEN 2 AND 120),
  ADD COLUMN marriage_date date;

ALTER TABLE public.events
  ADD COLUMN family_registration_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.event_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  offering_key text NOT NULL CHECK (offering_key ~ '^[a-z][a-z0-9_]{1,62}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents BETWEEN 0 AND 100000000),
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_offerings_id_event_tenant_key UNIQUE (id, event_id, tenant_id),
  CONSTRAINT event_offerings_event_key UNIQUE (event_id, offering_key),
  CONSTRAINT event_offerings_event_tenant_fk FOREIGN KEY (event_id, tenant_id)
    REFERENCES public.events (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX event_offerings_tenant_event_idx
  ON public.event_offerings (tenant_id, event_id, active, position, id);
CREATE UNIQUE INDEX event_offerings_event_active_position_key
  ON public.event_offerings (event_id, position) WHERE active;

CREATE TABLE public.event_registration_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('registrant', 'spouse', 'child')),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  birth_date date,
  position integer NOT NULL CHECK (position >= 0),
  checked_in_by_user_id uuid,
  checked_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_registration_participants_id_event_tenant_key UNIQUE (id, event_id, tenant_id),
  CONSTRAINT event_registration_participants_registration_position_key UNIQUE (registration_id, position),
  CONSTRAINT event_registration_participants_registration_event_tenant_fk
    FOREIGN KEY (registration_id, event_id, tenant_id)
    REFERENCES public.event_registrations (id, event_id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT event_registration_participants_operator_tenant_fk FOREIGN KEY (checked_in_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT event_registration_participants_check_in_pair_check CHECK (
    (checked_in_by_user_id IS NULL AND checked_in_at IS NULL)
    OR (checked_in_by_user_id IS NOT NULL AND checked_in_at IS NOT NULL)
  )
);
CREATE INDEX event_registration_participants_tenant_event_idx
  ON public.event_registration_participants (tenant_id, event_id, registration_id, position, id);
CREATE INDEX event_registration_participants_tenant_attendance_idx
  ON public.event_registration_participants (tenant_id, event_id, checked_in_at, id)
  WHERE checked_in_at IS NOT NULL;

CREATE TABLE public.registration_offering_selections (
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  offering_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, registration_id, offering_id),
  CONSTRAINT registration_offering_selections_registration_event_tenant_fk
    FOREIGN KEY (registration_id, event_id, tenant_id)
    REFERENCES public.event_registrations (id, event_id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT registration_offering_selections_offering_event_tenant_fk
    FOREIGN KEY (offering_id, event_id, tenant_id)
    REFERENCES public.event_offerings (id, event_id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX registration_offering_selections_tenant_event_idx
  ON public.registration_offering_selections (tenant_id, event_id, offering_id, registration_id);

INSERT INTO public.event_registration_participants (
  tenant_id, event_id, registration_id, source_type, name, position,
  checked_in_by_user_id, checked_in_at, created_at, updated_at
)
SELECT
  registrations.tenant_id,
  registrations.event_id,
  registrations.id,
  'registrant',
  users.name,
  0,
  check_ins.checked_in_by_user_id,
  check_ins.checked_in_at,
  registrations.created_at,
  registrations.updated_at
FROM public.event_registrations AS registrations
JOIN public.users AS users
  ON users.id = registrations.user_id
 AND users.tenant_id = registrations.tenant_id
LEFT JOIN public.event_check_ins AS check_ins
  ON check_ins.registration_id = registrations.id
 AND check_ins.event_id = registrations.event_id
 AND check_ins.tenant_id = registrations.tenant_id;

ALTER TABLE public.event_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_offerings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.event_registration_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registration_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.registration_offering_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_offering_selections FORCE ROW LEVEL SECURITY;

CREATE POLICY event_offerings_tenant_isolation
ON public.event_offerings TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY event_registration_participants_tenant_isolation
ON public.event_registration_participants TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY registration_offering_selections_tenant_isolation
ON public.registration_offering_selections TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE TRIGGER event_offerings_audit
AFTER INSERT OR UPDATE OR DELETE ON public.event_offerings
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER event_registration_participants_audit
AFTER INSERT OR UPDATE OR DELETE ON public.event_registration_participants
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER registration_offering_selections_audit
AFTER INSERT OR UPDATE OR DELETE ON public.registration_offering_selections
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('registration_id');

REVOKE ALL ON public.event_offerings, public.event_registration_participants,
  public.registration_offering_selections FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_offerings,
  public.event_registration_participants, public.registration_offering_selections TO igreja_runtime;

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
