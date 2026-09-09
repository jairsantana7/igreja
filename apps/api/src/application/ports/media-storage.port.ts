export interface StoredMedia {
  storageKey: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'audio/ogg' | 'audio/mpeg' | 'audio/mp4' | 'audio/aac';
}

export interface MediaStorage {
  save(input: { content: Buffer; mimeType: StoredMedia['mimeType'] }): Promise<StoredMedia>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}
