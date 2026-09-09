SET LOCAL ROLE igreja_owner;

INSERT INTO public.permissions (key, description)
VALUES ('galleries.link', 'Vincular galerias públicas a eventos')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

DO $migration$
DECLARE current_tenant uuid;
BEGIN
  FOR current_tenant IN SELECT tenant_id FROM public.tenant_directory LOOP
    PERFORM set_config('app.tenant_id', current_tenant::text, true);
    INSERT INTO public.role_permissions (tenant_id, role_id, permission_key)
    SELECT roles.tenant_id, roles.id, 'galleries.link'
    FROM public.roles
    WHERE roles.key = 'admin' AND roles.is_system
    ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$migration$;

ALTER TABLE public.events
  ADD COLUMN linked_gallery_id uuid,
  ADD CONSTRAINT events_linked_gallery_tenant_fk
    FOREIGN KEY (linked_gallery_id, tenant_id)
    REFERENCES public.event_galleries (id, tenant_id) ON DELETE SET NULL (linked_gallery_id);

CREATE INDEX events_tenant_linked_gallery_idx
  ON public.events (tenant_id, linked_gallery_id)
  WHERE linked_gallery_id IS NOT NULL;

CREATE FUNCTION app.resolve_public_event_linked_gallery(p_public_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  resolved_tenant_id uuid;
  result jsonb;
BEGIN
  SELECT directory.tenant_id INTO resolved_tenant_id
  FROM public.event_public_directory AS directory
  WHERE directory.public_id = p_public_id;

  IF resolved_tenant_id IS NULL THEN RETURN NULL; END IF;
  PERFORM set_config('app.tenant_id', resolved_tenant_id::text, true);

  SELECT jsonb_build_object(
    'id', galleries.id,
    'publicId', galleries.public_id,
    'title', galleries.title,
    'description', galleries.description,
    'photoCount', (SELECT count(*) FROM public.gallery_photos photos WHERE photos.gallery_id = galleries.id),
    'coverPhotoId', (SELECT photos.id FROM public.gallery_photos photos WHERE photos.gallery_id = galleries.id AND photos.is_cover LIMIT 1),
    'event', jsonb_build_object('title', source_events.title, 'startsAt', source_events.starts_at)
  ) INTO result
  FROM public.events AS target_events
  JOIN public.event_galleries AS galleries
    ON galleries.id = target_events.linked_gallery_id AND galleries.tenant_id = target_events.tenant_id
  JOIN public.events AS source_events
    ON source_events.id = galleries.event_id AND source_events.tenant_id = galleries.tenant_id
  WHERE target_events.public_id = p_public_id
    AND target_events.status = 'published'
    AND galleries.status = 'published'
    AND galleries.visibility = 'public'
    AND EXISTS (SELECT 1 FROM public.gallery_photos photos WHERE photos.gallery_id = galleries.id);

  RETURN result;
END
$$;

REVOKE ALL ON FUNCTION app.resolve_public_event_linked_gallery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_public_event_linked_gallery(uuid) TO igreja_runtime;
