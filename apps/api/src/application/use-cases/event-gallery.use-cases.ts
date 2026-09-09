import type { ApplicationLogger } from '../ports/application-logger.port';
import type { EventGalleryRepository, GalleryMediaVariant } from '../ports/event-gallery.port';
import type { GalleryImageProcessor } from '../ports/gallery-image-processor.port';
import type { JobQueue } from '../ports/job-queue.port';
import type { MediaStorage, StoredMedia } from '../ports/media-storage.port';
import type { EventMediaRepository } from '../ports/event-media.port';
import { GalleryDetails, GalleryPhotoDetails, GALLERY_STATUSES, canTransitionGallery, ensureGalleryCanBePublished, type GalleryStatus, type GalleryVisibility } from '../../domain/entities/event-gallery';
import { PERMISSIONS, type AuthenticatedPrincipal, type Permission } from '../../domain/entities/permission';
import { DomainError } from '../../domain/entities/errors';
import { AuthorizationError, ConflictError, NotFoundError } from './errors';

const ALLOWED_TYPES: StoredMedia['mimeType'][] = ['image/jpeg', 'image/png', 'image/webp'];
const GALLERY_VARIANTS: GalleryMediaVariant[] = ['display', 'thumbnail', 'original'];
export const MAX_GALLERY_IMAGE_SIZE = 10 * 1024 * 1024;
export const MAX_GALLERY_IMAGES_PER_UPLOAD = 20;

function requirePermission(principal: AuthenticatedPrincipal, permission: Permission): void {
  if (!principal.permissions.includes(permission)) throw new AuthorizationError('Você não tem permissão para realizar esta ação.');
}

function requireRead(principal: AuthenticatedPrincipal): void {
  if (!principal.permissions.includes(PERMISSIONS.galleriesReadOwn) && !principal.permissions.includes(PERMISSIONS.galleriesReadAll)) {
    throw new AuthorizationError('Você não tem acesso à gestão de galerias.');
  }
}

function validateVariant(variant: string): GalleryMediaVariant {
  if (!GALLERY_VARIANTS.includes(variant as GalleryMediaVariant)) throw new NotFoundError('Versão da imagem não encontrada.');
  return variant as GalleryMediaVariant;
}

function matchesSignature(content: Buffer, mimeType: StoredMedia['mimeType']): boolean {
  if (mimeType === 'image/jpeg') return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  if (mimeType === 'image/png') return content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return mimeType === 'image/webp' && content.length >= 12 && content.subarray(0, 4).toString('ascii') === 'RIFF' && content.subarray(8, 12).toString('ascii') === 'WEBP';
}

export class ListGalleriesUseCase {
  constructor(private readonly galleries: EventGalleryRepository) {}
  execute(principal: AuthenticatedPrincipal) { requireRead(principal); return this.galleries.list(principal); }
}

export class ListGalleryEventsUseCase {
  constructor(private readonly galleries: EventGalleryRepository) {}
  execute(principal: AuthenticatedPrincipal) { requirePermission(principal, PERMISSIONS.galleriesCreate); return this.galleries.eligibleEvents(principal); }
}

export class CreateGalleryUseCase {
  constructor(private readonly galleries: EventGalleryRepository) {}
  async execute(principal: AuthenticatedPrincipal, input: { eventId: string; title: string; description?: string; visibility: GalleryVisibility }) {
    requirePermission(principal, PERMISSIONS.galleriesCreate);
    const gallery = await this.galleries.create(principal, input.eventId, GalleryDetails.create(input));
    if (!gallery) throw new NotFoundError('Evento concluído não encontrado ou sem acesso.');
    return gallery;
  }
}

export class GetGalleryUseCase {
  constructor(private readonly galleries: EventGalleryRepository) {}
  async execute(principal: AuthenticatedPrincipal, galleryId: string) {
    requireRead(principal);
    const gallery = await this.galleries.detail(principal, galleryId);
    if (!gallery) throw new NotFoundError('Galeria não encontrada ou sem acesso.');
    return gallery;
  }
}

export class UpdateGalleryUseCase {
  constructor(private readonly galleries: EventGalleryRepository) {}
  async execute(principal: AuthenticatedPrincipal, galleryId: string, input: { title: string; description?: string; visibility: GalleryVisibility }) {
    requirePermission(principal, PERMISSIONS.galleriesUpdate);
    const gallery = await this.galleries.update(principal, galleryId, GalleryDetails.create(input));
    if (!gallery) throw new NotFoundError('Galeria não encontrada ou sem acesso.');
    return gallery;
  }
}

