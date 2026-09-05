import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import type { CommunicationTemplateChannel, CommunicationTemplatePurpose, CommunicationTemplateStatus } from '../../../domain/entities/communication-template';

export class SaveCommunicationTemplateDto {
  @IsString() @Length(3, 120) name!: string;
  @IsIn(['registration_confirmation', 'event_reminder', 'event_update', 'event_cancellation', 'post_event']) purpose!: CommunicationTemplatePurpose;
  @IsIn(['email', 'whatsapp']) channel!: CommunicationTemplateChannel;
  @IsString() @Length(0, 160) subject = '';
  @IsString() @Length(1, 5000) body!: string;
}

export class SetCommunicationTemplateStatusDto {
  @IsIn(['draft', 'active', 'archived']) status!: CommunicationTemplateStatus;
}

export class SaveEventReminderDto {
  @IsUUID('4') templateId!: string;
  @IsUUID('4') channelId!: string;
  @IsIn(['confirmed', 'checked_in', 'not_checked_in']) audience!: 'confirmed' | 'checked_in' | 'not_checked_in';
  @Type(() => Number) @IsInt() @Min(15) @Max(43_200) offsetMinutesBefore!: number;
  @IsBoolean() enabled!: boolean;
}
