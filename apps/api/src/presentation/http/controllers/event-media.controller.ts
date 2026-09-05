import { BadRequestException, Controller, Get, Header, Inject, Param, ParseUUIDPipe, Post, Res, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { TOKENS } from '../../../application/ports/tokens';
import { MAX_EVENT_IMAGES_PER_UPLOAD, MAX_EVENT_IMAGE_SIZE, type GetPublicEventMediaUseCase, type UploadEventMediaUseCase } from '../../../application/use-cases/event-media.use-cases';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

interface HttpMediaResponse {
  contentType(type: string): void;
}

@Controller('events')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EventMediaController {
  constructor(@Inject(TOKENS.uploadEventMediaUseCase) private readonly uploadMedia: UploadEventMediaUseCase) {}

  @Post(':eventId/media')
  @RequirePermissions(PERMISSIONS.eventsUpdate)
  @UseInterceptors(FilesInterceptor('images', MAX_EVENT_IMAGES_PER_UPLOAD, {
    limits: { fileSize: MAX_EVENT_IMAGE_SIZE },
    fileFilter: (_request, file, callback) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
      callback(allowed ? null : new BadRequestException('A imagem deve estar em JPEG, PNG ou WebP.'), allowed);
    },
  }))
  upload(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.uploadMedia.execute(principal, eventId, files.map((file) => ({
      content: file.buffer,
      mimeType: file.mimetype,
      altText: '',
    })));
  }
}

@Controller('public/events')
export class PublicEventMediaController {
  constructor(@Inject(TOKENS.getPublicEventMediaUseCase) private readonly getMedia: GetPublicEventMediaUseCase) {}

  @Get(':publicId/media/:mediaId')
  @Header('Cache-Control', 'public, max-age=86400, immutable')
  async show(
    @Param('publicId', new ParseUUIDPipe()) publicId: string,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
    @Res({ passthrough: true }) response: HttpMediaResponse,
  ) {
    const media = await this.getMedia.execute(publicId, mediaId);
    response.contentType(media.mimeType);
    return new StreamableFile(media.content);
  }
}
