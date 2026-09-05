import { describe, expect, it, vi } from 'vitest';
import type { EventMediaRepository } from '../src/application/ports/event-media.port';
import type { MediaStorage } from '../src/application/ports/media-storage.port';
import { UploadEventMediaUseCase } from '../src/application/use-cases/event-media.use-cases';
import { AuthorizationError } from '../src/application/use-cases/errors';
import type { AuthenticatedPrincipal } from '../src/domain/entities/permission';

const principal = (permissions: AuthenticatedPrincipal['permissions']): AuthenticatedPrincipal => ({
  userId: '10000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000001',
  name: 'Admin',
  email: 'admin@example.test',
  roles: ['admin'],
  permissions,
});

describe('imagens do evento', () => {
  it('exige events.update antes de gravar qualquer arquivo', async () => {
    const save = vi.fn();
    const useCase = new UploadEventMediaUseCase({} as EventMediaRepository, { save } as unknown as MediaStorage);
    await expect(useCase.execute(principal([]), '20000000-0000-4000-8000-000000000001', [{
      content: Buffer.from('imagem'), mimeType: 'image/jpeg',
    }])).rejects.toThrow(AuthorizationError);
    expect(save).not.toHaveBeenCalled();
  });

  it('remove o arquivo salvo quando os metadados não podem ser persistidos', async () => {
    const repository = { addMany: vi.fn().mockRejectedValue(new Error('falha de banco')) } as unknown as EventMediaRepository;
    const storage = {
      save: vi.fn().mockResolvedValue({ storageKey: '10000000-0000-4000-8000-000000000001.jpg', mimeType: 'image/jpeg' }),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as MediaStorage;
    const useCase = new UploadEventMediaUseCase(repository, storage);
    await expect(useCase.execute(principal(['events.update']), '20000000-0000-4000-8000-000000000001', [{
      content: Buffer.from([0xff, 0xd8, 0xff, 0x00]), mimeType: 'image/jpeg',
    }])).rejects.toThrow('falha de banco');
    expect(storage.delete).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001.jpg');
  });

  it('rejeita formatos que não sejam imagem permitida', async () => {
    const save = vi.fn();
    const useCase = new UploadEventMediaUseCase({} as EventMediaRepository, { save } as unknown as MediaStorage);
    await expect(useCase.execute(principal(['events.update']), '20000000-0000-4000-8000-000000000001', [{
      content: Buffer.from('arquivo'), mimeType: 'text/plain',
    }])).rejects.toThrow('JPEG, PNG ou WebP');
    expect(save).not.toHaveBeenCalled();
  });
});
