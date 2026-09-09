import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { GalleryDetails, GalleryPhotoDetails, GalleryStatus, GalleryVisibility } from '../../domain/entities/event-gallery';
import type { StoredMedia } from './media-storage.port';

export interface GalleryEventView { id: string; title: string; startsAt: string; location: string; owner: { id: string; name: string } }
export interface GalleryPhotoView {
  id: string; caption: string; altText: string; position: number; isCover: boolean;
  processingStatus: 'pending' | 'ready' | 'failed'; createdAt: string;
}
export interface GallerySummaryView {
  id: string; publicId: string; title: string; description: string; visibility: GalleryVisibility;
  status: GalleryStatus; publishedAt: string | null; photoCount: number; coverPhotoId: string | null;
  event: GalleryEventView; updatedAt: string;
}
export interface GalleryDetailView extends GallerySummaryView { photos: GalleryPhotoView[] }
export interface SharedGalleryView {
  id: string; publicId: string; communityName: string; title: string; description: string;
  visibility: GalleryVisibility; publishedAt: string | null; event: Omit<GalleryEventView, 'owner'>;
  photos: Array<Pick<GalleryPhotoView, 'id' | 'caption' | 'altText' | 'isCover'>>;
}
export interface PublicGalleryResolution { authenticationRequired?: boolean; gallery?: SharedGalleryView }
export interface GalleryMediaSource extends StoredMedia {}
export interface GalleryStoredPhotoInput extends StoredMedia { caption: string; altText: string }
export interface GalleryRemovedPhoto { storageKeys: string[] }
export interface GalleryProcessingSource { storageKey: string }

export interface EventGalleryRepository {
  list(principal: AuthenticatedPrincipal): Promise<GallerySummaryView[]>;
  eligibleEvents(principal: AuthenticatedPrincipal): Promise<GalleryEventView[]>;
  create(principal: AuthenticatedPrincipal, eventId: string, details: GalleryDetails): Promise<GalleryDetailView | null>;
  detail(principal: AuthenticatedPrincipal, galleryId: string): Promise<GalleryDetailView | null>;
  update(principal: AuthenticatedPrincipal, galleryId: string, details: GalleryDetails): Promise<GalleryDetailView | null>;
  setStatus(principal: AuthenticatedPrincipal, galleryId: string, status: GalleryStatus): Promise<GalleryDetailView | null>;
  addPhotos(principal: AuthenticatedPrincipal, galleryId: string, photos: GalleryStoredPhotoInput[]): Promise<GalleryPhotoView[] | null>;
  updatePhoto(principal: AuthenticatedPrincipal, galleryId: string, photoId: string, details: GalleryPhotoDetails, isCover?: boolean): Promise<GalleryPhotoView | null>;
  reorderPhotos(principal: AuthenticatedPrincipal, galleryId: string, photoIds: string[]): Promise<GalleryPhotoView[] | null>;
  removePhoto(principal: AuthenticatedPrincipal, galleryId: string, photoId: string): Promise<GalleryRemovedPhoto | null>;
  resolveMedia(principal: AuthenticatedPrincipal, galleryId: string, photoId: string, variant: GalleryMediaVariant): Promise<GalleryMediaSource | null>;
  resolveShared(principal: AuthenticatedPrincipal, publicId: string): Promise<SharedGalleryView | null>;
  resolveSharedMedia(principal: AuthenticatedPrincipal, publicId: string, photoId: string, variant: GalleryMediaVariant): Promise<GalleryMediaSource | null>;
  resolvePublic(publicId: string): Promise<PublicGalleryResolution | null>;
  resolvePublicMedia(publicId: string, photoId: string, variant: GalleryMediaVariant): Promise<GalleryMediaSource | null>;
  processingSource(tenantId: string, galleryId: string, photoId: string): Promise<GalleryProcessingSource | null>;
  completeProcessing(tenantId: string, galleryId: string, photoId: string, display: StoredMedia, thumbnail: StoredMedia): Promise<boolean>;
  failProcessing(tenantId: string, galleryId: string, photoId: string): Promise<void>;
}

export type GalleryMediaVariant = 'display' | 'thumbnail' | 'original';
