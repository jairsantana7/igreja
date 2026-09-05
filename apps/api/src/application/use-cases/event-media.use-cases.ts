import type { EventMediaRepository } from '../ports/event-media.port';
import type { MediaStorage, StoredMedia } from '../ports/media-storage.port';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../domain/entities/permission';
import { DomainError } from '../../domain/entities/errors';
import { AuthorizationError, NotFoundError } from './errors';

const ALLOWED_MIME_TYPES: StoredMedia['mimeType'][] = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_EVENT_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_EVENT_IMAGES_PER_UPLOAD = 10;

function matchesImageSignature(content: Buffer, mimeType: StoredMedia['mimeType']): boolean {
  if (mimeType === 'image/jpeg') return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  if (mimeType === 'image/png') return content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return content.length >= 12 && content.subarray(0, 4).toString('ascii') === 'RIFF' && content.subarray(8, 12).toString('ascii') === 'WEBP';
}

export interface EventImageUpload {
  content: Buffer;
  mimeType: string;
  altText?: string;
}

export class UploadEventMediaUseCase {
  constructor(private readonly repository: EventMediaRepository, private readonly storage: MediaStorage) {}

  async execute(principal: AuthenticatedPrincipal, eventId: string, uploads: EventImageUpload[]) {
    if (!principal.permissions.includes(PERMISSIONS.eventsUpdate)) {
      throw new AuthorizationError('Você não tem permissão para adicionar imagens ao evento.');
    }
    if (uploads.length === 0) throw new DomainError('Envie ao menos uma imagem.');
    if (uploads.length > MAX_EVENT_IMAGES_PER_UPLOAD) throw new DomainError('Envie no máximo 10 imagens por vez.');

    const saved: Array<StoredMedia & { altText: string }> = [];
    try {
      for (const upload of uploads) {
        if (!ALLOWED_MIME_TYPES.includes(upload.mimeType as StoredMedia['mimeType'])) {
          throw new DomainError('A imagem deve estar em JPEG, PNG ou WebP.');
        }
        if (!matchesImageSignature(upload.content, upload.mimeType as StoredMedia['mimeType'])) {
          throw new DomainError('O conteúdo do arquivo não corresponde a uma imagem válida.');
        }
        if (upload.content.length > MAX_EVENT_IMAGE_SIZE) {
          throw new DomainError('Cada imagem pode ter no máximo 5 MiB.');
        }
        const stored = await this.storage.save({
          content: upload.content,
          mimeType: upload.mimeType as StoredMedia['mimeType'],
        });
        saved.push({ ...stored, altText: upload.altText?.trim().slice(0, 180) ?? '' });
      }
      return await this.repository.addMany(principal, eventId, saved);
    } catch (error) {
      await Promise.allSettled(saved.map((item) => this.storage.delete(item.storageKey)));
      throw error;
    }
  }
}

export class GetPublicEventMediaUseCase {
  constructor(private readonly repository: EventMediaRepository, private readonly storage: MediaStorage) {}

  async execute(publicId: string, mediaId: string) {
    const media = await this.repository.resolvePublic(publicId, mediaId);
    if (!media) throw new NotFoundError('Imagem não encontrada para este evento publicado.');
    return { content: await this.storage.read(media.storageKey), mimeType: media.mimeType };
  }
}
