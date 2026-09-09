import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MinLength } from 'class-validator';
import { CONVERSATION_REACTION_EMOJIS, type ConversationStatus } from '../../../domain/entities/conversation';

export class CreateConversationChannelDto {
  @IsOptional() @IsUUID('4') ownerUserId?: string;
  @IsString() @Length(2, 63) providerKey!: string;
  @IsString() @Length(2, 80) displayName!: string;
  @IsString() @Length(8, 32) phoneNumber!: string;
  @IsString() @Length(0, 180) providerAccountId = '';
  @IsOptional() @IsString() @Length(3, 128) secretReference?: string;
}

export class CreateConversationDto {
  @IsUUID('4') channelId!: string;
  @IsOptional() @IsUUID('4') eventId?: string;
  @IsOptional() @IsUUID('4') memberUserId?: string;
  @IsString() @Length(2, 120) contactName!: string;
  @IsString() @Length(3, 180) contactAddress!: string;
}

export class ReplyConversationDto {
  @IsString() @Length(1, 10000) body!: string;
  @IsOptional() @IsUUID('4') replyToMessageId?: string;
}

export class ReactConversationMessageDto {
  @IsOptional() @IsIn(CONVERSATION_REACTION_EMOJIS) emoji?: (typeof CONVERSATION_REACTION_EMOJIS)[number];
}

export class SendConversationMediaDto {
  @IsOptional() @IsString() @Length(0, 4000) caption?: string;
  @IsOptional() @IsUUID('4') replyToMessageId?: string;
}

export class CreateMemberFromConversationDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10)
  password!: string;
}

export class UpdateConversationStatusDto {
  @IsIn(['open', 'waiting', 'resolved']) status!: ConversationStatus;
}
