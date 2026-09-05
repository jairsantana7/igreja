import type { EventMediaRepository, EventMediaView, PublicEventMediaSource } from '../../application/ports/event-media.port';
import type { StoredMedia } from '../../application/ports/media-storage.port';
import { NotFoundError } from '../../application/use-cases/errors';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { PostgresDatabase } from '../database/postgres.database';

export class PostgresEventMediaRepository implements EventMediaRepository {
  constructor(private readonly database: PostgresDatabase) {}

  addMany(
    principal: AuthenticatedPrincipal,
    eventId: string,
    media: Array<StoredMedia & { altText: string }>,
  ): Promise<EventMediaView[]> {
    return this.database.withTenant(principal, async (client) => {
      const event = await client.query(`
        SELECT id FROM events
        WHERE id = $1 AND ($2::boolean OR created_by_user_id = $3 OR EXISTS (
          SELECT 1 FROM event_collaborators
          WHERE event_collaborators.event_id = events.id AND event_collaborators.user_id = $3
        ))
        FOR UPDATE
      `, [eventId, principal.permissions.includes('events.manage_all'), principal.userId]);
      if (!event.rows[0]) throw new NotFoundError('Evento não encontrado nesta comunidade.');
      const position = await client.query<{ next_position: number }>(`
        SELECT COALESCE(max(position) + 1, 0)::integer AS next_position
        FROM event_media WHERE event_id = $1
      `, [eventId]);
      const inserted: EventMediaView[] = [];
      for (const [index, item] of media.entries()) {
        const result = await client.query<{ id: string; alt_text: string }>(`
          INSERT INTO event_media (tenant_id, event_id, storage_key, mime_type, alt_text, position)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, alt_text
        `, [principal.tenantId, eventId, item.storageKey, item.mimeType, item.altText, position.rows[0]!.next_position + index]);
        inserted.push({ id: result.rows[0]!.id, altText: result.rows[0]!.alt_text });
      }
      return inserted;
    });
  }

  async resolvePublic(publicId: string, mediaId: string): Promise<PublicEventMediaSource | null> {
    const result = await this.database.queryPublic<{ storage_key: string; mime_type: StoredMedia['mimeType'] }>(
      'SELECT storage_key, mime_type FROM app.resolve_public_event_media($1::uuid, $2::uuid)',
      [publicId, mediaId],
    );
    const media = result.rows[0];
    return media ? { storageKey: media.storage_key, mimeType: media.mime_type } : null;
  }
}
