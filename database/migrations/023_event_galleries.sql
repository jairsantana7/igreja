SET LOCAL ROLE igreja_owner;

INSERT INTO public.permissions (key, description) VALUES
  ('galleries.view', 'Visualizar galerias publicadas da própria comunidade'),
  ('galleries.read_own', 'Visualizar galerias dos próprios eventos e colaborações'),
  ('galleries.read_all', 'Visualizar todas as galerias da comunidade'),
  ('galleries.create', 'Criar galerias para eventos acessíveis'),
  ('galleries.update', 'Editar galerias e fotos acessíveis'),
  ('galleries.publish', 'Publicar, retirar do ar e arquivar galerias acessíveis'),
  ('galleries.reuse', 'Reutilizar fotos de galerias em eventos acessíveis')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

DO $migration$
DECLARE current_tenant uuid;
BEGIN
  FOR current_tenant IN SELECT tenant_id FROM public.tenant_directory LOOP
    PERFORM set_config('app.tenant_id', current_tenant::text, true);
    INSERT INTO public.role_permissions (tenant_id, role_id, permission_key)
    SELECT roles.tenant_id, roles.id, additions.permission_key
    FROM public.roles
    CROSS JOIN (VALUES
      ('galleries.view'), ('galleries.read_own'), ('galleries.read_all'),
      ('galleries.create'), ('galleries.update'), ('galleries.publish'), ('galleries.reuse')
    ) AS additions(permission_key)
    WHERE roles.key = 'admin' AND roles.is_system
    ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$migration$;

CREATE TABLE public.event_galleries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  public_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_by_user_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 160),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 3000),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'members_only')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_galleries_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT event_galleries_event_key UNIQUE (event_id, tenant_id),
  CONSTRAINT event_galleries_event_tenant_fk FOREIGN KEY (event_id, tenant_id)
    REFERENCES public.events (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT event_galleries_creator_tenant_fk FOREIGN KEY (created_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX event_galleries_tenant_status_idx
  ON public.event_galleries (tenant_id, status, updated_at DESC, id DESC);
CREATE INDEX event_galleries_tenant_creator_idx
  ON public.event_galleries (tenant_id, created_by_user_id, updated_at DESC);

CREATE TABLE public.gallery_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  gallery_id uuid NOT NULL,
  uploaded_by_user_id uuid NOT NULL,
  original_storage_key text NOT NULL UNIQUE CHECK (original_storage_key ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  display_storage_key text UNIQUE CHECK (display_storage_key IS NULL OR display_storage_key ~ '^[0-9a-f-]{36}\.webp$'),
  thumbnail_storage_key text UNIQUE CHECK (thumbnail_storage_key IS NULL OR thumbnail_storage_key ~ '^[0-9a-f-]{36}\.webp$'),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'ready', 'failed')),
  caption text NOT NULL DEFAULT '' CHECK (length(caption) <= 500),
  alt_text text NOT NULL DEFAULT '' CHECK (length(alt_text) <= 180),
  position integer NOT NULL CHECK (position >= 0),
  is_cover boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gallery_photos_id_gallery_tenant_key UNIQUE (id, gallery_id, tenant_id),
  CONSTRAINT gallery_photos_gallery_position_key UNIQUE (gallery_id, position),
  CONSTRAINT gallery_photos_gallery_tenant_fk FOREIGN KEY (gallery_id, tenant_id)
    REFERENCES public.event_galleries (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT gallery_photos_uploader_tenant_fk FOREIGN KEY (uploaded_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX gallery_photos_one_cover_idx
  ON public.gallery_photos (gallery_id) WHERE is_cover;
CREATE INDEX gallery_photos_tenant_gallery_idx
  ON public.gallery_photos (tenant_id, gallery_id, position, id);
CREATE INDEX gallery_photos_tenant_processing_idx
  ON public.gallery_photos (tenant_id, processing_status, created_at) WHERE processing_status = 'pending';

CREATE TABLE public.gallery_public_directory (
  public_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  gallery_id uuid NOT NULL,
  CONSTRAINT gallery_public_directory_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES public.tenant_directory (tenant_id) ON DELETE CASCADE,
  CONSTRAINT gallery_public_directory_gallery_tenant_fk FOREIGN KEY (gallery_id, tenant_id)
    REFERENCES public.event_galleries (id, tenant_id) ON DELETE CASCADE
);

ALTER TABLE public.event_galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_galleries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_photos FORCE ROW LEVEL SECURITY;

CREATE POLICY event_galleries_tenant_isolation
ON public.event_galleries
TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY gallery_photos_tenant_isolation
ON public.gallery_photos
TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE FUNCTION app.register_public_gallery(p_public_id uuid, p_tenant_id uuid, p_gallery_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_tenant_id IS DISTINCT FROM app.current_tenant_id() THEN
    RAISE EXCEPTION 'public gallery tenant context mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.event_galleries
    WHERE id = p_gallery_id AND tenant_id = p_tenant_id AND public_id = p_public_id
  ) THEN
    RAISE EXCEPTION 'gallery not found in tenant context';
  END IF;
  INSERT INTO public.gallery_public_directory (public_id, tenant_id, gallery_id)
  VALUES (p_public_id, p_tenant_id, p_gallery_id);
END
$$;

CREATE FUNCTION app.resolve_public_gallery(p_public_id uuid)
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
  FROM public.gallery_public_directory AS directory
  WHERE directory.public_id = p_public_id;
  IF resolved_tenant_id IS NULL THEN RETURN NULL; END IF;
  PERFORM set_config('app.tenant_id', resolved_tenant_id::text, true);

  SELECT CASE
    WHEN galleries.visibility = 'members_only' THEN jsonb_build_object('authenticationRequired', true)
    ELSE jsonb_build_object(
      'id', galleries.id,
      'publicId', galleries.public_id,
      'communityName', tenants.name,
      'title', galleries.title,
      'description', galleries.description,
      'visibility', galleries.visibility,
      'publishedAt', galleries.published_at,
      'event', jsonb_build_object('id', events.id, 'title', events.title, 'startsAt', events.starts_at, 'location', events.location),
      'photos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', photos.id,
          'caption', photos.caption,
          'altText', photos.alt_text,
          'isCover', photos.is_cover
        ) ORDER BY photos.position, photos.id)
        FROM public.gallery_photos AS photos
        WHERE photos.gallery_id = galleries.id AND photos.tenant_id = galleries.tenant_id
      ), '[]'::jsonb)
    )
  END INTO result
  FROM public.event_galleries AS galleries
  JOIN public.events AS events ON events.id = galleries.event_id AND events.tenant_id = galleries.tenant_id
  JOIN public.tenants AS tenants ON tenants.id = galleries.tenant_id
  WHERE galleries.public_id = p_public_id AND galleries.status = 'published';
  RETURN result;
