import { describe, expect, it, vi } from 'vitest';
import type { EventGalleryRepository, GalleryPhotoView } from '../src/application/ports/event-gallery.port';
import type { JobQueue } from '../src/application/ports/job-queue.port';
import type { MediaStorage } from '../src/application/ports/media-storage.port';
import { SetGalleryStatusUseCase, UploadGalleryPhotosUseCase } from '../src/application/use-cases/event-gallery.use-cases';
import { AuthorizationError } from '../src/application/use-cases/errors';
import { ensureGalleryCanBePublished } from '../src/domain/entities/event-gallery';
import type { AuthenticatedPrincipal } from '../src/domain/entities/permission';
import type { ApplicationLogger } from '../src/application/ports/application-logger.port';

const tenantId = '00000000-0000-4000-8000-000000000001';
const galleryId = '10000000-0000-4000-8000-000000000001';
const photoId = '20000000-0000-4000-8000-000000000001';
const principal = (permissions: AuthenticatedPrincipal['permissions']): AuthenticatedPrincipal => ({
  userId: '30000000-0000-4000-8000-000000000001', tenantId, name: 'Pastor', email: 'pastor@example.test', roles: ['pastor'], permissions,
});
const photo: GalleryPhotoView = { id: photoId, caption: '', altText: '', position: 0, isCover: true, processingStatus: 'pending', createdAt: new Date().toISOString() };
const logger = (): ApplicationLogger => ({ info: vi.fn(), warn: vi.fn(), captureException: vi.fn() });

describe('galerias de eventos', () => {
  it('exige texto alternativo em todas as fotos antes de publicar', () => {
    expect(() => ensureGalleryCanBePublished([])).toThrow('ao menos uma foto');
    expect(() => ensureGalleryCanBePublished([{ altText: '' }])).toThrow('texto alternativo');
    expect(() => ensureGalleryCanBePublished([{ altText: 'Pessoas reunidas no salão' }])).not.toThrow();
  });

  it('não grava arquivos sem galleries.update', async () => {
    const storage = { save: vi.fn() } as unknown as MediaStorage;
    const useCase = new UploadGalleryPhotosUseCase({} as EventGalleryRepository, storage, {} as JobQueue, logger());
    await expect(useCase.execute(principal([]), galleryId, [{ content: Buffer.from([0xff, 0xd8, 0xff]), mimeType: 'image/jpeg' }])).rejects.toThrow(AuthorizationError);
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('preserva o original quando a fila de otimização está indisponível', async () => {
    const repository = {
      addPhotos: vi.fn().mockResolvedValue([photo]), failProcessing: vi.fn().mockResolvedValue(undefined),
    } as unknown as EventGalleryRepository;
    const storage = {
      save: vi.fn().mockResolvedValue({ storageKey: `${photoId}.jpg`, mimeType: 'image/jpeg' }), delete: vi.fn(),
    } as unknown as MediaStorage;
    const queue = { enqueue: vi.fn().mockRejectedValue(new Error('fila indisponível')) } as unknown as JobQueue;
    const appLogger = logger();
    const useCase = new UploadGalleryPhotosUseCase(repository, storage, queue, appLogger);
    await expect(useCase.execute(principal(['galleries.update']), galleryId, [{ content: Buffer.from([0xff, 0xd8, 0xff, 0]), mimeType: 'image/jpeg' }])).resolves.toEqual([photo]);
    expect(repository.failProcessing).toHaveBeenCalledWith(tenantId, galleryId, photoId);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('remove o arquivo se os metadados não forem persistidos', async () => {
    const repository = { addPhotos: vi.fn().mockRejectedValue(new Error('falha de banco')) } as unknown as EventGalleryRepository;
    const storage = { save: vi.fn().mockResolvedValue({ storageKey: `${photoId}.jpg`, mimeType: 'image/jpeg' }), delete: vi.fn().mockResolvedValue(undefined) } as unknown as MediaStorage;
    const useCase = new UploadGalleryPhotosUseCase(repository, storage, {} as JobQueue, logger());
    await expect(useCase.execute(principal(['galleries.update']), galleryId, [{ content: Buffer.from([0xff, 0xd8, 0xff, 0]), mimeType: 'image/jpeg' }])).rejects.toThrow('falha de banco');
    expect(storage.delete).toHaveBeenCalledWith(`${photoId}.jpg`);
  });

  it('publicação valida o estado e a acessibilidade das fotos', async () => {
    const repository = {
      detail: vi.fn().mockResolvedValue({ status: 'draft', photos: [{ altText: '' }] }), setStatus: vi.fn(),
    } as unknown as EventGalleryRepository;
    const useCase = new SetGalleryStatusUseCase(repository);
    await expect(useCase.execute(principal(['galleries.publish']), galleryId, 'published')).rejects.toThrow('texto alternativo');
    expect(repository.setStatus).not.toHaveBeenCalled();
  });
});
