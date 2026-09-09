import { DomainError } from './errors';

export const GALLERY_STATUSES = ['draft', 'published', 'archived'] as const;
export const GALLERY_VISIBILITIES = ['public', 'members_only'] as const;
export type GalleryStatus = (typeof GALLERY_STATUSES)[number];
export type GalleryVisibility = (typeof GALLERY_VISIBILITIES)[number];

export class GalleryDetails {
  private constructor(readonly props: { title: string; description: string; visibility: GalleryVisibility }) {}

  static create(input: { title: string; description?: string; visibility: GalleryVisibility }): GalleryDetails {
    const title = input.title.trim();
    const description = input.description?.trim() ?? '';
    if (title.length < 3 || title.length > 160) throw new DomainError('O título da galeria deve ter entre 3 e 160 caracteres.');
    if (description.length > 3000) throw new DomainError('A descrição da galeria deve ter no máximo 3.000 caracteres.');
    if (!GALLERY_VISIBILITIES.includes(input.visibility)) throw new DomainError('A visibilidade da galeria é inválida.');
    return new GalleryDetails({ title, description, visibility: input.visibility });
  }
}

export class GalleryPhotoDetails {
  private constructor(readonly props: { caption?: string; altText?: string }) {}

  static create(input: { caption?: string; altText?: string }): GalleryPhotoDetails {
    const caption = input.caption?.trim();
    const altText = input.altText?.trim();
    if (caption !== undefined && caption.length > 500) throw new DomainError('A legenda deve ter no máximo 500 caracteres.');
    if (altText !== undefined && altText.length > 180) throw new DomainError('O texto alternativo deve ter no máximo 180 caracteres.');
    return new GalleryPhotoDetails({ caption, altText });
  }
}

export function canTransitionGallery(from: GalleryStatus, to: GalleryStatus): boolean {
  if (from === to) return true;
  if (from === 'draft') return to === 'published' || to === 'archived';
  if (from === 'published') return to === 'draft' || to === 'archived';
  return to === 'draft';
}

export function ensureGalleryCanBePublished(photos: Array<{ altText: string }>): void {
  if (photos.length === 0) throw new DomainError('Adicione ao menos uma foto antes de publicar a galeria.');
  if (photos.some((photo) => !photo.altText.trim())) throw new DomainError('Informe o texto alternativo de todas as fotos antes de publicar.');
}
