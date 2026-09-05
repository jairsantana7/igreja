import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import type { AuditEventView } from '../../../application/ports/audit-trail.port';

export class ListAuditEventsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsUUID('4')
  eventId?: string;

  @IsOptional()
  @IsIn(['created', 'updated', 'deleted'])
  action?: AuditEventView['action'];

  @IsOptional()
  @IsString()
  @Length(1, 256)
  cursor?: string;
}
