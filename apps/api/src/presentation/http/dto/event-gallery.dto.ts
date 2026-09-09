import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { GALLERY_STATUSES, GALLERY_VISIBILITIES, type GalleryStatus, type GalleryVisibility } from '../../../domain/entities/event-gallery';

export class CreateGalleryDto {
  @IsUUID('4') eventId!: string;
  @IsString() @Length(3, 160) title!: string;
  @IsOptional() @IsString() @Length(0, 3000) description?: string;
  @IsIn(GALLERY_VISIBILITIES) visibility: GalleryVisibility = 'public';
}

export class UpdateGalleryDto {
  @IsString() @Length(3, 160) title!: string;
  @IsOptional() @IsString() @Length(0, 3000) description?: string;
  @IsIn(GALLERY_VISIBILITIES) visibility: GalleryVisibility = 'public';
}

export class SetGalleryStatusDto {
  @IsIn(GALLERY_STATUSES) status!: GalleryStatus;
}

export class UpdateGalleryPhotoDto {
  @IsOptional() @IsString() @Length(0, 500) caption?: string;
  @IsOptional() @IsString() @Length(0, 180) altText?: string;
  @IsOptional() @IsBoolean() isCover?: boolean;
}

export class ReorderGalleryPhotosDto {
  @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true }) photoIds: string[] = [];
}

export class ReuseGalleryPhotoDto {
  @IsUUID('4') eventId!: string;
}
