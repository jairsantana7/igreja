import { IsArray, IsHexColor, IsIn, IsISO8601, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import type { FollowupNoteVisibility } from '../../../domain/entities/pastoral-followup';

export class CreateFollowupFromConversationDto { @IsUUID('4') conversationId!: string; }
export class MoveFollowupDto { @IsUUID('4') stageId!: string; }
export class UpdateFollowupDto {
  @IsOptional() @IsISO8601({ strict: true }) nextActionAt?: string | null;
  @IsArray() @IsUUID('4', { each: true }) tagIds!: string[];
}
export class CreateFollowupStageDto {
  @IsString() @Length(2, 60) name!: string;
  @IsHexColor() color!: string;
}
export class CreateFollowupTagDto {
  @IsString() @Length(2, 40) name!: string;
  @IsHexColor() color!: string;
}
export class AddFollowupNoteDto {
  @IsString() @Length(1, 5000) body!: string;
  @IsIn(['private', 'team']) visibility!: FollowupNoteVisibility;
}
