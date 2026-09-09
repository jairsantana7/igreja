import sharp from 'sharp';
import type { GalleryImageProcessor, ProcessedGalleryImage } from '../../application/ports/gallery-image-processor.port';

export class SharpGalleryImageProcessor implements GalleryImageProcessor {
  async process(source: Buffer): Promise<ProcessedGalleryImage> {
    const normalized = sharp(source, { failOn: 'warning' }).rotate();
    const [display, thumbnail] = await Promise.all([
      normalized.clone().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
      normalized.clone().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toBuffer(),
    ]);
    return {
      display: { content: display, mimeType: 'image/webp' },
      thumbnail: { content: thumbnail, mimeType: 'image/webp' },
    };
  }
}
