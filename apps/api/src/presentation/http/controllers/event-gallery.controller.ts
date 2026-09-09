import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Res, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { TOKENS } from '../../../application/ports/tokens';
import type {
  CreateGalleryUseCase, DeleteGalleryPhotoUseCase, GetGalleryMediaUseCase, GetGalleryUseCase,
  GetPublicGalleryMediaUseCase, GetPublicGalleryUseCase, GetSharedGalleryMediaUseCase, GetSharedGalleryUseCase,
  ListGalleriesUseCase, ListGalleryEventsUseCase, ReorderGalleryPhotosUseCase, ReuseGalleryPhotoInEventUseCase,
  SetGalleryStatusUseCase, UpdateGalleryPhotoUseCase, UpdateGalleryUseCase, UploadGalleryPhotosUseCase,
} from '../../../application/use-cases/event-gallery.use-cases';
import { MAX_GALLERY_IMAGES_PER_UPLOAD, MAX_GALLERY_IMAGE_SIZE } from '../../../application/use-cases/event-gallery.use-cases';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequireAnyPermission, RequirePermissions } from '../decorators/require-permissions.decorator';
import { CreateGalleryDto, ReorderGalleryPhotosDto, ReuseGalleryPhotoDto, SetGalleryStatusDto, UpdateGalleryDto, UpdateGalleryPhotoDto } from '../dto/event-gallery.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

interface HttpMediaResponse { contentType(type: string): void }