export class SetGalleryStatusUseCase {
  constructor(private readonly galleries: EventGalleryRepository) {}
  async execute(principal: AuthenticatedPrincipal, galleryId: string, status: GalleryStatus) {
    requirePermission(principal, PERMISSIONS.galleriesPublish);
    if (!GALLERY_STATUSES.includes(status)) throw new DomainError('O status da galeria é inválido.');
    const current = await this.galleries.detail(principal, galleryId);
    if (!current) throw new NotFoundError('Galeria não encontrada ou sem acesso.');
    if (!canTransitionGallery(current.status, status)) throw new ConflictError('Essa mudança de status não é permitida para a galeria.');
    if (status === 'published') ensureGalleryCanBePublished(current.photos);
    const gallery = await this.galleries.setStatus(principal, galleryId, status);
    if (!gallery) throw new NotFoundError('Galeria não encontrada ou sem acesso.');
    return gallery;
  }
}

export interface GalleryImageUpload { content: Buffer; mimeType: string }

export class UploadGalleryPhotosUseCase {
  constructor(
    private readonly galleries: EventGalleryRepository,
    private readonly storage: MediaStorage,
    private readonly queue: JobQueue,
    private readonly logger: ApplicationLogger,
  ) {}

  async execute(principal: AuthenticatedPrincipal, galleryId: string, uploads: GalleryImageUpload[]) {
    requirePermission(principal, PERMISSIONS.galleriesUpdate);
    if (uploads.length === 0) throw new DomainError('Envie ao menos uma imagem.');
    if (uploads.length > MAX_GALLERY_IMAGES_PER_UPLOAD) throw new DomainError('Envie no máximo 20 imagens por vez.');
    for (const upload of uploads) {
      if (!ALLOWED_TYPES.includes(upload.mimeType as StoredMedia['mimeType'])) throw new DomainError('As fotos devem estar em JPEG, PNG ou WebP.');
      if (upload.content.length > MAX_GALLERY_IMAGE_SIZE) throw new DomainError('Cada foto pode ter no máximo 10 MiB.');
      if (!matchesSignature(upload.content, upload.mimeType as StoredMedia['mimeType'])) throw new DomainError('O conteúdo de um arquivo não corresponde a uma imagem válida.');
    }

    const stored: StoredMedia[] = [];
    let persisted = false;
    try {
      for (const upload of uploads) stored.push(await this.storage.save({ content: upload.content, mimeType: upload.mimeType as StoredMedia['mimeType'] }));
      const photos = await this.galleries.addPhotos(principal, galleryId, stored.map((item) => ({ ...item, caption: '', altText: '' })));
      if (!photos) throw new NotFoundError('Galeria não encontrada ou sem acesso.');
      persisted = true;
      await Promise.all(photos.map(async (photo) => {
        try {
          await this.queue.enqueue({
            name: 'galleries.photo.optimize',
            payload: { tenantId: principal.tenantId, galleryId, photoId: photo.id },
            deduplicationKey: `gallery-photo-${photo.id}`,
          }, { attempts: 3 });
        } catch (error) {
          await this.galleries.failProcessing(principal.tenantId, galleryId, photo.id).catch(() => undefined);
          this.logger.warn('gallery_photo_optimization_not_queued', { galleryId, photoId: photo.id, errorType: error instanceof Error ? error.name : 'UnknownError' });
        }
      }));
      return photos;
    } catch (error) {
      if (!persisted) await Promise.allSettled(stored.map((item) => this.storage.delete(item.storageKey)));
      throw error;
    }
  }
}

export class UpdateGalleryPhotoUseCase {
  constructor(private readonly galleries: EventGalleryRepository) {}
  async execute(principal: AuthenticatedPrincipal, galleryId: string, photoId: string, input: { caption?: string; altText?: string; isCover?: boolean }) {
    requirePermission(principal, PERMISSIONS.galleriesUpdate);
    const photo = await this.galleries.updatePhoto(principal, galleryId, photoId, GalleryPhotoDetails.create(input), input.isCover);
    if (!photo) throw new NotFoundError('Foto não encontrada ou sem acesso.');
    return photo;
  }
}

export class ReorderGalleryPhotosUseCase {
  constructor(private readonly galleries: EventGalleryRepository) {}
  async execute(principal: AuthenticatedPrincipal, galleryId: string, photoIds: string[]) {
    requirePermission(principal, PERMISSIONS.galleriesUpdate);
    if (photoIds.length !== new Set(photoIds).size || photoIds.length > 200) throw new DomainError('A ordem das fotos é inválida.');
    const photos = await this.galleries.reorderPhotos(principal, galleryId, photoIds);
    if (!photos) throw new NotFoundError('Galeria ou foto não encontrada ou sem acesso.');
    return photos;
  }
}

export class DeleteGalleryPhotoUseCase {
  constructor(private readonly galleries: EventGalleryRepository, private readonly storage: MediaStorage) {}
  async execute(principal: AuthenticatedPrincipal, galleryId: string, photoId: string) {
    requirePermission(principal, PERMISSIONS.galleriesUpdate);
    const removed = await this.galleries.removePhoto(principal, galleryId, photoId);
    if (!removed) throw new NotFoundError('Foto não encontrada ou sem acesso.');
    await Promise.allSettled(removed.storageKeys.map((key) => this.storage.delete(key)));
    return { removed: true };
  }
}