END
$$;

CREATE FUNCTION app.resolve_public_gallery_photo(p_public_id uuid, p_photo_id uuid, p_variant text)
RETURNS TABLE (storage_key text, mime_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE resolved_tenant_id uuid;
BEGIN
  IF p_variant NOT IN ('display', 'thumbnail', 'original') THEN RETURN; END IF;
  SELECT directory.tenant_id INTO resolved_tenant_id
  FROM public.gallery_public_directory AS directory
  WHERE directory.public_id = p_public_id;
  IF resolved_tenant_id IS NULL THEN RETURN; END IF;
  PERFORM set_config('app.tenant_id', resolved_tenant_id::text, true);
  RETURN QUERY
  SELECT
    CASE p_variant
      WHEN 'thumbnail' THEN COALESCE(photos.thumbnail_storage_key, photos.display_storage_key, photos.original_storage_key)
      WHEN 'display' THEN COALESCE(photos.display_storage_key, photos.original_storage_key)
      ELSE photos.original_storage_key
    END,
    CASE WHEN p_variant <> 'original' AND
      ((p_variant = 'thumbnail' AND photos.thumbnail_storage_key IS NOT NULL) OR
       (p_variant = 'display' AND photos.display_storage_key IS NOT NULL))
      THEN 'image/webp' ELSE photos.mime_type END
  FROM public.gallery_photos AS photos
  JOIN public.event_galleries AS galleries
    ON galleries.id = photos.gallery_id AND galleries.tenant_id = photos.tenant_id
  WHERE galleries.public_id = p_public_id
    AND galleries.status = 'published'
    AND galleries.visibility = 'public'
    AND photos.id = p_photo_id;
END
$$;

CREATE TRIGGER event_galleries_audit AFTER INSERT OR UPDATE OR DELETE ON public.event_galleries
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER gallery_photos_audit AFTER INSERT OR UPDATE OR DELETE ON public.gallery_photos
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');

REVOKE ALL ON public.event_galleries, public.gallery_photos, public.gallery_public_directory FROM PUBLIC;
REVOKE ALL ON public.gallery_public_directory FROM igreja_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_galleries, public.gallery_photos TO igreja_runtime;

REVOKE ALL ON FUNCTION app.register_public_gallery(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_public_gallery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_public_gallery_photo(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.register_public_gallery(uuid, uuid, uuid) TO igreja_runtime;
GRANT EXECUTE ON FUNCTION app.resolve_public_gallery(uuid) TO igreja_runtime;
GRANT EXECUTE ON FUNCTION app.resolve_public_gallery_photo(uuid, uuid, text) TO igreja_runtime;
