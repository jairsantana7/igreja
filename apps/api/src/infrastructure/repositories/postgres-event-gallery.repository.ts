import type { PoolClient } from 'pg';
import type {
  EventGalleryRepository,
  GalleryDetailView,
  GalleryEventView,
  GalleryMediaSource,
  GalleryMediaVariant,
  GalleryPhotoView,
  GalleryProcessingSource,
  GalleryRemovedPhoto,
  GalleryStoredPhotoInput,
  GallerySummaryView,
  PublicGalleryResolution,
  SharedGalleryView,
} from '../../application/ports/event-gallery.port';
import type { StoredMedia } from '../../application/ports/media-storage.port';
import { ConflictError } from '../../application/use-cases/errors';
import { ensureGalleryCanBePublished, type GalleryDetails, type GalleryPhotoDetails, type GalleryStatus } from '../../domain/entities/event-gallery';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { PostgresDatabase } from '../database/postgres.database';

interface GalleryRow {
  id: string; public_id: string; title: string; description: string;
  visibility: GallerySummaryView['visibility']; status: GalleryStatus;
  published_at: Date | null; updated_at: Date; photo_count: string;
  cover_photo_id: string | null; event_id: string; event_title: string;
  starts_at: Date; location: string; owner_id: string; owner_name: string;
}

interface PhotoRow {
  id: string; caption: string; alt_text: string; position: number; is_cover: boolean;
  processing_status: GalleryPhotoView['processingStatus']; created_at: Date;
}

interface MediaRow { storage_key: string; mime_type: StoredMedia['mimeType'] }

export class PostgresEventGalleryRepository implements EventGalleryRepository {
  constructor(private readonly database: PostgresDatabase) {}

