import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { StoredMedia } from './media-storage.port';

export interface EventMediaView {
  id: string;
  altText: string;
}

export interface PublicEventMediaSource extends StoredMedia {}

export interface EventMediaRepository {
  addMany(
    principal: AuthenticatedPrincipal,
    eventId: string,
    media: Array<StoredMedia & { altText: string }>,
  ): Promise<EventMediaView[]>;
  resolvePublic(publicId: string, mediaId: string): Promise<PublicEventMediaSource | null>;
}
