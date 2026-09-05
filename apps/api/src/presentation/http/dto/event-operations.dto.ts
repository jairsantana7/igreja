import { IsIn, IsString, Length } from 'class-validator';
import type { CommunicationAudience, CommunicationChannel } from '../../../application/ports/event-operations.port';

export class CreateEventCommunicationDto {
  @IsIn(['confirmed', 'checked_in', 'not_checked_in'])
  audience!: CommunicationAudience;

  @IsIn(['email', 'whatsapp'])
  channel!: CommunicationChannel;

  @IsString()
  @Length(0, 160)
  subject = '';

  @IsString()
  @Length(1, 5000)
  message!: string;
}

export class CreateEventTemplateDto {
  @IsString()
  @Length(3, 120)
  name!: string;
}