export class GetGalleryMediaUseCase {
  constructor(private readonly galleries: EventGalleryRepository, private readonly storage: MediaStorage) {}
  async execute(principal: AuthenticatedPrincipal, galleryId: string, photoId: string, variant: string) {
    requireRead(principal);
    const media = await this.galleries.resolveMedia(principal, galleryId, photoId, validateVariant(variant));
    if (!media) throw new NotFoundError('Imagem não encontrada ou sem acesso.');
    return { content: await this.storage.read(media.storageKey), mimeType: media.mimeType };
  }
}

export class GetSharedGalleryUseCase {
  constructor(private readonly galleries: EventGalleryRepository) {}
  async execute(principal: AuthenticatedPrincipal, publicId: string) {
    requirePermission(principal, PERMISSIONS.galleriesView);
    const gallery = await this.galleries.resolveShared(principal, publicId);
    if (!gallery) throw new NotFoundError('Galeria publicada não encontrada nesta comunidade.');
    return gallery;
  }
}

export class GetSharedGalleryMediaUseCase {
  constructor(private readonly galleries: EventGalleryRepository, private readonly storage: MediaStorage) {}
  async execute(principal: AuthenticatedPrincipal, publicId: string, photoId: string, variant: string) {
    requirePermission(principal, PERMISSIONS.galleriesView);
    const media = await this.galleries.resolveSharedMedia(principal, publicId, photoId, validateVariant(variant));
    if (!media) throw new NotFoundError('Imagem publicada não encontrada nesta comunidade.');
    return { content: await this.storage.read(media.storageKey), mimeType: media.mimeType };
  }
}

export class GetPublicGalleryUseCase {
  constructor(private readonly galleries: EventGalleryRepository) {}
  async execute(publicId: string) {
    const resolution = await this.galleries.resolvePublic(publicId);
    if (!resolution) throw new NotFoundError('Galeria não encontrada ou ainda não publicada.');
    if (resolution.authenticationRequired) throw new AuthorizationError('Esta galeria é exclusiva para membros da comunidade.');
    if (!resolution.gallery) throw new NotFoundError('Galeria não encontrada ou ainda não publicada.');
    return resolution.gallery;
  }
}

export class GetPublicGalleryMediaUseCase {
  constructor(private readonly galleries: EventGalleryRepository, private readonly storage: MediaStorage) {}
  async execute(publicId: string, photoId: string, variant: string) {
    const media = await this.galleries.resolvePublicMedia(publicId, photoId, validateVariant(variant));
    if (!media) throw new NotFoundError('Imagem não encontrada nesta galeria pública.');
    return { content: await this.storage.read(media.storageKey), mimeType: media.mimeType };
  }
}

export class ReuseGalleryPhotoInEventUseCase {
  constructor(private readonly galleries: EventGalleryRepository, private readonly eventMedia: EventMediaRepository, private readonly storage: MediaStorage) {}
  async execute(principal: AuthenticatedPrincipal, galleryId: string, photoId: string, eventId: string) {
    requirePermission(principal, PERMISSIONS.galleriesReuse);
    requirePermission(principal, PERMISSIONS.eventsUpdate);
    const source = await this.galleries.resolveMedia(principal, galleryId, photoId, 'original');
    if (!source) throw new NotFoundError('Foto não encontrada ou sem acesso.');
    const copied = await this.storage.save({ content: await this.storage.read(source.storageKey), mimeType: source.mimeType });
    try {
      return await this.eventMedia.addMany(principal, eventId, [{ ...copied, altText: '' }]);
    } catch (error) {
      await this.storage.delete(copied.storageKey);
      throw error;
    }
  }
}

export class ProcessGalleryPhotoUseCase {
  constructor(private readonly galleries: EventGalleryRepository, private readonly storage: MediaStorage, private readonly processor: GalleryImageProcessor) {}
  async execute(tenantId: string, galleryId: string, photoId: string) {
    const source = await this.galleries.processingSource(tenantId, galleryId, photoId);
    if (!source) return { skipped: true };
    const generated: StoredMedia[] = [];
    try {
      const processed = await this.processor.process(await this.storage.read(source.storageKey));
      const display = await this.storage.save(processed.display); generated.push(display);
      const thumbnail = await this.storage.save(processed.thumbnail); generated.push(thumbnail);
      const completed = await this.galleries.completeProcessing(tenantId, galleryId, photoId, display, thumbnail);
      if (!completed) await Promise.allSettled(generated.map((item) => this.storage.delete(item.storageKey)));
      return { skipped: !completed };
    } catch (error) {
      await Promise.allSettled(generated.map((item) => this.storage.delete(item.storageKey)));
      await this.galleries.failProcessing(tenantId, galleryId, photoId);
      throw error;
    }
  }
}
