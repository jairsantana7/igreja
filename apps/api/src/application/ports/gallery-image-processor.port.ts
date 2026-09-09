export interface ProcessedGalleryImage {
  display: { content: Buffer; mimeType: 'image/webp' };
  thumbnail: { content: Buffer; mimeType: 'image/webp' };
}

export interface GalleryImageProcessor {
  process(content: Buffer): Promise<ProcessedGalleryImage>;
}
