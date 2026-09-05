import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';
import { FORM_FIELD_TYPES, type FormFieldType } from '../../../domain/entities/event';

export class EventFieldDto {
  @IsOptional()
  @IsString()
  key = '';

  @IsString()
  @Length(2, 120)
  label!: string;

  @IsIn(FORM_FIELD_TYPES)
  type!: FormFieldType;

  @IsBoolean()
  required = false;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  options: string[] = [];
}

export class CreateEventDto {
  @IsString()
  @Length(3, 160)
  title!: string;

  @IsString()
  description = '';

  @IsString()
  location = '';

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  registrationDeadline?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  capacity?: number;

  @IsBoolean()
  publish = false;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => EventFieldDto)
  fields: EventFieldDto[] = [];
}
