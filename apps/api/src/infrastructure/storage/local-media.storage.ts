import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MediaStorage, StoredMedia } from '../../application/ports/media-storage.port';
import { env } from '../config/env';

const KEY_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
const EXTENSIONS: Record<StoredMedia['mimeType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export class LocalMediaStorage implements MediaStorage {
  async save(input: { content: Buffer; mimeType: StoredMedia['mimeType'] }): Promise<StoredMedia> {
    await mkdir(env.mediaStoragePath, { recursive: true });
    const storageKey = `${randomUUID()}.${EXTENSIONS[input.mimeType]}`;
    await writeFile(this.pathFor(storageKey), input.content, { flag: 'wx' });
    return { storageKey, mimeType: input.mimeType };
  }

  read(storageKey: string): Promise<Buffer> {
    return readFile(this.pathFor(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await unlink(this.pathFor(storageKey));
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  private pathFor(storageKey: string): string {
    if (!KEY_PATTERN.test(storageKey)) throw new Error('Chave de mídia inválida.');
    return join(env.mediaStoragePath, storageKey);
  }
}