@Controller('galleries')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EventGalleryController {
  constructor(
    @Inject(TOKENS.listGalleriesUseCase) private readonly listGalleries: ListGalleriesUseCase,
    @Inject(TOKENS.listGalleryEventsUseCase) private readonly listEvents: ListGalleryEventsUseCase,
    @Inject(TOKENS.createGalleryUseCase) private readonly createGallery: CreateGalleryUseCase,
    @Inject(TOKENS.getGalleryUseCase) private readonly getGallery: GetGalleryUseCase,
    @Inject(TOKENS.updateGalleryUseCase) private readonly updateGallery: UpdateGalleryUseCase,
    @Inject(TOKENS.setGalleryStatusUseCase) private readonly setStatus: SetGalleryStatusUseCase,
    @Inject(TOKENS.uploadGalleryPhotosUseCase) private readonly uploadPhotos: UploadGalleryPhotosUseCase,
    @Inject(TOKENS.updateGalleryPhotoUseCase) private readonly updatePhoto: UpdateGalleryPhotoUseCase,
    @Inject(TOKENS.reorderGalleryPhotosUseCase) private readonly reorderPhotos: ReorderGalleryPhotosUseCase,
    @Inject(TOKENS.deleteGalleryPhotoUseCase) private readonly deletePhoto: DeleteGalleryPhotoUseCase,
    @Inject(TOKENS.getGalleryMediaUseCase) private readonly getMedia: GetGalleryMediaUseCase,
    @Inject(TOKENS.getSharedGalleryUseCase) private readonly getShared: GetSharedGalleryUseCase,
    @Inject(TOKENS.getSharedGalleryMediaUseCase) private readonly getSharedMedia: GetSharedGalleryMediaUseCase,
    @Inject(TOKENS.reuseGalleryPhotoUseCase) private readonly reusePhoto: ReuseGalleryPhotoInEventUseCase,
  ) {}

  @Get() @RequireAnyPermission(PERMISSIONS.galleriesReadOwn, PERMISSIONS.galleriesReadAll)
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal) { return this.listGalleries.execute(principal); }

  @Get('events') @RequirePermissions(PERMISSIONS.galleriesCreate)
  events(@CurrentPrincipal() principal: AuthenticatedPrincipal) { return this.listEvents.execute(principal); }

  @Get('shared/:publicId') @RequirePermissions(PERMISSIONS.galleriesView)
  shared(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('publicId', new ParseUUIDPipe()) publicId: string) { return this.getShared.execute(principal, publicId); }

  @Get('shared/:publicId/photos/:photoId/:variant') @RequirePermissions(PERMISSIONS.galleriesView)
  async sharedPhoto(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('publicId', new ParseUUIDPipe()) publicId: string,
    @Param('photoId', new ParseUUIDPipe()) photoId: string, @Param('variant') variant: string, @Res({ passthrough: true }) response: HttpMediaResponse) {
    const media = await this.getSharedMedia.execute(principal, publicId, photoId, variant); response.contentType(media.mimeType); return new StreamableFile(media.content);
  }

  @Post() @RequirePermissions(PERMISSIONS.galleriesCreate)
  create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: CreateGalleryDto) { return this.createGallery.execute(principal, dto); }

  @Get(':galleryId') @RequireAnyPermission(PERMISSIONS.galleriesReadOwn, PERMISSIONS.galleriesReadAll)
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('galleryId', new ParseUUIDPipe()) galleryId: string) { return this.getGallery.execute(principal, galleryId); }

  @Put(':galleryId') @RequirePermissions(PERMISSIONS.galleriesUpdate)
  update(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('galleryId', new ParseUUIDPipe()) galleryId: string, @Body() dto: UpdateGalleryDto) { return this.updateGallery.execute(principal, galleryId, dto); }

  @Patch(':galleryId/status') @RequirePermissions(PERMISSIONS.galleriesPublish)
  status(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('galleryId', new ParseUUIDPipe()) galleryId: string, @Body() dto: SetGalleryStatusDto) { return this.setStatus.execute(principal, galleryId, dto.status); }

  @Post(':galleryId/photos') @RequirePermissions(PERMISSIONS.galleriesUpdate)
  @UseInterceptors(FilesInterceptor('images', MAX_GALLERY_IMAGES_PER_UPLOAD, {
    limits: { fileSize: MAX_GALLERY_IMAGE_SIZE },
    fileFilter: (_request, file, callback) => { const allowed = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype); callback(allowed ? null : new BadRequestException('A foto deve estar em JPEG, PNG ou WebP.'), allowed); },
  }))
  upload(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('galleryId', new ParseUUIDPipe()) galleryId: string, @UploadedFiles() files: Express.Multer.File[] = []) {
    return this.uploadPhotos.execute(principal, galleryId, files.map((file) => ({ content: file.buffer, mimeType: file.mimetype })));
  }

  @Put(':galleryId/photos/order') @RequirePermissions(PERMISSIONS.galleriesUpdate)
  reorder(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('galleryId', new ParseUUIDPipe()) galleryId: string, @Body() dto: ReorderGalleryPhotosDto) { return this.reorderPhotos.execute(principal, galleryId, dto.photoIds); }

  @Patch(':galleryId/photos/:photoId') @RequirePermissions(PERMISSIONS.galleriesUpdate)
  photo(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('galleryId', new ParseUUIDPipe()) galleryId: string, @Param('photoId', new ParseUUIDPipe()) photoId: string, @Body() dto: UpdateGalleryPhotoDto) { return this.updatePhoto.execute(principal, galleryId, photoId, dto); }

  @Delete(':galleryId/photos/:photoId') @RequirePermissions(PERMISSIONS.galleriesUpdate)
  @HttpCode(HttpStatus.OK)
  remove(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('galleryId', new ParseUUIDPipe()) galleryId: string, @Param('photoId', new ParseUUIDPipe()) photoId: string) { return this.deletePhoto.execute(principal, galleryId, photoId); }

  @Get(':galleryId/photos/:photoId/:variant') @RequireAnyPermission(PERMISSIONS.galleriesReadOwn, PERMISSIONS.galleriesReadAll)
  async media(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('galleryId', new ParseUUIDPipe()) galleryId: string,
    @Param('photoId', new ParseUUIDPipe()) photoId: string, @Param('variant') variant: string, @Res({ passthrough: true }) response: HttpMediaResponse) {
    const media = await this.getMedia.execute(principal, galleryId, photoId, variant); response.contentType(media.mimeType); return new StreamableFile(media.content);
  }

  @Post(':galleryId/photos/:photoId/reuse') @RequirePermissions(PERMISSIONS.galleriesReuse, PERMISSIONS.eventsUpdate)
  reuse(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('galleryId', new ParseUUIDPipe()) galleryId: string,
    @Param('photoId', new ParseUUIDPipe()) photoId: string, @Body() dto: ReuseGalleryPhotoDto) { return this.reusePhoto.execute(principal, galleryId, photoId, dto.eventId); }
}

@Controller('public/galleries')
export class PublicEventGalleryController {
  constructor(
    @Inject(TOKENS.getPublicGalleryUseCase) private readonly getGallery: GetPublicGalleryUseCase,
    @Inject(TOKENS.getPublicGalleryMediaUseCase) private readonly getMedia: GetPublicGalleryMediaUseCase,
  ) {}

  @Get(':publicId')
  show(@Param('publicId', new ParseUUIDPipe()) publicId: string) { return this.getGallery.execute(publicId); }

  @Get(':publicId/photos/:photoId/:variant')
  @Header('Cache-Control', 'public, max-age=86400, immutable') @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async media(@Param('publicId', new ParseUUIDPipe()) publicId: string, @Param('photoId', new ParseUUIDPipe()) photoId: string,
    @Param('variant') variant: string, @Res({ passthrough: true }) response: HttpMediaResponse) {
    const media = await this.getMedia.execute(publicId, photoId, variant); response.contentType(media.mimeType); return new StreamableFile(media.content);
  }
}