  list(principal: AuthenticatedPrincipal): Promise<GallerySummaryView[]> {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query<GalleryRow>(`${this.gallerySelect()}
        WHERE ($1::boolean OR events.created_by_user_id = $2 OR EXISTS (
          SELECT 1 FROM event_collaborators collaborators
          WHERE collaborators.event_id = events.id AND collaborators.user_id = $2
        ))
        GROUP BY galleries.id, events.id, owners.id
        ORDER BY galleries.updated_at DESC, galleries.id DESC`, [this.readAll(principal), principal.userId]);
      return result.rows.map((row) => this.mapSummary(row));
    });
  }

  eligibleEvents(principal: AuthenticatedPrincipal): Promise<GalleryEventView[]> {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query<{ id: string; title: string; starts_at: Date; location: string; owner_id: string; owner_name: string }>(`
        SELECT events.id, events.title, events.starts_at, events.location,
          owners.id AS owner_id, owners.name AS owner_name
        FROM events
        JOIN users owners ON owners.id = events.created_by_user_id AND owners.tenant_id = events.tenant_id
        LEFT JOIN event_galleries galleries ON galleries.event_id = events.id AND galleries.tenant_id = events.tenant_id
        WHERE events.status = 'completed' AND galleries.id IS NULL
          AND ($1::boolean OR events.created_by_user_id = $2 OR EXISTS (
            SELECT 1 FROM event_collaborators collaborators
            WHERE collaborators.event_id = events.id AND collaborators.user_id = $2
          ))
        ORDER BY events.starts_at DESC, events.id`, [this.readAll(principal), principal.userId]);
      return result.rows.map((row) => ({ id: row.id, title: row.title, startsAt: row.starts_at.toISOString(), location: row.location, owner: { id: row.owner_id, name: row.owner_name } }));
    });
  }

  create(principal: AuthenticatedPrincipal, eventId: string, details: GalleryDetails): Promise<GalleryDetailView | null> {
    return this.database.withTenant(principal, async (client) => {
      const event = await this.lockAccessibleEvent(client, principal, eventId, true);
      if (!event) return null;
      try {
        const inserted = await client.query<{ id: string; public_id: string }>(`
          INSERT INTO event_galleries (tenant_id, event_id, created_by_user_id, title, description, visibility)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, public_id`, [principal.tenantId, eventId, principal.userId, details.props.title, details.props.description, details.props.visibility]);
        const gallery = inserted.rows[0]!;
        await client.query('SELECT app.register_public_gallery($1, $2, $3)', [gallery.public_id, principal.tenantId, gallery.id]);
        return this.queryDetail(client, principal, gallery.id);
      } catch (error: any) {
        if (error?.code === '23505') throw new ConflictError('Este evento já possui uma galeria.');
        throw error;
      }
    });
  }

  detail(principal: AuthenticatedPrincipal, galleryId: string): Promise<GalleryDetailView | null> {
    return this.database.withTenant(principal, (client) => this.queryDetail(client, principal, galleryId));
  }

  update(principal: AuthenticatedPrincipal, galleryId: string, details: GalleryDetails): Promise<GalleryDetailView | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await this.lockAccessibleGallery(client, principal, galleryId))) return null;
      await client.query(`UPDATE event_galleries SET title = $2, description = $3, visibility = $4, updated_at = now() WHERE id = $1`,
        [galleryId, details.props.title, details.props.description, details.props.visibility]);
      return this.queryDetail(client, principal, galleryId);
    });
  }

  setStatus(principal: AuthenticatedPrincipal, galleryId: string, status: GalleryStatus): Promise<GalleryDetailView | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await this.lockAccessibleGallery(client, principal, galleryId))) return null;
      if (status === 'published') {
        const photos = await client.query<{ alt_text: string }>('SELECT alt_text FROM gallery_photos WHERE gallery_id = $1 ORDER BY position FOR UPDATE', [galleryId]);
        ensureGalleryCanBePublished(photos.rows.map((photo) => ({ altText: photo.alt_text })));
      }
      await client.query(`UPDATE event_galleries SET status = $2,
        published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, now()) ELSE published_at END,
        updated_at = now() WHERE id = $1`, [galleryId, status]);
      return this.queryDetail(client, principal, galleryId);
    });
  }

  addPhotos(principal: AuthenticatedPrincipal, galleryId: string, photos: GalleryStoredPhotoInput[]): Promise<GalleryPhotoView[] | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await this.lockAccessibleGallery(client, principal, galleryId))) return null;
      const count = await client.query<{ total: string; next_position: number; has_cover: boolean }>(`
        SELECT count(*)::text AS total, COALESCE(max(position) + 1, 0)::integer AS next_position,
          COALESCE(bool_or(is_cover), false) AS has_cover FROM gallery_photos WHERE gallery_id = $1`, [galleryId]);
      if (Number(count.rows[0]!.total) + photos.length > 200) throw new ConflictError('Uma galeria pode ter no máximo 200 fotos.');
      const inserted: GalleryPhotoView[] = [];
      for (const [index, photo] of photos.entries()) {
        const result = await client.query<PhotoRow>(`
          INSERT INTO gallery_photos (tenant_id, gallery_id, uploaded_by_user_id, original_storage_key, mime_type, caption, alt_text, position, is_cover)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id, caption, alt_text, position, is_cover, processing_status, created_at`, [
          principal.tenantId, galleryId, principal.userId, photo.storageKey, photo.mimeType, photo.caption, photo.altText,
          count.rows[0]!.next_position + index, !count.rows[0]!.has_cover && index === 0,
        ]);
        inserted.push(this.mapPhoto(result.rows[0]!));
      }
      await client.query('UPDATE event_galleries SET updated_at = now() WHERE id = $1', [galleryId]);
      return inserted;
    });
  }

  updatePhoto(principal: AuthenticatedPrincipal, galleryId: string, photoId: string, details: GalleryPhotoDetails, isCover?: boolean): Promise<GalleryPhotoView | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await this.lockAccessibleGallery(client, principal, galleryId))) return null;
      const target = await client.query('SELECT id FROM gallery_photos WHERE gallery_id = $1 AND id = $2 FOR UPDATE', [galleryId, photoId]);
      if (!target.rows[0]) return null;
      if (isCover === true) await client.query('UPDATE gallery_photos SET is_cover = false, updated_at = now() WHERE gallery_id = $1 AND is_cover', [galleryId]);
      const result = await client.query<PhotoRow>(`
        UPDATE gallery_photos SET caption = COALESCE($3, caption), alt_text = COALESCE($4, alt_text),
          is_cover = CASE WHEN $5::boolean IS NULL THEN is_cover ELSE $5 END, updated_at = now()
        WHERE gallery_id = $1 AND id = $2
        RETURNING id, caption, alt_text, position, is_cover, processing_status, created_at`,
      [galleryId, photoId, details.props.caption, details.props.altText, isCover ?? null]);
      await client.query('UPDATE event_galleries SET updated_at = now() WHERE id = $1 AND EXISTS (SELECT 1 FROM gallery_photos WHERE id = $2)', [galleryId, photoId]);
      return this.mapPhoto(result.rows[0]!);
    });
  }

  reorderPhotos(principal: AuthenticatedPrincipal, galleryId: string, photoIds: string[]): Promise<GalleryPhotoView[] | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await this.lockAccessibleGallery(client, principal, galleryId))) return null;
      const current = await client.query<{ id: string }>('SELECT id FROM gallery_photos WHERE gallery_id = $1 ORDER BY position FOR UPDATE', [galleryId]);
      if (current.rowCount !== photoIds.length || current.rows.some((row) => !photoIds.includes(row.id))) return null;
      await client.query('UPDATE gallery_photos SET position = position + 1000 WHERE gallery_id = $1', [galleryId]);
      for (const [position, id] of photoIds.entries()) await client.query('UPDATE gallery_photos SET position = $3, updated_at = now() WHERE gallery_id = $1 AND id = $2', [galleryId, id, position]);
      return this.queryPhotos(client, galleryId);
    });
  }

  removePhoto(principal: AuthenticatedPrincipal, galleryId: string, photoId: string): Promise<GalleryRemovedPhoto | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await this.lockAccessibleGallery(client, principal, galleryId))) return null;
      const removed = await client.query<{ original_storage_key: string; display_storage_key: string | null; thumbnail_storage_key: string | null; is_cover: boolean }>(`
        DELETE FROM gallery_photos WHERE gallery_id = $1 AND id = $2
        RETURNING original_storage_key, display_storage_key, thumbnail_storage_key, is_cover`, [galleryId, photoId]);
      const photo = removed.rows[0];
      if (!photo) return null;
      const remaining = await client.query<{ id: string }>('SELECT id FROM gallery_photos WHERE gallery_id = $1 ORDER BY position, id FOR UPDATE', [galleryId]);
      await client.query('UPDATE gallery_photos SET position = position + 1000 WHERE gallery_id = $1', [galleryId]);
      for (const [position, item] of remaining.rows.entries()) await client.query('UPDATE gallery_photos SET position = $3 WHERE gallery_id = $1 AND id = $2', [galleryId, item.id, position]);
      if (photo.is_cover && remaining.rows[0]) await client.query('UPDATE gallery_photos SET is_cover = true WHERE id = $1', [remaining.rows[0].id]);
      await client.query('UPDATE event_galleries SET updated_at = now() WHERE id = $1', [galleryId]);
      return { storageKeys: [photo.original_storage_key, photo.display_storage_key, photo.thumbnail_storage_key].filter((key): key is string => Boolean(key)) };
    });
  }

  resolveMedia(principal: AuthenticatedPrincipal, galleryId: string, photoId: string, variant: GalleryMediaVariant): Promise<GalleryMediaSource | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await this.canAccessGallery(client, principal, galleryId))) return null;
      const result = await client.query<MediaRow>(this.mediaSelect('photos', variant) + ' WHERE photos.gallery_id = $1 AND photos.id = $2', [galleryId, photoId]);
      return this.mapMedia(result.rows[0]);
    });
  }

  resolveShared(principal: AuthenticatedPrincipal, publicId: string): Promise<SharedGalleryView | null> {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query<{ gallery: SharedGalleryView | null }>(`
        SELECT jsonb_build_object(
          'id', galleries.id, 'publicId', galleries.public_id, 'communityName', tenants.name,
          'title', galleries.title, 'description', galleries.description, 'visibility', galleries.visibility,
          'publishedAt', galleries.published_at,
          'event', jsonb_build_object('id', events.id, 'title', events.title, 'startsAt', events.starts_at, 'location', events.location),
          'photos', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', photos.id, 'caption', photos.caption, 'altText', photos.alt_text, 'isCover', photos.is_cover) ORDER BY photos.position, photos.id) FROM gallery_photos photos WHERE photos.gallery_id = galleries.id), '[]'::jsonb)
        ) AS gallery
        FROM event_galleries galleries
        JOIN events ON events.id = galleries.event_id AND events.tenant_id = galleries.tenant_id
        JOIN tenants ON tenants.id = galleries.tenant_id
        WHERE galleries.public_id = $1 AND galleries.status = 'published'`, [publicId]);
      return result.rows[0]?.gallery ?? null;
    });
  }

  resolveSharedMedia(principal: AuthenticatedPrincipal, publicId: string, photoId: string, variant: GalleryMediaVariant): Promise<GalleryMediaSource | null> {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query<MediaRow>(`${this.mediaSelect('photos', variant)}
        JOIN event_galleries galleries ON galleries.id = photos.gallery_id AND galleries.tenant_id = photos.tenant_id
        WHERE galleries.public_id = $1 AND galleries.status = 'published' AND photos.id = $2`, [publicId, photoId]);
      return this.mapMedia(result.rows[0]);
    });
  }

  async resolvePublic(publicId: string): Promise<PublicGalleryResolution | null> {
    const result = await this.database.queryPublic<{ gallery: SharedGalleryView | { authenticationRequired: true } | null }>('SELECT app.resolve_public_gallery($1::uuid) AS gallery', [publicId]);
    const value = result.rows[0]?.gallery;
    if (!value) return null;
    return 'authenticationRequired' in value ? { authenticationRequired: true } : { gallery: value };
  }

  async resolvePublicMedia(publicId: string, photoId: string, variant: GalleryMediaVariant): Promise<GalleryMediaSource | null> {
    const result = await this.database.queryPublic<MediaRow>('SELECT storage_key, mime_type FROM app.resolve_public_gallery_photo($1::uuid, $2::uuid, $3)', [publicId, photoId, variant]);
    return this.mapMedia(result.rows[0]);
  }

  processingSource(tenantId: string, galleryId: string, photoId: string): Promise<GalleryProcessingSource | null> {
    return this.database.withTenant(tenantId, async (client) => {
      const result = await client.query<{ storage_key: string }>(`SELECT original_storage_key AS storage_key FROM gallery_photos WHERE gallery_id = $1 AND id = $2 AND processing_status = 'pending' FOR UPDATE`, [galleryId, photoId]);
      return result.rows[0] ? { storageKey: result.rows[0].storage_key } : null;
    });
  }

  completeProcessing(tenantId: string, galleryId: string, photoId: string, display: StoredMedia, thumbnail: StoredMedia): Promise<boolean> {
    return this.database.withTenant(tenantId, async (client) => {
      const result = await client.query(`UPDATE gallery_photos SET display_storage_key = $3, thumbnail_storage_key = $4, processing_status = 'ready', updated_at = now() WHERE gallery_id = $1 AND id = $2 AND processing_status = 'pending'`, [galleryId, photoId, display.storageKey, thumbnail.storageKey]);
      return result.rowCount === 1;
    });
  }

  failProcessing(tenantId: string, galleryId: string, photoId: string): Promise<void> {
    return this.database.withTenant(tenantId, async (client) => { await client.query(`UPDATE gallery_photos SET processing_status = 'failed', updated_at = now() WHERE gallery_id = $1 AND id = $2 AND processing_status = 'pending'`, [galleryId, photoId]); });
  }

  private gallerySelect(): string {
    return `SELECT galleries.id, galleries.public_id, galleries.title, galleries.description, galleries.visibility,
      galleries.status, galleries.published_at, galleries.updated_at, events.id AS event_id, events.title AS event_title,
      events.starts_at, events.location, owners.id AS owner_id, owners.name AS owner_name,
      count(photos.id)::text AS photo_count,
      max(photos.id::text) FILTER (WHERE photos.is_cover)::uuid AS cover_photo_id
      FROM event_galleries galleries
      JOIN events ON events.id = galleries.event_id AND events.tenant_id = galleries.tenant_id
      JOIN users owners ON owners.id = events.created_by_user_id AND owners.tenant_id = events.tenant_id
      LEFT JOIN gallery_photos photos ON photos.gallery_id = galleries.id AND photos.tenant_id = galleries.tenant_id`;
  }

  private async queryDetail(client: PoolClient, principal: AuthenticatedPrincipal, galleryId: string): Promise<GalleryDetailView | null> {
    const result = await client.query<GalleryRow>(`${this.gallerySelect()}
      WHERE galleries.id = $1 AND ($2::boolean OR events.created_by_user_id = $3 OR EXISTS (
        SELECT 1 FROM event_collaborators collaborators WHERE collaborators.event_id = events.id AND collaborators.user_id = $3
      )) GROUP BY galleries.id, events.id, owners.id`, [galleryId, this.readAll(principal), principal.userId]);
    return result.rows[0] ? { ...this.mapSummary(result.rows[0]), photos: await this.queryPhotos(client, galleryId) } : null;
  }

  private async queryPhotos(client: PoolClient, galleryId: string): Promise<GalleryPhotoView[]> {
    const result = await client.query<PhotoRow>('SELECT id, caption, alt_text, position, is_cover, processing_status, created_at FROM gallery_photos WHERE gallery_id = $1 ORDER BY position, id', [galleryId]);
    return result.rows.map((row) => this.mapPhoto(row));
  }

  private async lockAccessibleEvent(client: PoolClient, principal: AuthenticatedPrincipal, eventId: string, completed: boolean): Promise<boolean> {
    const result = await client.query(`SELECT id FROM events WHERE id = $1 AND ($2::boolean OR status = 'completed')
      AND ($3::boolean OR created_by_user_id = $4 OR EXISTS (SELECT 1 FROM event_collaborators WHERE event_id = events.id AND user_id = $4)) FOR UPDATE`,
    [eventId, !completed, this.readAll(principal), principal.userId]);
    return Boolean(result.rows[0]);
  }

  private async lockAccessibleGallery(client: PoolClient, principal: AuthenticatedPrincipal, galleryId: string): Promise<boolean> {
    const result = await client.query(`SELECT galleries.id FROM event_galleries galleries JOIN events ON events.id = galleries.event_id AND events.tenant_id = galleries.tenant_id
      WHERE galleries.id = $1 AND ($2::boolean OR events.created_by_user_id = $3 OR EXISTS (SELECT 1 FROM event_collaborators WHERE event_id = events.id AND user_id = $3)) FOR UPDATE OF galleries`,
    [galleryId, this.readAll(principal), principal.userId]);
    return Boolean(result.rows[0]);
  }

  private canAccessGallery(client: PoolClient, principal: AuthenticatedPrincipal, galleryId: string): Promise<boolean> {
    return this.lockAccessibleGallery(client, principal, galleryId);
  }

  private readAll(principal: AuthenticatedPrincipal): boolean { return principal.permissions.includes('galleries.read_all'); }

  private mediaSelect(alias: string, variant: GalleryMediaVariant): string {
    const key = variant === 'original' ? `${alias}.original_storage_key`
      : variant === 'thumbnail' ? `COALESCE(${alias}.thumbnail_storage_key, ${alias}.display_storage_key, ${alias}.original_storage_key)`
        : `COALESCE(${alias}.display_storage_key, ${alias}.original_storage_key)`;
    const mime = variant === 'original' ? `${alias}.mime_type`
      : variant === 'thumbnail' ? `CASE WHEN ${alias}.thumbnail_storage_key IS NOT NULL OR ${alias}.display_storage_key IS NOT NULL THEN 'image/webp' ELSE ${alias}.mime_type END`
        : `CASE WHEN ${alias}.display_storage_key IS NOT NULL THEN 'image/webp' ELSE ${alias}.mime_type END`;
    return `SELECT ${key} AS storage_key, ${mime} AS mime_type FROM gallery_photos ${alias}`;
  }

  private mapSummary(row: GalleryRow): GallerySummaryView {
    return { id: row.id, publicId: row.public_id, title: row.title, description: row.description, visibility: row.visibility,
      status: row.status, publishedAt: row.published_at?.toISOString() ?? null, photoCount: Number(row.photo_count),
      coverPhotoId: row.cover_photo_id, event: { id: row.event_id, title: row.event_title, startsAt: row.starts_at.toISOString(), location: row.location, owner: { id: row.owner_id, name: row.owner_name } },
      updatedAt: row.updated_at.toISOString() };
  }

  private mapPhoto(row: PhotoRow): GalleryPhotoView {
    return { id: row.id, caption: row.caption, altText: row.alt_text, position: row.position, isCover: row.is_cover, processingStatus: row.processing_status, createdAt: row.created_at.toISOString() };
  }

  private mapMedia(row?: MediaRow): GalleryMediaSource | null { return row ? { storageKey: row.storage_key, mimeType: row.mime_type } : null; }
}
